#!/usr/bin/env python3
"""
Mission Control v1 - Dashboard for Jonathan
Simple Flask server serving a real-time dashboard
"""

import json
import os
import glob
import shutil
import sqlite3
import subprocess
import psutil
import time
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, render_template, jsonify, request, redirect
import requests
import re
from urllib.parse import quote

app = Flask(__name__)

# Configuration
GATEWAY_TOKEN = "2306cfed437022f822d3830b3347fc2ab154abc32a3f0e03"
GATEWAY_URL = "http://127.0.0.1:18789"
EMMA_GATEWAY_URL = "http://127.0.0.1:18790"
TRADING_DIR = "/Users/bill/.openclaw/workspace/trading"
REMINDERS_FILE = "/Users/bill/.openclaw/workspace/REMINDERS.md"
MESSAGE_CENTER_DB = os.path.join(os.path.dirname(__file__), 'data', 'mission-control.db')
LOGS_DIR = "/Users/bill/.openclaw/workspace/logs"
MESSAGE_TIMELINE_FILE_PATTERNS = ("*.jsonl", "*.log", "*.out", "*.err")
TASK_TRACKER_FILE = "/Users/bill/.openclaw/workspace/TASK_TRACKER.md"
SENTINEL_STATE_FILE = "/Users/bill/.openclaw/workspace/ops/sentinel-state.json"
SENTINEL_REVIEWS_FILE = "/Users/bill/.openclaw/workspace/audits/sentinel-reviews.md"

DISCORD_CHANNEL_MAP = {
    "1475879552633802966": "#general",
    "1475882688559845541": "#inbox",
    "1475959678000435232": "#notifications",
    "1475959689186381879": "#ideas",
    "1475882685237952633": "#war-room",
    "1475959677081616426": "#command-center",
    "1476605451536699413": "#ops-errors",
    "1475882689876852918": "#infrastructure",
    "1475959678721593466": "#phoenix-strategy",
    "1475959681464664108": "#phoenix-ops",
    "1475882687754670153": "#research-center",
    "1476382717154431190": "#competitive-intel",
    "1475882686840311982": "#trading-floor",
    "1475959687861108907": "#trading-systems",
    "1475882685573365953": "#content-lab",
    "1476382718240624670": "#trending-content",
    "1476382719045800038": "#content-research",
    "1476382719905759453": "#scripts",
    "1476382720950140950": "#visuals",
    "1477754510863630548": "#ventures",
    "1477754523643805971": "#agent-lab",
    "1478038599181275177": "#bill-direct",
}

VALID_MESSAGE_SOURCES = {'agent', 'job'}
VALID_MESSAGE_LEVELS = {'info', 'warn', 'error'}
VALID_MESSAGE_KINDS = {
    'delivery_attempt',
    'delivery_success',
    'delivery_failure',
    'rate_limit',
    'content_output',
}

MAX_MESSAGE_CHANNEL_LEN = 255
MAX_MESSAGE_TITLE_LEN = 255
MAX_MESSAGE_BODY_LEN = 10000
MAX_MESSAGE_META_JSON_LEN = 20000

_message_center_db_initialized = False
RUN_ID_RE = re.compile(r'runId=([^\s]+)')
AGENT_RE = re.compile(r'\[agent/([^\]]+)\]')

# Known bot patterns for process detection
BOT_PATTERNS = {
    "polymarket-bot-v2": ["run_bot.py", "v2"],
    "prediction-scanner": ["main_scanner.py"],
    "pairs-trader": ["paper_trader.py", "pairs-trading"],
    "ict-scanner-v2": ["ict_scanner.py"],
    "webhook-server": ["server.py", "webhook"],
    "trader-monitor": ["monitor.js", "trader-monitor"]
}

# Infrastructure monitoring cache
_phoenix_cache = {
    'data': None,
    'timestamp': 0,
    'ttl': 60  # 60 seconds
}

def _backup_db_before_migration(db_path):
    """Create a .bak copy of sqlite db before migrations."""
    if os.path.exists(db_path):
        shutil.copy2(db_path, db_path + '.bak')

def _get_message_center_connection():
    conn = sqlite3.connect(MESSAGE_CENTER_DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_message_center_db():
    """Initialize sqlite db and run message_events migration."""
    os.makedirs(os.path.dirname(MESSAGE_CENTER_DB), exist_ok=True)
    _backup_db_before_migration(MESSAGE_CENTER_DB)

    conn = _get_message_center_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS message_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                source TEXT NOT NULL,
                level TEXT NOT NULL,
                channel TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT NOT NULL,
                meta_json TEXT
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def init_approvals_db():
    os.makedirs(os.path.dirname(MESSAGE_CENTER_DB), exist_ok=True)
    _backup_db_before_migration(MESSAGE_CENTER_DB)
    conn = _get_message_center_connection()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS approvals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT DEFAULT '',
                submitted_by TEXT DEFAULT '',
                status TEXT DEFAULT 'pending',
                reply_text TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                resolved_at TEXT
            )
            """
        )
        conn.commit()
    finally:
        conn.close()

def _ensure_message_center_db():
    global _message_center_db_initialized
    if not _message_center_db_initialized:
        init_message_center_db()
        _message_center_db_initialized = True

def _normalize_message_event_payload(payload):
    """Validate and normalize incoming message-event payload."""
    if not isinstance(payload, dict):
        return None, "JSON object body is required", False

    source = payload.get('source')
    level = payload.get('level')
    channel = payload.get('channel')
    kind = payload.get('kind')
    title = payload.get('title')
    body = payload.get('body', '')
    meta_json = payload.get('meta_json')

    if source not in VALID_MESSAGE_SOURCES:
        return None, f"source must be one of {sorted(VALID_MESSAGE_SOURCES)}", False
    if level not in VALID_MESSAGE_LEVELS:
        return None, f"level must be one of {sorted(VALID_MESSAGE_LEVELS)}", False
    if kind not in VALID_MESSAGE_KINDS:
        return None, f"kind must be one of {sorted(VALID_MESSAGE_KINDS)}", False

    if not isinstance(channel, str) or not channel.strip():
        return None, "channel must be a non-empty string", False
    channel = channel.strip()
    if len(channel) > MAX_MESSAGE_CHANNEL_LEN:
        return None, f"channel max length is {MAX_MESSAGE_CHANNEL_LEN}", False

    if not isinstance(title, str) or not title.strip():
        return None, "title must be a non-empty string", False
    title = title.strip()
    if len(title) > MAX_MESSAGE_TITLE_LEN:
        return None, f"title max length is {MAX_MESSAGE_TITLE_LEN}", False

    if not isinstance(body, str):
        return None, "body must be a string", False
    body_was_truncated = len(body) > MAX_MESSAGE_BODY_LEN
    if body_was_truncated:
        body = body[:MAX_MESSAGE_BODY_LEN]

    meta_json_str = None
    if meta_json is not None:
        if isinstance(meta_json, str):
            try:
                json.loads(meta_json)
            except json.JSONDecodeError:
                return None, "meta_json string must be valid JSON", False
            meta_json_str = meta_json
        elif isinstance(meta_json, (dict, list)):
            meta_json_str = json.dumps(meta_json)
        else:
            return None, "meta_json must be object, array, JSON string, or null", False

        if len(meta_json_str) > MAX_MESSAGE_META_JSON_LEN:
            return None, f"meta_json max length is {MAX_MESSAGE_META_JSON_LEN}", False

    return {
        "created_at": datetime.now().isoformat(),
        "source": source,
        "level": level,
        "channel": channel,
        "kind": kind,
        "title": title,
        "body": body,
        "meta_json": meta_json_str
    }, None, body_was_truncated

def _serialize_message_event_row(row):
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "source": row["source"],
        "level": row["level"],
        "channel": row["channel"],
        "kind": row["kind"],
        "title": row["title"],
        "body": row["body"],
        "meta_json": row["meta_json"],
    }

def log_message_event(source, level, channel, kind, title, body="", meta_json=None):
    """Helper for endpoints/jobs to write a message event."""
    normalized, error, _ = _normalize_message_event_payload({
        "source": source,
        "level": level,
        "channel": channel,
        "kind": kind,
        "title": title,
        "body": body,
        "meta_json": meta_json,
    })
    if error:
        raise ValueError(error)

    _ensure_message_center_db()
    conn = _get_message_center_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO message_events
            (created_at, source, level, channel, kind, title, body, meta_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized["created_at"],
                normalized["source"],
                normalized["level"],
                normalized["channel"],
                normalized["kind"],
                normalized["title"],
                normalized["body"],
                normalized["meta_json"],
            )
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM message_events WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()
        return _serialize_message_event_row(row)
    finally:
        conn.close()

def _parse_iso_timestamp(value):
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    if not text:
        return None
    if text.endswith('Z'):
        text = text[:-1] + '+00:00'
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None

def _parse_bracket_timestamp(line):
    # Supports formats like [2026-02-26 09:25:02]
    if not line.startswith('['):
        return None
    end = line.find(']')
    if end == -1:
        return None
    raw = line[1:end]
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None

def _extract_agent_and_run(raw_text):
    if not raw_text:
        return "", ""

    agent_match = AGENT_RE.search(raw_text)
    run_match = RUN_ID_RE.search(raw_text)

    agent_name = agent_match.group(1) if agent_match else ""
    run_id = run_match.group(1) if run_match else ""

    return agent_name, run_id

def _extract_discord_url(entry, meta_obj):
    if isinstance(meta_obj, dict):
        direct_fields = (
            "discord_url",
            "discordUrl",
            "jump_url",
            "message_url",
            "messageUrl",
            "url",
            "link",
        )
        for field in direct_fields:
            value = meta_obj.get(field)
            if isinstance(value, str) and "discord.com/channels/" in value:
                return value

        guild_id = meta_obj.get("guild_id") or meta_obj.get("guildId")
        channel_id = meta_obj.get("discord_channel_id") or meta_obj.get("channel_id") or meta_obj.get("channelId")
        message_id = meta_obj.get("discord_message_id") or meta_obj.get("message_id") or meta_obj.get("messageId")
        if guild_id and channel_id and message_id:
            return f"https://discord.com/channels/{guild_id}/{channel_id}/{message_id}"

    for field in ("discord_url", "discordUrl", "message_url", "messageUrl", "url", "link"):
        value = entry.get(field)
        if isinstance(value, str) and "discord.com/channels/" in value:
            return value

    return ""

def _infer_delivery_status(level, kind, title, body, error_text):
    kind = (kind or "").lower()
    level = (level or "").lower()
    haystack = " ".join([kind, title or "", body or "", error_text or ""]).lower()

    if "rate_limit" in kind or "rate limit" in haystack or "rate-limited" in haystack:
        return "rate_limited"
    if "delivery_success" in kind or "delivered" in haystack or "sent successfully" in haystack:
        return "delivered"
    if "delivery_failure" in kind or level == "error" or "failed" in haystack or "error" in haystack:
        return "failed"
    return "unknown"

def _normalize_message_timeline_entry(entry, *, source, file_name="", message_event_id=None):
    timestamp = (
        entry.get("timestamp")
        or entry.get("created_at")
        or entry.get("time")
        or entry.get("datetime")
    )
    ts_obj = _parse_iso_timestamp(timestamp)

    raw_text = entry.get("raw", "")
    agent_from_raw, run_from_raw = _extract_agent_and_run(raw_text)
    agent = entry.get("agent") or entry.get("agent_name") or agent_from_raw or entry.get("to") or ""
    run_id = entry.get("run_id") or entry.get("runId") or run_from_raw or ""
    level = str(entry.get("level", "info")).lower()
    channel = (
        entry.get("channel")
        or entry.get("sinkChannel")
        or entry.get("channel_name")
        or ("discord" if "discord" in raw_text.lower() else "")
        or "unknown"
    )
    kind = entry.get("kind", "")
    title = entry.get("title") or entry.get("message") or (f"{source} event")
    body = entry.get("body") or ""
    error_text = entry.get("error") or ""

    meta_obj = None
    meta_raw = entry.get("meta_json")
    if isinstance(meta_raw, str) and meta_raw.strip():
        try:
            meta_obj = json.loads(meta_raw)
        except json.JSONDecodeError:
            meta_obj = {"_raw": meta_raw}
    elif isinstance(meta_raw, (dict, list)):
        meta_obj = meta_raw

    discord_url = _extract_discord_url(entry, meta_obj)
    delivery_status = (
        str(entry.get("delivery_status", "")).strip().lower()
        or _infer_delivery_status(level, kind, title, body, error_text)
    )

    raw_id = entry.get("id") or message_event_id or f"{source}:{file_name}:{title}:{timestamp}"
    timeline_id = str(raw_id)
    mc_path = f"/messages?entry={quote(timeline_id, safe='')}"

    return {
        "id": timeline_id,
        "source": source,
        "file_name": file_name,
        "timestamp": timestamp,
        "timestamp_epoch": ts_obj.timestamp() if ts_obj else 0,
        "channel": channel,
        "agent": agent,
        "run_id": run_id,
        "level": level,
        "kind": kind,
        "title": title,
        "body": body,
        "error": error_text,
        "delivery_status": delivery_status,
        "discord_url": discord_url,
        "mc_path": mc_path,
        "meta_json": meta_obj,
        "raw": raw_text,
    }

# Simple in-memory cache to avoid re-parsing all logs on every UI refresh.
_MESSAGE_LOG_CACHE = {
    "ts": 0.0,
    "latest_mtime": 0.0,
    "entries": [],
}


def _read_message_log_files():
    entries = []
    if not os.path.isdir(LOGS_DIR):
        return entries

    file_paths = []
    for pattern in MESSAGE_TIMELINE_FILE_PATTERNS:
        file_paths.extend(glob.glob(os.path.join(LOGS_DIR, pattern)))

    # Deduplicate while preserving order.
    seen_files = set()
    unique_paths = []
    for file_path in sorted(file_paths):
        if file_path not in seen_files:
            seen_files.add(file_path)
            unique_paths.append(file_path)

    # Cache key: newest mtime among candidate files.
    latest_mtime = 0.0
    for file_path in unique_paths:
        try:
            latest_mtime = max(latest_mtime, os.path.getmtime(file_path))
        except OSError:
            continue

    now_ts = time.time()
    cache = _MESSAGE_LOG_CACHE
    if cache["entries"] and cache["latest_mtime"] == latest_mtime and (now_ts - cache["ts"]) < 5:
        return cache["entries"]

    for file_path in unique_paths:
        file_name = os.path.basename(file_path)
        if file_name == "ops-errors-processed.log":
            continue
        lower_name = file_name.lower()
        if not file_name.endswith(".jsonl"):
            message_like = any(token in lower_name for token in ("ops", "message", "discord", "telegram", "alert", "event"))
            if not message_like:
                continue
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as handle:
                for index, raw_line in enumerate(handle):
                    line = raw_line.strip()
                    if not line:
                        continue

                    if file_name.endswith(".jsonl"):
                        try:
                            payload = json.loads(line)
                            if isinstance(payload, dict):
                                entries.append(_normalize_message_timeline_entry(payload, source="log", file_name=file_name))
                            else:
                                entries.append(_normalize_message_timeline_entry({
                                    "id": f"{file_name}:{index}",
                                    "message": str(payload),
                                    "level": "info",
                                }, source="log", file_name=file_name))
                        except json.JSONDecodeError:
                            # Fall back to plaintext parse for malformed lines.
                            pass
                        continue

                    ts_obj = _parse_bracket_timestamp(line)
                    level = "info"
                    lower_line = line.lower()
                    if "error" in lower_line:
                        level = "error"
                    elif "warn" in lower_line:
                        level = "warn"

                    entries.append(_normalize_message_timeline_entry({
                        "id": f"{file_name}:{index}",
                        "timestamp": ts_obj.isoformat() if ts_obj else "",
                        "level": level,
                        "message": line,
                        "body": line,
                    }, source="log", file_name=file_name))
        except OSError:
            continue

    _MESSAGE_LOG_CACHE["ts"] = now_ts
    _MESSAGE_LOG_CACHE["latest_mtime"] = latest_mtime
    _MESSAGE_LOG_CACHE["entries"] = entries

    return entries

def _read_db_message_entries():
    _ensure_message_center_db()
    conn = _get_message_center_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM message_events ORDER BY created_at DESC, id DESC LIMIT 500"
        ).fetchall()
    finally:
        conn.close()

    entries = []
    for row in rows:
        serialized = _serialize_message_event_row(row)
        serialized["id"] = f"db:{serialized['id']}"
        entries.append(_normalize_message_timeline_entry(serialized, source="db", file_name="message_events", message_event_id=serialized["id"]))
    return entries

def _build_message_timeline(limit=200, channel="", agent="", run_id="", level="", delivery_status=""):
    entries = _read_db_message_entries() + _read_message_log_files()

    def matches(entry):
        if channel and channel.lower() not in str(entry.get("channel", "")).lower():
            return False
        if agent and agent.lower() not in str(entry.get("agent", "")).lower():
            return False
        if run_id and run_id.lower() not in str(entry.get("run_id", "")).lower():
            return False
        if level and entry.get("level", "") != level:
            return False
        if delivery_status and entry.get("delivery_status", "") != delivery_status:
            return False
        return True

    filtered = [entry for entry in entries if matches(entry)]
    filtered.sort(key=lambda item: (item.get("timestamp_epoch", 0), item.get("id", "")), reverse=True)
    return filtered[:limit]

def get_bot_status():
    """Check status of all trading bots using process patterns"""
    bots = []
    
    try:
        # Get all Python processes
        result = subprocess.run(['ps', 'aux'], capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            return [{"name": "error", "status": "down", "pid": None, "uptime": None, "error": "Failed to get process list"}]
        
        processes = result.stdout.split('\n')
        python_processes = []
        
        for line in processes:
            if ('python' in line.lower() or 'node' in line.lower()) and 'grep' not in line:
                python_processes.append(line)
        
        # Check each known bot pattern
        for bot_name, patterns in BOT_PATTERNS.items():
            bot_info = {
                "name": bot_name,
                "status": "stopped",
                "pid": None,
                "uptime": None
            }
            
            # Find matching process
            for proc_line in python_processes:
                if all(pattern in proc_line for pattern in patterns):
                    try:
                        # Extract PID and create time
                        parts = proc_line.split()
                        pid = int(parts[1])
                        
                        if psutil.pid_exists(pid):
                            proc = psutil.Process(pid)
                            if proc.is_running():
                                bot_info["status"] = "running"
                                bot_info["pid"] = pid
                                # Calculate uptime
                                create_time = datetime.fromtimestamp(proc.create_time())
                                uptime = datetime.now() - create_time
                                bot_info["uptime"] = str(uptime).split('.')[0]  # Remove microseconds
                                break
                    except (ValueError, IndexError, psutil.NoSuchProcess):
                        continue
            
            bots.append(bot_info)
        
    except (subprocess.TimeoutExpired, subprocess.SubprocessError) as e:
        return [{"name": "error", "status": "down", "pid": None, "uptime": None, "error": str(e)}]
    
    return bots

def get_cron_jobs():
    """Fetch cron job status from OpenClaw gateway"""
    try:
        headers = {"Authorization": f"Bearer {GATEWAY_TOKEN}"}
        response = requests.get(f"{GATEWAY_URL}/api/cron/jobs", headers=headers, timeout=5)
        
        if response.status_code == 200:
            try:
                data = response.json()
                # Format the data for display
                if isinstance(data, list):
                    jobs = []
                    for job in data:
                        jobs.append({
                            "name": job.get("id", "unknown"),
                            "schedule": job.get("cron", "unknown"),
                            "status": "active" if job.get("enabled", False) else "disabled",
                            "lastRun": job.get("lastRun", "Never"),
                            "nextRun": job.get("nextRun", "Unknown")
                        })
                    return {"jobs": jobs}
                else:
                    return {"jobs": [], "error": "Unexpected data format"}
            except (json.JSONDecodeError, KeyError) as e:
                return {"jobs": [], "error": f"Gateway returned HTML (API not available)"}
        else:
            return {"jobs": [], "error": f"HTTP {response.status_code}"}
            
    except requests.RequestException as e:
        return {"jobs": [], "error": str(e)}

def get_trading_signals():
    """Read latest trading signals"""
    signals = {"signals": "unavailable", "daily_opportunities": "unavailable"}
    
    # Read main signals file
    try:
        signals_file = Path(TRADING_DIR) / "trader-signals.md"
        if signals_file.exists():
            with open(signals_file, 'r') as f:
                content = f.read()
                # Extract key findings section
                if "## 📊 Key Findings" in content:
                    signals["signals"] = content.split("## 📊 Key Findings")[1].split("##")[0].strip()
                else:
                    signals["signals"] = content[:500] + "..." if len(content) > 500 else content
    except Exception as e:
        signals["signals"] = f"Error reading signals: {str(e)}"
    
    # Read latest daily opportunities
    try:
        opps_dir = Path(TRADING_DIR) / "daily-opportunities"
        if opps_dir.exists():
            # Get most recent file
            files = sorted(opps_dir.glob("*.md"), key=lambda x: x.stat().st_mtime, reverse=True)
            if files:
                with open(files[0], 'r') as f:
                    content = f.read()
                    signals["daily_opportunities"] = content[:300] + "..." if len(content) > 300 else content
    except Exception as e:
        signals["daily_opportunities"] = f"Error reading opportunities: {str(e)}"
    
    return signals

def get_reminders():
    """Read reminders from REMINDERS.md file"""
    try:
        if not os.path.exists(REMINDERS_FILE):
            return {"reminders": [], "error": "REMINDERS.md file not found"}
        
        with open(REMINDERS_FILE, 'r') as f:
            content = f.read()
        
        # Parse reminders (lines starting with -)
        reminders = []
        for line in content.split('\n'):
            line = line.strip()
            if line.startswith('- '):
                reminder_text = line[2:].strip()  # Remove '- ' prefix
                reminders.append(reminder_text)
        
        return {"reminders": reminders}
        
    except Exception as e:
        return {"reminders": [], "error": f"Error reading reminders: {str(e)}"}

def get_system_health():
    """Get system health metrics for Mac Mini and Phoenix-AI"""
    try:
        # Mac Mini metrics
        uptime_seconds = time.time() - psutil.boot_time()
        uptime_str = str(timedelta(seconds=int(uptime_seconds)))
        
        memory = psutil.virtual_memory()
        memory_percent = memory.percent
        
        disk = psutil.disk_usage('/')
        disk_percent = (disk.used / disk.total) * 100
        
        cpu_percent = psutil.cpu_percent(interval=1)
        
        mac_mini = {
            "uptime": uptime_str,
            "memory_percent": round(memory_percent, 1),
            "disk_percent": round(disk_percent, 1),
            "cpu_percent": round(cpu_percent, 1)
        }
        
        # Phoenix-AI metrics via SSH
        phoenix_ai = get_phoenix_status()
        
        return {
            "mac_mini": mac_mini,
            "phoenix_ai": phoenix_ai
        }
        
    except Exception as e:
        return {
            "mac_mini": {
                "uptime": "unknown",
                "memory_percent": 0,
                "disk_percent": 0,
                "cpu_percent": 0,
                "error": str(e)
            },
            "phoenix_ai": {"status": "error", "error": "Failed to get Mac Mini health"}
        }

def get_phoenix_status():
    """Get Phoenix-AI live status via SSH with caching"""
    global _phoenix_cache
    
    current_time = time.time()
    
    # Return cached data if still valid
    if (_phoenix_cache['data'] is not None and 
        current_time - _phoenix_cache['timestamp'] < _phoenix_cache['ttl']):
        return _phoenix_cache['data']
    
    phoenix_data = {
        "status": "down",
        "cpu_percent": None,
        "ram_percent": None,
        "disk_percent": None,
        "uptime": None,
        "error": None
    }
    
    try:
        # SSH into Phoenix-AI and run monitor script
        result = subprocess.run([
            'ssh', '-o', 'ConnectTimeout=5', '-o', 'StrictHostKeyChecking=no',
            'jonathan@192.168.1.189', '~/monitor.sh'
        ], capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            phoenix_data["status"] = "up"
            
            # Parse monitor script output
            output = result.stdout.strip()
            lines = output.split('\n')
            
            for line in lines:
                # Parse CPU usage
                cpu_match = re.search(r'CPU.*?(\d+(?:\.\d+)?)%', line, re.IGNORECASE)
                if cpu_match:
                    phoenix_data["cpu_percent"] = float(cpu_match.group(1))
                
                # Parse RAM usage
                ram_match = re.search(r'RAM.*?(\d+(?:\.\d+)?)%', line, re.IGNORECASE)
                if ram_match:
                    phoenix_data["ram_percent"] = float(ram_match.group(1))
                
                # Parse disk usage
                disk_match = re.search(r'Disk.*?(\d+(?:\.\d+)?)%', line, re.IGNORECASE)
                if disk_match:
                    phoenix_data["disk_percent"] = float(disk_match.group(1))
                    
                # Parse uptime
                uptime_match = re.search(r'Uptime.*?(\d+.*?)(?:\n|$)', line, re.IGNORECASE)
                if uptime_match:
                    phoenix_data["uptime"] = uptime_match.group(1).strip()
        else:
            phoenix_data["error"] = result.stderr.strip() if result.stderr else "SSH command failed"
            
    except subprocess.TimeoutExpired:
        phoenix_data["error"] = "SSH timeout (10s)"
    except Exception as e:
        phoenix_data["error"] = str(e)
    
    # Cache the result
    _phoenix_cache['data'] = phoenix_data
    _phoenix_cache['timestamp'] = current_time
    
    return phoenix_data

def parse_infrastructure_md():
    """Parse INFRASTRUCTURE.md file for migration plan and pending tasks"""
    infra_file = Path("/Users/bill/.openclaw/workspace/INFRASTRUCTURE.md")
    
    infrastructure_data = {
        "machines": {
            "mac-mini": {
                "name": "Mac Mini",
                "role": "Orchestration, messaging, browser automation",
                "services": ["OpenClaw Gateway", "Mission Control", "Managed Browser", "BlueBubbles"],
                "status": "up"  # Always up if we're serving this
            },
            "phoenix-ai": {
                "name": "Phoenix-AI",
                "role": "GPU inference, heavy compute, backtesting",
                "services": ["Ollama", "SSH", "Docker"],
                "status": "unknown"
            }
        },
        "migration_plan": [],
        "pending_tasks": []
    }
    
    if not infra_file.exists():
        return infrastructure_data
    
    try:
        with open(infra_file, 'r') as f:
            content = f.read()
        
        # Parse migration plan table
        migration_section = re.search(r'### MOVE to Phoenix-AI.*?\n(.*?)\n###', content, re.DOTALL)
        if migration_section:
            table_content = migration_section.group(1)
            rows = re.findall(r'\| ([^|]+) \| ([^|]+) \| ([^|]+) \|', table_content)
            for row in rows[1:]:  # Skip header
                if len(row) == 3:
                    what, why, status = [cell.strip() for cell in row]
                    if what and what != 'What':  # Skip header row
                        infrastructure_data["migration_plan"].append({
                            "item": what,
                            "reason": why,
                            "status": status
                        })
        
        # Parse pending tasks table
        tasks_section = re.search(r'## Pending Setup Tasks.*?\n(.*?)(?:\n##|$)', content, re.DOTALL)
        if tasks_section:
            table_content = tasks_section.group(1)
            rows = re.findall(r'\| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|', table_content)
            for row in rows[1:]:  # Skip header
                if len(row) == 4:
                    task, machine, status, blocker = [cell.strip() for cell in row]
                    if task and task != 'Task':  # Skip header row
                        infrastructure_data["pending_tasks"].append({
                            "task": task,
                            "machine": machine,
                            "status": status,
                            "blocker": blocker
                        })
        
    except Exception as e:
        infrastructure_data["error"] = f"Error parsing INFRASTRUCTURE.md: {str(e)}"
    
    return infrastructure_data

def get_infrastructure_data():
    """Get complete infrastructure status"""
    # Parse infrastructure markdown
    infra_data = parse_infrastructure_md()
    
    # Get Phoenix-AI live status
    phoenix_status = get_phoenix_status()
    
    # Update Phoenix-AI machine status
    if "phoenix-ai" in infra_data["machines"]:
        infra_data["machines"]["phoenix-ai"]["live_status"] = phoenix_status
        infra_data["machines"]["phoenix-ai"]["status"] = phoenix_status["status"]
    
    return infra_data

def _parse_task_tracker():
    """Parse TASK_TRACKER.md into structured task objects."""
    path = Path(TASK_TRACKER_FILE)
    default_payload = {
        "tasks": [],
        "file_path": TASK_TRACKER_FILE,
        "file_exists": path.exists(),
        "file_modified_at": None,
    }

    if not path.exists():
        return default_payload

    try:
        content = path.read_text(encoding='utf-8')
    except Exception as e:
        return {
            **default_payload,
            "error": f"Error reading TASK_TRACKER.md: {str(e)}",
        }

    metadata_pattern = re.compile(r'^\s*-\s+\*\*([^*]+?)\s*:?\*\*\s*(.*)\s*$')

    tasks = []
    in_code_fence = False
    current_section = None
    current_title = None
    current_lines = []

    def finalize_task(title, lines, section):
        if not title:
            return

        fields = {}
        for line in lines:
            match = metadata_pattern.match(line)
            if match:
                key = match.group(1).strip().lower()
                value = match.group(2).strip()
                fields[key] = value

        task_id = ""
        task_title = title.strip()
        task_match = re.match(r'^(T-\d+)\s*:\s*(.+)$', task_title)
        if task_match:
            task_id = task_match.group(1).strip()
            task_title = task_match.group(2).strip()

        raw_text = '\n'.join([title] + lines).strip()
        search_text = ' '.join([
            task_id,
            task_title,
            fields.get("what", ""),
            fields.get("context", ""),
            fields.get("who", ""),
            fields.get("agent", ""),
            fields.get("status", ""),
            fields.get("priority", ""),
            raw_text,
        ]).lower()

        tasks.append({
            "id": task_id,
            "title": task_title,
            "header": title.strip(),
            "section": section,
            "agent": fields.get("agent", ""),
            "what": fields.get("what", ""),
            "who": fields.get("who", ""),
            "due": fields.get("due", ""),
            "status": fields.get("status", ""),
            "priority": fields.get("priority", ""),
            "context": fields.get("context", ""),
            "created": fields.get("created", ""),
            "updated": fields.get("updated", ""),
            "completed": fields.get("completed", ""),
            "blocked": fields.get("blocked", ""),
            "progress": fields.get("progress", ""),
            "resolved": fields.get("resolved", ""),
            "process": fields.get("process", ""),
            "raw_text": raw_text,
            "search_text": search_text,
        })

    for raw_line in content.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if stripped.startswith("```"):
            in_code_fence = not in_code_fence
            continue

        if in_code_fence:
            continue

        if stripped.startswith("## "):
            current_section = stripped[3:].strip()
            continue

        if stripped.startswith("### "):
            finalize_task(current_title, current_lines, current_section)
            current_title = stripped[4:].strip()
            current_lines = []
            continue

        if current_title is not None:
            current_lines.append(line)

    finalize_task(current_title, current_lines, current_section)

    return {
        "tasks": tasks,
        "file_path": TASK_TRACKER_FILE,
        "file_exists": True,
        "file_modified_at": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
    }

TEAM_FALLBACK = [
    {"name": "Bill", "emoji": "🫡", "role": "Orchestrator", "notes": "Ops + strategy lead", "slug": "bill"},
    {"name": "Bob", "emoji": "🔨", "role": "Builder", "notes": "Ship features + deploy", "slug": "bob"},
    {"name": "Forge", "emoji": "⚒️", "role": "Code Review", "notes": "Security + QA gate", "slug": "forge"},
    {"name": "Truth", "emoji": "👁️", "role": "Accountability", "notes": "Tracks commitments", "slug": "truth"},
    {"name": "Shark", "emoji": "🦈", "role": "Trading", "notes": "Markets + bots", "slug": "shark"},
    {"name": "ACE", "emoji": "💪", "role": "Fitness", "notes": "Training systems", "slug": "ace"},
    {"name": "Sam", "emoji": "🎯", "role": "Strategy", "notes": "Business ops", "slug": "sam"},
    {"name": "Marty", "emoji": "📣", "role": "Marketing", "notes": "Campaigns + growth", "slug": "marty"},
    {"name": "Quill", "emoji": "✍️", "role": "Copywriting", "notes": "Scripts + threads", "slug": "quill"},
    {"name": "Pixel", "emoji": "🎨", "role": "Design", "notes": "Visuals + brand", "slug": "pixel"},
    {"name": "Scrub", "emoji": "🧽", "role": "Research", "notes": "Intel + sourcing", "slug": "scrub"},
    {"name": "Scout", "emoji": "🔭", "role": "Opportunity", "notes": "Scouting + leads", "slug": "scout"},
    {"name": "Content PM", "emoji": "🗓️", "role": "Content Pipeline", "notes": "Scheduling + approvals", "slug": "content-pm"},
    {"name": "Librarian", "emoji": "📚", "role": "Knowledge", "notes": "Docs + memory", "slug": "librarian"},
    {"name": "Music Biz", "emoji": "🎶", "role": "Music", "notes": "Curation + vibes", "slug": "music-biz"},
    {"name": "Vitruviano PM", "emoji": "📱", "role": "Product", "notes": "App delivery", "slug": "vitruviano-pm"},
    {"name": "Ops", "emoji": "🛠️", "role": "Infrastructure", "notes": "Systems + uptime", "slug": "ops"},
    {"name": "SENTINEL", "emoji": "🛡️", "role": "Infrastructure Monitor", "notes": "pai Ollama", "slug": "sentinel"},
]

TEAM_PROMPT_FILES = {
    "bob": "bob-prompt.md",
    "forge": "forge-prompt.md",
    "truth": "truth-prompt.md",
    "shark": "shark-prompt.md",
    "ace": "ace-prompt.md",
    "sam": "sam-prompt.md",
    "marty": "marty-prompt.md",
    "quill": "quill-prompt.md",
    "pixel": "pixel-prompt.md",
    "scrub": "scrub-prompt.md",
    "scout": "scout-prompt.md",
    "music-biz": "music-biz-prompt.md",
    "vitruviano-pm": "vitruviano-pm-prompt.md",
    "sentinel": "sentinel-prompt.md",
}


def _load_team_roster():
    """Hardcoded roster for Mission Control v2."""
    agents = [agent.copy() for agent in TEAM_FALLBACK]
    return agents


def _format_relative_time(timestamp_epoch):
    if not timestamp_epoch:
        return "—"
    delta = max(0, time.time() - timestamp_epoch)
    minutes = int(delta // 60)
    if minutes < 1:
        return "just now"
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h ago"
    days = hours // 24
    return f"{days}d ago"


def _extract_cron_jobs(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if "jobs" in payload:
            inner = payload.get("jobs")
            if isinstance(inner, list):
                return inner
            if isinstance(inner, dict):
                return inner.get("jobs", []) if isinstance(inner.get("jobs"), list) else []
    return []


def _load_cron_jobs_live():
    try:
        result = subprocess.run(["/opt/homebrew/bin/openclaw", "cron", "list", "--json"],
                                capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            return []
        payload = json.loads(result.stdout)
        return _extract_cron_jobs(payload)
    except Exception:
        return []


def _read_json_file(path):
    try:
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return None


def _estimate_calls_per_day(schedule):
    if not schedule:
        return 0
    kind = schedule.get("kind") if isinstance(schedule, dict) else None
    if kind == "every":
        every_ms = schedule.get("everyMs", 0) or 0
        if every_ms <= 0:
            return 0
        return round((24 * 60 * 60 * 1000) / every_ms, 2)

    expr = schedule.get("expr") if isinstance(schedule, dict) else None
    if not expr:
        return 0
    expr = expr.strip()
    if expr.startswith("@"):
        tag = expr.lower()
        return {
            "@hourly": 24,
            "@daily": 1,
            "@weekly": round(1 / 7, 3),
            "@monthly": round(1 / 30, 3),
        }.get(tag, 0)

    parts = expr.split()
    if len(parts) < 5:
        return 0
    minute, hour, dom, month, dow = parts[:5]

    def _count(field, max_value):
        if field == "*":
            return max_value
        if field.startswith("*/"):
            try:
                step = int(field.split("/")[1])
                return max(1, int(max_value / step))
            except (ValueError, ZeroDivisionError):
                return 1
        if "," in field:
            return len([v for v in field.split(",") if v.strip()])
        return 1

    minute_count = _count(minute, 60)
    hour_count = _count(hour, 24)
    day_factor = 1
    if dom != "*" and dow == "*":
        day_factor = 1 / 30
    elif dow != "*" and dom == "*":
        day_factor = 1 / 7
    elif dow != "*" and dom != "*":
        day_factor = 1 / 30
    month_factor = 1
    if month != "*":
        month_factor = 1 / 12

    return round(minute_count * hour_count * day_factor * month_factor, 3)


def _extract_channel_from_job(job):
    delivery = job.get("delivery") or {}
    payload_delivery = (job.get("payload") or {}).get("delivery") or {}
    for candidate in (delivery, payload_delivery):
        if candidate.get("mode") == "none":
            continue
        channel = candidate.get("channel")
        target = candidate.get("to")
        if channel and target:
            return channel, str(target)

    session_key = job.get("sessionKey") or ""
    match = re.search(r"discord:channel:(\d+)", session_key)
    if match:
        return "discord", match.group(1)
    match = re.search(r"telegram:chat:(-?\d+)", session_key)
    if match:
        return "telegram", match.group(1)

    return "unknown", "unknown"


def _normalize_minimax_usage(payload):
    if not isinstance(payload, dict):
        return {"models": [], "raw": payload}

    data = payload.get("data") or payload.get("result") or payload
    models = []

    def _find_model_list(obj):
        if isinstance(obj, list):
            if obj and isinstance(obj[0], dict) and any(k in obj[0] for k in ("model", "modelName", "name", "model_name")):
                return obj
        if isinstance(obj, dict):
            for key in ("models", "modelList", "model_list", "model_remains", "remains", "items", "plans", "planList"):
                value = obj.get(key)
                if value is not None:
                    found = _find_model_list(value)
                    if found is not None:
                        return found
        return None

    model_list = _find_model_list(data)
    if model_list:
        for item in model_list:
            if not isinstance(item, dict):
                continue
            name = item.get("model") or item.get("modelName") or item.get("model_name") or item.get("name")
            used = item.get("used") or item.get("usedCount") or item.get("used_count") or item.get("usage") or item.get("countUsed") or item.get("current_interval_usage_count")
            total = item.get("total") or item.get("totalCount") or item.get("limit") or item.get("countTotal") or item.get("current_interval_total_count")
            remaining = item.get("remaining") or item.get("remain") or item.get("remainingCount") or item.get("left")
            if remaining is None and used is not None and total is not None:
                try:
                    remaining = max(0, int(total) - int(used))
                except Exception:
                    remaining = None
            models.append({
                "name": name,
                "used": used,
                "total": total,
                "remaining": remaining,
            })

    remaining_seconds = None
    for key in ("windowRemainingSeconds", "remainSeconds", "remain_seconds", "resetAfterSeconds", "window_reset_seconds"):
        if key in payload:
            remaining_seconds = payload.get(key)
            break
        if isinstance(data, dict) and key in data:
            remaining_seconds = data.get(key)
            break
    # MiniMax uses remains_time in milliseconds on individual models
    if remaining_seconds is None and model_list:
        for item in model_list:
            rt = item.get("remains_time")
            if rt and isinstance(rt, (int, float)):
                remaining_seconds = rt / 1000
                break

    window_remaining = None
    if isinstance(remaining_seconds, (int, float)):
        minutes = int(remaining_seconds // 60)
        window_remaining = f"{minutes}m remaining"

    return {
        "models": models,
        "window_remaining": window_remaining,
        "window_remaining_seconds": remaining_seconds,
        "raw": payload,
    }


def _extract_latest_report_sections(content):
    if not content:
        return "", ""
    daily_matches = re.findall(r"(## Daily Report[\s\S]*?)(?=\n## |\Z)", content)
    monthly_matches = re.findall(r"(## Monthly ROI Report[\s\S]*?)(?=\n## |\Z)", content)
    daily = daily_matches[-1].strip() if daily_matches else ""
    monthly = monthly_matches[-1].strip() if monthly_matches else ""
    return daily, monthly


def _apply_team_status(agents):
    timeline = _build_message_timeline(limit=500)
    cron_jobs = _load_cron_jobs_live()
    cron_last = {}
    for job in cron_jobs:
        agent_id = str(job.get("agentId") or job.get("agent") or "main").lower()
        last_run_ms = job.get("state", {}).get("lastRunAtMs") or 0
        if last_run_ms and last_run_ms > cron_last.get(agent_id, 0):
            cron_last[agent_id] = last_run_ms

    for agent in agents:
        last_ts = 0
        for entry in timeline:
            agent_name = str(entry.get("agent", "")).lower()
            if agent["name"].lower() in agent_name:
                last_ts = entry.get("timestamp_epoch", 0)
                break

        slug = str(agent.get("slug", "")).lower()
        cron_key = "main" if slug in ("bill", "main") else slug
        cron_last_ts = cron_last.get(cron_key, 0)
        if cron_last_ts:
            last_ts = max(last_ts, cron_last_ts / 1000)

        agent["last_active"] = _format_relative_time(last_ts)
        if not last_ts:
            agent["status"] = "offline"
        else:
            age_minutes = (time.time() - last_ts) / 60
            if age_minutes <= 15:
                agent["status"] = "online"
            elif age_minutes <= 240:
                agent["status"] = "idle"
            else:
                agent["status"] = "offline"

    return agents


@app.route('/')
def dashboard():
    """Main dashboard page"""
    return render_template('index.html')

@app.route('/messages')
def messages():
    """Primary Message Center UI."""
    return render_template('message_center.html')

@app.route('/message-center')
def message_center():
    """Legacy Message Center UI route."""
    return render_template('message_center.html')

@app.route('/ops')
def ops():
    """Ops view alias to Message Center."""
    return render_template('message_center.html')

@app.route('/tasks')
def tasks_page():
    """Task Tracker UI."""
    return render_template('tasks.html')


@app.route('/team')
def team_page():
    agents = _apply_team_status(_load_team_roster())
    return render_template('team.html', agents=agents)


@app.route('/calendar')
def calendar_page():
    return render_template('calendar.html')


@app.route('/signals')
def signals_page():
    return render_template('signals.html')


@app.route('/content')
def content_page():
    return render_template('content.html')


@app.route('/projects')
def projects_page():
    return render_template('projects.html')


@app.route('/memory')
def memory_page():
    return render_template('memory.html')


@app.route('/docs')
def docs_page():
    return render_template('docs.html')


@app.route('/approvals')
def approvals_page():
    return render_template('approvals.html')


@app.route('/council')
def council_page():
    return render_template('council.html')


@app.route('/office')
def office_page():
    return render_template('office.html')


@app.route('/usage')
def usage_page():
    return render_template('usage.html')


@app.route('/api/status')
def api_status():
    """API endpoint for dashboard data"""
    try:
        return jsonify({
            "timestamp": datetime.now().isoformat(),
            "bots": get_bot_status(),
            "cron": get_cron_jobs(),
            "signals": get_trading_signals(),
            "reminders": get_reminders(),
            "system": get_system_health()
        })
    except Exception as e:
        return jsonify({
            "timestamp": datetime.now().isoformat(),
            "error": str(e),
            "bots": [],
            "cron": {"jobs": [], "error": "API error"},
            "signals": {"signals": "unavailable", "daily_opportunities": "unavailable"},
            "reminders": {"reminders": [], "error": "API error"},
            "system": {"mac_mini": {"error": "API error"}, "phoenix_ai": {"error": "API error"}}
        }), 500


@app.route('/api/team')
def api_team():
    return jsonify(_apply_team_status(_load_team_roster()))


def _normalize_agent_value(value):
    if not value:
        return ""
    val = str(value).strip().lower()
    replacements = {
        "content pm": "content-pm",
        "content_pm": "content-pm",
        "music biz": "music-biz",
        "vitruviano pm": "vitruviano-pm",
    }
    return replacements.get(val, val)


def _agent_match_keys(agent):
    keys = set()
    slug = _normalize_agent_value(agent.get("slug", ""))
    name = _normalize_agent_value(agent.get("name", ""))
    if slug:
        keys.add(slug)
    if name:
        keys.add(name)
    if name:
        keys.add(name.replace(" ", ""))
    if slug in ("bill", "main"):
        keys.update({"main", "bill"})
    return keys


def _cron_schedule_label(job):
    schedule = job.get("schedule") or {}
    kind = schedule.get("kind") if isinstance(schedule, dict) else None
    if kind == "every":
        every_ms = schedule.get("everyMs") or schedule.get("every_ms")
        if every_ms:
            return f"Every {int(round(every_ms / 60000))}m"
    if kind == "cron":
        return schedule.get("expr") or "—"
    return schedule.get("expr") if isinstance(schedule, dict) else "—"


@app.route('/api/team/<slug>/detail')
def api_team_detail(slug):
    agents = _load_team_roster()
    agent = next((a for a in agents if a.get("slug") == slug), None)
    if not agent:
        return jsonify({"error": "not found"}), 404

    agent = _apply_team_status([agent])[0]
    keys = _agent_match_keys(agent)

    tasks = []
    init_kanban_db()
    conn = _kanban_conn()
    rows = conn.execute("SELECT id, title, column_name, priority, assigned_agent FROM kanban_tasks").fetchall()
    conn.close()
    for row in rows:
        assigned = _normalize_agent_value(row["assigned_agent"])
        if assigned in keys:
            tasks.append({
                "id": row["id"],
                "title": row["title"],
                "column": row["column_name"],
                "priority": row["priority"],
                "assigned_agent": row["assigned_agent"],
            })

    cron_jobs = _load_cron_jobs_live()
    next_runs = []
    for job in cron_jobs:
        agent_id = _normalize_agent_value(job.get("agentId") or job.get("agent") or "main")
        if agent_id in keys:
            next_runs.append({
                "name": job.get("name") or job.get("id"),
                "next_run_at": job.get("state", {}).get("nextRunAtMs"),
                "schedule": _cron_schedule_label(job),
                "status": job.get("state", {}).get("lastRunStatus") or job.get("state", {}).get("lastStatus"),
            })
    next_runs.sort(key=lambda r: r.get("next_run_at") or 0)

    prompt_excerpt = ""
    prompt_file = TEAM_PROMPT_FILES.get(agent.get("slug")) if agent.get("slug") else None
    if not prompt_file and agent.get("slug"):
        prompt_file = f"{agent['slug']}-prompt.md"
    if prompt_file:
        prompt_path = os.path.join("/Users/bill/.openclaw/workspace/agents", prompt_file)
        if os.path.exists(prompt_path):
            try:
                content = Path(prompt_path).read_text(encoding="utf-8")
                prompt_excerpt = " ".join(content.strip().split())[:200]
            except Exception:
                prompt_excerpt = ""

    return jsonify({
        "agent": agent,
        "tasks": tasks,
        "next_runs": next_runs,
        "prompt_excerpt": prompt_excerpt,
    })


@app.route('/api/crew-status')
def api_crew_status():
    """Return crew status derived from cron job states."""
    active = 0
    erroring = 0
    idle = 0
    agent_statuses = []
    try:
        result = subprocess.run(["/opt/homebrew/bin/openclaw", "cron", "list", "--json"],
                                capture_output=True, text=True, timeout=15)
        if result.returncode == 0:
            payload = json.loads(result.stdout)
            jobs = payload.get("jobs", {}).get("jobs", []) if isinstance(payload.get("jobs"), dict) else payload.get("jobs", [])
            if isinstance(jobs, dict):
                jobs = jobs.get("jobs", [])
            # Aggregate by agent
            agent_map = {}
            for job in jobs:
                agent = job.get("agentId", "main")
                state = job.get("state", {})
                status = state.get("lastRunStatus", "unknown")
                last_run_at = state.get("lastRunAtMs") or 0
                if agent not in agent_map:
                    agent_map[agent] = {
                        "ok": 0,
                        "error": 0,
                        "total": 0,
                        "last_run_status": "unknown",
                        "last_run_at": 0
                    }
                agent_map[agent]["total"] += 1
                if status == "ok":
                    agent_map[agent]["ok"] += 1
                elif status == "error":
                    agent_map[agent]["error"] += 1
                if last_run_at and last_run_at > agent_map[agent]["last_run_at"]:
                    agent_map[agent]["last_run_at"] = last_run_at
                    agent_map[agent]["last_run_status"] = status
            for agent, counts in agent_map.items():
                payload = {"agent": agent, "status": "idle", **counts}
                if counts["error"] > 0:
                    erroring += 1
                    payload["status"] = "erroring"
                elif counts["ok"] > 0:
                    active += 1
                    payload["status"] = "active"
                else:
                    idle += 1
                agent_statuses.append(payload)
    except Exception:
        pass

    return jsonify({
        "agents": agent_statuses,
        "active": active,
        "erroring": erroring,
        "idle": idle,
        "total": active + erroring + idle
    })


def _extract_signal_items(text):
    if not text:
        return []
    items = []
    lines = [line.strip("•- \t") for line in text.splitlines() if line.strip()]
    for line in lines:
        upper = line.upper()
        if "LONG" in upper or "SHORT" in upper:
            parts = line.replace("·", " ").split()
            if not parts:
                continue
            symbol = parts[0].upper()
            direction = "LONG" if "LONG" in upper else "SHORT"
            confidence = None
            for part in parts:
                if part.endswith("%") and part[:-1].isdigit():
                    confidence = part
                    break
            items.append({
                "symbol": symbol,
                "direction": direction,
                "confidence": confidence,
                "raw": line
            })
    if not items:
        items = [
            {"symbol": "NVDA", "direction": "SHORT", "confidence": "90%"},
            {"symbol": "SPY", "direction": "SHORT", "confidence": "67%"},
            {"symbol": "BTC", "direction": "LONG", "confidence": "72%"},
            {"symbol": "ETH", "direction": "LONG", "confidence": "61%"},
        ]
    return items[:12]


def _parse_shark_snapshot(snapshot_path):
    items = []
    snapshot_time = None
    file_mtime = None
    if not snapshot_path.exists():
        return items, snapshot_time, file_mtime

    try:
        file_mtime = datetime.fromtimestamp(snapshot_path.stat().st_mtime)
        content = snapshot_path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return items, snapshot_time, file_mtime

    ts_match = re.search(r"SHARK MARKET WATCH\s+[—-]\s+([0-9]{4}-[0-9]{2}-[0-9]{2}\s+[0-9]{2}:[0-9]{2})", content)
    if ts_match:
        try:
            snapshot_time = datetime.strptime(ts_match.group(1), "%Y-%m-%d %H:%M")
        except ValueError:
            snapshot_time = None

    setup_pattern = re.compile(
        r"([A-Z]{2,10})\s+([0-9]+[HMDW])\s+(HIGH|MEDIUM|LOW)\s+(bull|bear)\s+([A-Za-z]+)\s+at\s+\$([0-9,\.]+)\s+\(price at\s+\$([0-9,\.]+)",
        re.IGNORECASE,
    )
    for m in setup_pattern.finditer(content):
        symbol, timeframe, confidence, direction, pattern, entry, current = m.groups()
        items.append({
            "source": "shark_snapshot",
            "symbol": symbol.upper(),
            "direction": "LONG" if direction.lower() == "bull" else "SHORT",
            "confidence": confidence.upper(),
            "pattern": pattern.upper(),
            "timeframe": timeframe.upper(),
            "time": snapshot_time.isoformat() if snapshot_time else None,
            "entry": f"${entry}",
            "current": f"${current}",
            "sl": None,
            "tp1": None,
            "tp2": None,
            "raw": m.group(0),
        })

    if not items:
        summary_pattern = re.compile(r"•\s+([A-Z]{2,10}):\s+\$([0-9,\.]+)\s+\(([+-][0-9\.]+)%\s+24h\)")
        for m in summary_pattern.finditer(content):
            symbol, price, pct = m.groups()
            try:
                pct_f = float(pct)
            except ValueError:
                pct_f = 0.0
            items.append({
                "source": "shark_snapshot",
                "symbol": symbol.upper(),
                "direction": "LONG" if pct_f >= 0 else "SHORT",
                "confidence": f"{abs(pct_f):.2f}% 24h",
                "pattern": "MARKET SNAPSHOT",
                "time": snapshot_time.isoformat() if snapshot_time else None,
                "entry": f"${price}",
                "sl": None,
                "tp1": None,
                "tp2": None,
                "raw": m.group(0),
            })

    return items, snapshot_time, file_mtime


def _parse_scanner_signals(scanner_path):
    items = []
    scanner_time = None
    file_mtime = None
    if not scanner_path.exists():
        return items, scanner_time, file_mtime

    try:
        file_mtime = datetime.fromtimestamp(scanner_path.stat().st_mtime)
        payload = json.loads(scanner_path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return items, scanner_time, file_mtime

    last_scan = payload.get("last_scan")
    if isinstance(last_scan, str):
        try:
            scanner_time = datetime.fromisoformat(last_scan.replace("Z", "+00:00"))
        except ValueError:
            scanner_time = None

    for sig in payload.get("signals", []):
        if not isinstance(sig, dict):
            continue
        signal_type = (sig.get("signal_type") or "").lower()
        if signal_type in ("neutral", ""):
            continue
        symbol = (sig.get("symbol") or sig.get("asset") or "").replace("/USDT", "").replace("USDT", "").strip().upper()
        if not symbol:
            continue

        items.append({
            "source": "ict_scanner",
            "symbol": symbol,
            "direction": "LONG" if signal_type == "bullish" else "SHORT",
            "confidence": f"{sig.get('confluence_score', 0)}%",
            "pattern": "ICT",
            "timeframe": sig.get("timeframe") or "—",
            "time": sig.get("timestamp") or (scanner_time.isoformat() if scanner_time else None),
            "entry": sig.get("entry") or sig.get("entry_price") or sig.get("current_price"),
            "sl": sig.get("sl") or sig.get("stop_loss") or sig.get("stop"),
            "tp1": sig.get("tp1") or sig.get("target1"),
            "tp2": sig.get("tp2") or sig.get("target2"),
            "raw": sig.get("id") or f"{symbol} {signal_type}",
        })

    return items, scanner_time, file_mtime


def _to_iso_or_none(dt_obj):
    if not dt_obj:
        return None
    try:
        return dt_obj.isoformat()
    except Exception:
        return None


def _approval_status_from_reply(reply_text):
    text = (reply_text or "").strip().lower()
    if not text:
        return None
    approved_terms = ("approved", "yes", "go", "do it")
    rejected_terms = ("no", "reject", "kill", "cancel")
    if any(term in text for term in approved_terms):
        return "approved"
    if any(term in text for term in rejected_terms):
        return "rejected"
    return "pending"


def _build_recent_activity_events(limit=20):
    events = []
    cutoff = datetime.now() - timedelta(days=7)

    # 1) Recent git commits
    try:
        result = subprocess.run(
            ["git", "log", "--oneline", "-10", "--since=7 days ago", "--date=iso-strict", "--pretty=format:%H|%cI|%s"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                parts = line.split("|", 2)
                if len(parts) != 3:
                    continue
                sha, ts, msg = parts
                try:
                    ts_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except ValueError:
                    continue
                if ts_dt.replace(tzinfo=None) < cutoff:
                    continue
                events.append({
                    "timestamp": ts_dt.isoformat(),
                    "title": f"Git commit {sha[:7]}",
                    "description": msg,
                    "source": "git",
                })
    except Exception:
        pass

    # 2) Recent cron completions from gateway
    try:
        result = subprocess.run(
            ["/opt/homebrew/bin/openclaw", "cron", "list", "--json"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            payload = json.loads(result.stdout)
            jobs = []
            if isinstance(payload, dict) and "jobs" in payload:
                inner = payload["jobs"]
                if isinstance(inner, dict):
                    jobs = inner.get("jobs", [])
                elif isinstance(inner, list):
                    jobs = inner
            elif isinstance(payload, list):
                jobs = payload

            for job in jobs:
                state = job.get("state") or {}
                last_run = state.get("lastRun")
                if not last_run:
                    continue
                try:
                    run_dt = datetime.fromisoformat(str(last_run).replace("Z", "+00:00"))
                except ValueError:
                    continue
                if run_dt.replace(tzinfo=None) < cutoff:
                    continue
                events.append({
                    "timestamp": run_dt.isoformat(),
                    "title": "Cron completion",
                    "description": f"{job.get('name') or job.get('id')}: {state.get('lastRunStatus') or 'unknown'}",
                    "source": "cron",
                })
    except Exception:
        pass

    # 3) Memory daily file updates
    try:
        memory_dir = Path("/Users/bill/.openclaw/workspace/memory")
        if memory_dir.exists():
            for path in sorted(memory_dir.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)[:12]:
                mtime = datetime.fromtimestamp(path.stat().st_mtime)
                if mtime < cutoff:
                    continue
                events.append({
                    "timestamp": mtime.isoformat(),
                    "title": "Memory updated",
                    "description": path.name,
                    "source": "memory",
                })
    except Exception:
        pass

    events.sort(key=lambda e: e.get("timestamp") or "", reverse=True)
    return events[:limit]


@app.route('/api/signals')
def api_signals():
    """Unified trading signals from Shark snapshot + ICT scanner files."""
    snapshot_file = Path("/Users/bill/.openclaw/workspace/trading/shark/latest_snapshot.txt")
    scanner_file = Path("/Users/bill/.openclaw/workspace/trading/weekly_scanner/signals.json")

    snapshot_items, snapshot_time, snapshot_mtime = _parse_shark_snapshot(snapshot_file)
    scanner_items, scanner_time, scanner_mtime = _parse_scanner_signals(scanner_file)

    all_items = snapshot_items + scanner_items
    deduped = []
    seen = set()
    for item in all_items:
        key = (
            item.get("source"),
            item.get("symbol"),
            item.get("direction"),
            item.get("timeframe"),
            item.get("entry"),
            item.get("time"),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    if not deduped:
        deduped = [{
            "source": "none",
            "symbol": "NO SIGNALS",
            "direction": "",
            "confidence": "Shark silent — no clean setups",
            "pattern": "—",
            "timeframe": "—",
            "time": None,
            "entry": None,
            "sl": None,
            "tp1": None,
            "tp2": None,
            "raw": "",
        }]

    newest = max([t for t in (snapshot_time, scanner_time, snapshot_mtime, scanner_mtime) if t] or [datetime.now()])
    age_seconds = max(0, int((datetime.now() - newest.replace(tzinfo=None)).total_seconds()))
    stale = age_seconds > 86400

    return jsonify({
        "items": deduped[:20],
        "updated_at": datetime.now().isoformat(),
        "data_updated_at": _to_iso_or_none(newest),
        "source": "shark+ict-files",
        "snapshot_mtime": _to_iso_or_none(snapshot_mtime),
        "scanner_mtime": _to_iso_or_none(scanner_mtime),
        "stale": stale,
        "age_seconds": age_seconds,
    })


@app.route('/api/recent-activity')
def api_recent_activity():
    return jsonify({"items": _build_recent_activity_events(limit=30)})


@app.route('/api/task-summary')
def api_task_summary():
    init_kanban_db()
    conn = _kanban_conn()
    rows = conn.execute("SELECT column_name, COUNT(*) as count FROM kanban_tasks GROUP BY column_name").fetchall()
    conn.close()
    counts = {row["column_name"]: row["count"] for row in rows}
    return jsonify({
        "counts": counts,
        "total": sum(counts.values())
    })


@app.route('/api/system-health')
def api_system_health():
    error_count = 0
    try:
        conn = _get_message_center_connection()
        row = conn.execute("SELECT COUNT(*) FROM message_events WHERE level='error' AND created_at >= datetime('now','-1 day')").fetchone()
        conn.close()
        if row:
            error_count = row[0]
    except Exception:
        error_count = 0

    gateway_up = False
    uptime = "unknown"
    cron_ok = 0
    cron_err = 0
    try:
        result = subprocess.run(["/opt/homebrew/bin/openclaw", "gateway", "status"],
                                capture_output=True, text=True, timeout=10)
        if result.returncode == 0 and "running" in result.stdout.lower():
            gateway_up = True
            for line in result.stdout.splitlines():
                if "uptime" in line.lower():
                    uptime = line.split(":", 1)[-1].strip() if ":" in line else line.strip()
    except Exception:
        pass

    # Count cron job health from the last run
    try:
        result = subprocess.run(["/opt/homebrew/bin/openclaw", "cron", "list", "--json"],
                                capture_output=True, text=True, timeout=15)
        if result.returncode == 0:
            payload = json.loads(result.stdout)
            jobs = payload.get("jobs", {}).get("jobs", []) if isinstance(payload.get("jobs"), dict) else payload.get("jobs", [])
            if isinstance(jobs, dict):
                jobs = jobs.get("jobs", [])
            for job in jobs:
                st = job.get("state", {}).get("lastRunStatus", "")
                if st == "ok":
                    cron_ok += 1
                elif st == "error":
                    cron_err += 1
    except Exception:
        pass

    # Check pai status
    pai_up = False
    try:
        resp = requests.get("http://192.168.1.189:8500/summary", timeout=5)
        pai_up = resp.status_code == 200
    except Exception:
        pass

    return jsonify({
        "gateway": "up" if gateway_up else "down",
        "uptime": uptime,
        "cron_ok": cron_ok,
        "cron_errors": cron_err,
        "pai": "up" if pai_up else "down",
        "errors_24h": error_count,
    })


@app.route('/api/cron-jobs-live')
def api_cron_jobs_live():
    try:
        result = subprocess.run(["/opt/homebrew/bin/openclaw", "cron", "list", "--json"], capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            return jsonify({"error": result.stderr.strip() or "cron list failed"}), 500
        payload = json.loads(result.stdout)
        # Normalize: openclaw cron list returns {jobs: {jobs: [...], total, ...}}
        if isinstance(payload, dict) and "jobs" in payload:
            inner = payload["jobs"]
            if isinstance(inner, dict) and "jobs" in inner:
                return jsonify(inner["jobs"])
            elif isinstance(inner, list):
                return jsonify(inner)
        elif isinstance(payload, list):
            return jsonify(payload)
        return jsonify(payload)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/usage/providers')
def api_usage_providers():
    state = _read_json_file(SENTINEL_STATE_FILE) or {}
    provider_health = state.get("providerHealth", {})
    pai_status = state.get("paiStatus", {})

    def get_status(key, fallback="unknown"):
        return (provider_health.get(key, {}) or {}).get("status", fallback)

    providers = [
        {
            "key": "claude",
            "name": "Claude (Opus + Sonnet)",
            "cost": "$200/mo (Max plan)",
            "usage": "Opus: Telegram + #bill-direct. Sonnet: agents (when quota available). No API for usage tracking yet.",
            "status": get_status("claude", "ok"),
            "note": (provider_health.get("claude", {}) or {}).get("note", "Weekly rolling limits per model"),
        },
        {
            "key": "openai",
            "name": "OpenAI Codex / GPT-5.2",
            "cost": "$200/mo (ChatGPT Pro)",
            "usage": "Forge, Bob, Canvas, Truth, Ops + coding sub-agents",
            "status": get_status("openai", "ok"),
            "note": (provider_health.get("openai", {}) or {}).get("note", "Primary coding + reasoning model"),
        },
        {
            "key": "minimax",
            "name": "MiniMax M2.5",
            "cost": "Free tier (4,500/5hr rolling)",
            "usage": "Pixel, Music Biz, Content PM, Marty, Sam + Discord content channels",
            "status": get_status("minimax", "ok"),
            "note": (provider_health.get("minimax", {}) or {}).get("note", "Rolling window — credits free up continuously"),
        },
        {
            "key": "deepseek",
            "name": "DeepSeek",
            "cost": "$0 credits",
            "usage": "Ops/analysis (disabled)",
            "status": "dead",
            "note": (provider_health.get("deepseek", {}) or {}).get("note", "OUT OF CREDITS"),
        },
        {
            "key": "xai",
            "name": "xAI Grok",
            "cost": "Pay-per-use",
            "usage": "Limited / market tasks",
            "status": get_status("xai", "unknown"),
            "note": (provider_health.get("xai", {}) or {}).get("note", ""),
        },
        {
            "key": "ollama",
            "name": "pai Ollama",
            "cost": "Free local",
            "usage": "Housekeeping + SENTINEL",
            "status": "ok" if pai_status.get("online") else get_status("ollama", "unknown"),
            "note": (provider_health.get("ollama", {}) or {}).get("note", ""),
        },
    ]

    return jsonify({
        "providers": providers,
        "updated_at": state.get("lastWatchAt"),
    })


@app.route('/api/usage/minimax')
def api_usage_minimax():
    url = "https://www.minimax.io/v1/api/openplatform/coding_plan/remains"
    headers = {
        "Authorization": "Bearer sk-cp-phOTlbIwOqTPdFPSd-PgVwGCBLscqx4HJEayW0b_J2g_snpcnApkzcMJLo8gRYo_ykF1_gNw5EpIOFywa19jtkt2UmR4SYm91QZFsd9qy7SQcrWNfHdWbfg"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=12)
        if resp.status_code != 200:
            return jsonify({"error": f"MiniMax API error {resp.status_code}", "details": resp.text[:200]}), 502
        payload = resp.json()
        return jsonify(_normalize_minimax_usage(payload))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/usage/channels')
def api_usage_channels():
    try:
        result = subprocess.run(["/opt/homebrew/bin/openclaw", "cron", "list", "--json"], capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            return jsonify({"error": result.stderr.strip() or "cron list failed"}), 500
        payload = json.loads(result.stdout)
        jobs = []
        if isinstance(payload, dict) and "jobs" in payload:
            inner = payload["jobs"]
            if isinstance(inner, dict) and "jobs" in inner:
                jobs = inner["jobs"]
            elif isinstance(inner, list):
                jobs = inner
        elif isinstance(payload, list):
            jobs = payload

        channel_map = {}
        for job in jobs:
            channel_type, channel_id = _extract_channel_from_job(job)
            if channel_type == "unknown":
                continue
            schedule = job.get("schedule") or {}
            calls_per_day = _estimate_calls_per_day(schedule)
            payload = job.get("payload") or {}
            model = payload.get("modelOverride") or payload.get("model") or "unknown"

            if schedule.get("kind") == "every":
                every_ms = schedule.get("everyMs", 0) or 0
                every_minutes = round(every_ms / 60000) if every_ms else 0
                frequency = f"every {every_minutes}m" if every_minutes >= 1 else f"every {round(every_ms/1000)}s"
            elif schedule.get("kind") == "cron":
                frequency = schedule.get("expr", "unknown")
            else:
                frequency = "unknown"

            last_status = (job.get("state") or {}).get("lastRunStatus") or "unknown"
            channel_label = channel_id
            if channel_type == "discord":
                channel_label = DISCORD_CHANNEL_MAP.get(channel_id, f"discord:{channel_id}")
            elif channel_type == "telegram":
                channel_label = f"telegram:{channel_id}"

            if channel_label not in channel_map:
                channel_map[channel_label] = {
                    "channel_name": channel_label,
                    "channel_id": channel_id,
                    "channel_type": channel_type,
                    "total_calls_per_day": 0,
                    "jobs": [],
                }

            channel_map[channel_label]["total_calls_per_day"] += calls_per_day
            channel_map[channel_label]["jobs"].append({
                "name": job.get("name") or job.get("id"),
                "model": model,
                "frequency": frequency,
                "calls_per_day": calls_per_day,
                "last_status": last_status,
            })

        channels = sorted(channel_map.values(), key=lambda item: item["total_calls_per_day"], reverse=True)
        for channel in channels:
            channel["total_calls_per_day"] = round(channel["total_calls_per_day"], 2)
        return jsonify({
            "channels": channels,
            "updated_at": datetime.now().isoformat(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


def api_usage_codex():
    """Pull Codex/GPT usage from local Codex CLI SQLite DB."""
    import sqlite3 as _sqlite3
    db_path = os.path.expanduser("~/.codex/state_5.sqlite")
    if not os.path.exists(db_path):
        return jsonify({"error": "Codex DB not found"}), 404
    try:
        conn = _sqlite3.connect(db_path)
        total = conn.execute("SELECT SUM(tokens_used), COUNT(*) FROM threads").fetchone()
        cutoff_24h = int(time.time()) - 86400
        cutoff_7d = int(time.time()) - 604800
        recent = conn.execute("SELECT SUM(tokens_used), COUNT(*) FROM threads WHERE updated_at > ?", (cutoff_24h,)).fetchone()
        weekly = conn.execute("SELECT SUM(tokens_used), COUNT(*) FROM threads WHERE updated_at > ?", (cutoff_7d,)).fetchone()
        # Recent sessions detail
        sessions = conn.execute(
            "SELECT title, tokens_used, model_provider, updated_at FROM threads ORDER BY updated_at DESC LIMIT 5"
        ).fetchall()
        conn.close()
        return jsonify({
            "total_tokens": total[0] or 0,
            "total_sessions": total[1] or 0,
            "last_24h_tokens": recent[0] or 0,
            "last_24h_sessions": recent[1] or 0,
            "last_7d_tokens": weekly[0] or 0,
            "last_7d_sessions": weekly[1] or 0,
            "recent_sessions": [{"title": s[0], "tokens": s[1], "provider": s[2], "updated_at": s[3]} for s in sessions],
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/usage/codex')
def _api_usage_codex():
    return api_usage_codex()


@app.route('/api/usage/reports')
def api_usage_reports():
    try:
        if not os.path.exists(SENTINEL_REVIEWS_FILE):
            return jsonify({"error": "sentinel-reviews.md not found"}), 404
        content = Path(SENTINEL_REVIEWS_FILE).read_text(encoding="utf-8")
        daily, monthly = _extract_latest_report_sections(content)
        updated_at = datetime.fromtimestamp(Path(SENTINEL_REVIEWS_FILE).stat().st_mtime).isoformat()
        return jsonify({
            "daily": daily,
            "monthly": monthly,
            "updated_at": updated_at,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/projects')
def api_projects():
    projects_file = Path(os.path.join(os.path.dirname(__file__), 'data', 'projects.json'))
    if not projects_file.exists():
        return jsonify({"projects": []})
    try:
        projects = json.loads(projects_file.read_text())
        init_kanban_db()
        conn = _kanban_conn()
        task_rows = conn.execute("SELECT id, title, description, tags FROM kanban_tasks").fetchall()
        conn.close()

        task_records = []
        for row in task_rows:
            task_records.append({
                "id": row["id"],
                "search": " ".join([
                    str(row["title"] or ""),
                    str(row["description"] or ""),
                    str(row["tags"] or ""),
                ]).lower(),
            })

        enriched = []
        for project in projects:
            p = dict(project)
            tokens = set()
            for token in [p.get("id"), p.get("name"), p.get("discord_channel"), *(p.get("tags") or [])]:
                if not token:
                    continue
                t = str(token).lower().strip()
                if t:
                    tokens.add(t)
                if "-" in t:
                    tokens.update([seg for seg in t.split("-") if len(seg) >= 3])

            task_ids = []
            for task in task_records:
                if any(tok and len(tok) >= 3 and tok in task["search"] for tok in tokens):
                    task_ids.append(task["id"])

            p["task_count"] = len(task_ids)
            p["task_ids"] = task_ids
            enriched.append(p)

        return jsonify({"projects": enriched})
    except json.JSONDecodeError:
        return jsonify({"projects": []})


@app.route('/api/memory/files')
def api_memory_files():
    memory_dir = Path("/Users/bill/.openclaw/workspace/memory")
    files = []
    if memory_dir.exists():
        files = sorted([str(p) for p in memory_dir.glob("*.md")])
    memory_main = Path("/Users/bill/.openclaw/workspace/MEMORY.md")
    if memory_main.exists():
        files.append(str(memory_main))
    return jsonify({"files": files})


@app.route('/api/memory/file')
def api_memory_file():
    path = request.args.get("path", "")
    if not path:
        return jsonify({"error": "path required"}), 400
    target = Path(path)
    if not target.exists() or not target.is_file():
        return jsonify({"error": "file not found"}), 404
    return jsonify({"path": str(target), "content": target.read_text()})


@app.route('/api/memory/search')
def api_memory_search():
    query = request.args.get("q", "").strip().lower()
    if not query:
        return jsonify({"results": []})
    memory_dir = Path("/Users/bill/.openclaw/workspace/memory")
    candidates = []
    if memory_dir.exists():
        candidates.extend(memory_dir.glob("*.md"))
    memory_main = Path("/Users/bill/.openclaw/workspace/MEMORY.md")
    if memory_main.exists():
        candidates.append(memory_main)
    results = []
    for path in candidates:
        text = path.read_text()
        if query in text.lower():
            lines = [line for line in text.splitlines() if query in line.lower()]
            results.append({"path": str(path), "matches": lines[:5]})
    return jsonify({"results": results})


@app.route('/api/docs/files')
def api_docs_files():
    base = Path("/Users/bill/.openclaw/workspace")
    files = sorted(base.glob("*.md"))
    specs_dir = base / "mission-control" / "specs"
    if specs_dir.exists():
        files.extend(sorted(specs_dir.glob("*.md")))
    file_list = [str(p) for p in files if p.exists()]
    return jsonify({"files": file_list})


@app.route('/api/docs/file')
def api_docs_file():
    path = request.args.get("path", "")
    if not path:
        return jsonify({"error": "path required"}), 400
    target = Path(path)
    if not target.exists() or not target.is_file():
        return jsonify({"error": "file not found"}), 404
    return jsonify({"path": str(target), "content": target.read_text()})


@app.route('/api/docs/github')
def api_docs_github():
    try:
        result = subprocess.run(
            ["gh", "repo", "list", "Bill-Bott47", "--json", "name,description,updatedAt,url", "--limit", "10"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return jsonify({"repos": [], "error": result.stderr.strip() or "gh repo list failed"}), 500
        repos = json.loads(result.stdout)
        return jsonify({"repos": repos})
    except Exception as e:
        return jsonify({"repos": [], "error": str(e)}), 500


@app.route('/api/approvals', methods=['GET'])
def api_approvals_list():
    init_approvals_db()
    conn = _get_message_center_connection()
    rows = conn.execute("SELECT * FROM approvals ORDER BY created_at DESC, id DESC").fetchall()
    conn.close()
    return jsonify({"approvals": [dict(r) for r in rows]})


@app.route('/api/approvals', methods=['POST'])
def api_approvals_create():
    init_approvals_db()
    payload = request.get_json(silent=True) or {}
    title = (payload.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title required"}), 400
    description = payload.get("description", "")
    submitted_by = payload.get("submitted_by", "")
    created_at = datetime.now().isoformat()
    conn = _get_message_center_connection()
    cur = conn.execute(
        """
        INSERT INTO approvals (title, description, submitted_by, status, reply_text, created_at)
        VALUES (?, ?, ?, 'pending', '', ?)
        """,
        (title, description, submitted_by, created_at)
    )
    conn.commit()
    row = conn.execute("SELECT * FROM approvals WHERE id=?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(dict(row)), 201


@app.route('/api/approvals/<int:approval_id>', methods=['PUT'])
def api_approvals_update(approval_id):
    init_approvals_db()
    payload = request.get_json(silent=True) or {}
    status = payload.get("status")
    reply_text = payload.get("reply_text", "")
    inferred_status = _approval_status_from_reply(reply_text)
    if inferred_status:
        status = inferred_status
    fields = []
    values = []
    if status:
        fields.append("status=?")
        values.append(status)
        if status in ("approved", "rejected"):
            fields.append("resolved_at=?")
            values.append(datetime.now().isoformat())
        else:
            fields.append("resolved_at=?")
            values.append(None)
    if reply_text is not None:
        fields.append("reply_text=?")
        values.append(reply_text)
    if not fields:
        return jsonify({"error": "no updates"}), 400
    values.append(approval_id)
    conn = _get_message_center_connection()
    conn.execute(f"UPDATE approvals SET {', '.join(fields)} WHERE id=?", values)
    conn.commit()
    row = conn.execute("SELECT * FROM approvals WHERE id=?", (approval_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "not found"}), 404

    # Route the decision to the agent via OpenClaw gateway
    result = dict(row)
    try:
        title = result.get("title", "Unknown")
        submitted_by = result.get("submitted_by", "unknown")
        action = status or "updated"
        reply = reply_text or ""
        # Post to Discord #inbox so Bill/agents can act on it
        msg = f"📋 **Approval {action.upper()}** by Jonathan\n**Item:** {title}\n**Submitted by:** {submitted_by}"
        if reply:
            msg += f"\n**Reply:** {reply}"
        subprocess.Popen(
            ["/opt/homebrew/bin/openclaw", "message", "send",
             "--channel", "discord", "--target", "1475882688559845541", "--message", msg],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )
    except Exception:
        pass  # Don't fail the API if notification fails

    return jsonify(result)


@app.route('/api/import-tasks', methods=['POST'])
def api_import_tasks():
    init_kanban_db()
    data = _parse_task_tracker()
    if data.get("error"):
        return jsonify(data), 500
    tasks = data.get("tasks", [])
    if not tasks:
        return jsonify({"imported": 0})

    def status_to_column(status):
        status = (status or "").upper().strip()
        if status == "OPEN":
            return "INBOX"
        if status == "IN_PROGRESS":
            return "IN PROGRESS"
        if status == "DONE":
            return "DONE"
        if status == "BLOCKED":
            return "BLOCKED"
        return "INBOX"

    def normalize_assignee(agent):
        if not agent:
            return ""
        val = str(agent).strip()
        lower = val.lower()
        mapping = {
            "bill": "main",
            "main": "main",
            "bob": "Bob",
            "forge": "Forge",
            "truth": "Truth",
            "shark": "Shark",
            "ace": "ACE",
            "sam": "Sam",
            "marty": "Marty",
            "quill": "Quill",
            "pixel": "Pixel",
            "scrub": "Scrub",
            "scout": "Scout",
            "content pm": "Content PM",
            "content_pm": "Content PM",
            "content-pm": "Content PM",
            "librarian": "Librarian",
            "music biz": "Music Biz",
            "music-biz": "Music Biz",
            "vitruviano pm": "Vitruviano PM",
            "vitruviano-pm": "Vitruviano PM",
            "ops": "Ops",
            "sentinel": "SENTINEL",
        }
        return mapping.get(lower, val)

    conn = _kanban_conn()
    existing = conn.execute("SELECT COUNT(*) FROM kanban_tasks").fetchone()[0]
    if existing:
        conn.close()
        return jsonify({"imported": 0, "message": "kanban not empty"})

    imported = 0
    for task in tasks:
        title = task.get("title") or task.get("raw_text") or "Untitled"
        col = status_to_column(task.get("status"))
        priority = (task.get("priority") or "medium").lower()
        if priority not in ("low", "medium", "high", "urgent"):
            priority = "medium"
        conn.execute(
            """
            INSERT INTO kanban_tasks (title, description, column_name, position, priority, assigned_agent, tags, ai_notes, due_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                title,
                task.get("context", ""),
                col,
                0,
                priority,
                normalize_assignee(task.get("agent", "")),
                "", "", None
            )
        )
        imported += 1
    conn.commit()
    conn.close()
    return jsonify({"imported": imported})


@app.route('/api/infrastructure')
def api_infrastructure():
    """API endpoint for infrastructure map data"""
    return jsonify({
        "timestamp": datetime.now().isoformat(),
        **get_infrastructure_data()
    })

@app.route('/api/tasks')
def api_tasks_list():
    """Read TASK_TRACKER.md and return parsed tasks with optional filters."""
    data = _parse_task_tracker()

    if data.get("error"):
        return jsonify(data), 500
    if not data.get("file_exists"):
        return jsonify(data), 404

    status_filter = request.args.get('status', '').strip()
    priority_filter = request.args.get('priority', '').strip()
    agent_filter = request.args.get('agent', '').strip()
    owner_filter = request.args.get('owner', '').strip()
    query_filter = request.args.get('q', '').strip().lower()

    tasks = data.get("tasks", [])

    if status_filter and status_filter.upper() != 'ALL':
        tasks = [t for t in tasks if t.get("status", "").upper() == status_filter.upper()]

    if priority_filter and priority_filter.upper() != 'ALL':
        tasks = [t for t in tasks if t.get("priority", "").upper() == priority_filter.upper()]

    if agent_filter and agent_filter.upper() != 'ALL':
        tasks = [t for t in tasks if t.get("agent", "").upper() == agent_filter.upper()]

    if owner_filter and owner_filter.upper() != 'ALL':
        tasks = [t for t in tasks if t.get("who", "").upper() == owner_filter.upper()]

    if query_filter:
        tasks = [t for t in tasks if query_filter in t.get("search_text", "")]

    all_tasks = data.get("tasks", [])
    statuses = sorted({t.get("status", "").upper() for t in all_tasks if t.get("status")})
    priorities = sorted({t.get("priority", "") for t in all_tasks if t.get("priority")})
    agents = sorted({t.get("agent", "") for t in all_tasks if t.get("agent")})
    owners = sorted({t.get("who", "") for t in all_tasks if t.get("who")})

    for task in tasks:
        task.pop("search_text", None)

    return jsonify({
        "tasks": tasks,
        "count": len(tasks),
        "total_count": len(all_tasks),
        "file_path": data.get("file_path"),
        "file_modified_at": data.get("file_modified_at"),
        "statuses": statuses,
        "priorities": priorities,
        "agents": agents,
        "owners": owners,
        "timestamp": datetime.now().isoformat(),
    })

@app.route('/api/message-events', methods=['POST'])
def api_message_events_create():
    """Create a message event."""
    payload = request.get_json(silent=True)
    normalized, error, body_was_truncated = _normalize_message_event_payload(payload)
    if error:
        return jsonify({"error": error}), 400

    try:
        event = log_message_event(
            source=normalized["source"],
            level=normalized["level"],
            channel=normalized["channel"],
            kind=normalized["kind"],
            title=normalized["title"],
            body=normalized["body"],
            meta_json=normalized["meta_json"],
        )
        entry_id = f"db:{event['id']}"
        mission_control_url = f"{request.host_url.rstrip('/')}/messages?entry={entry_id}"
        status_only_text = f"See details in Mission Control: {mission_control_url}"
        return jsonify({
            "event": event,
            "body_was_truncated": body_was_truncated,
            "entry_id": entry_id,
            "mission_control_url": mission_control_url,
            "status_only_text": status_only_text,
        }), 201
    except Exception as e:
        return jsonify({"error": f"Failed to save event: {str(e)}"}), 500

@app.route('/api/message-events')
def api_message_events_list():
    """List message events newest-first with optional filters."""
    _ensure_message_center_db()

    try:
        limit = int(request.args.get('limit', 100))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    if limit < 1:
        return jsonify({"error": "limit must be >= 1"}), 400
    if limit > 500:
        limit = 500

    source = request.args.get('source', '').strip()
    level = request.args.get('level', '').strip()
    channel = request.args.get('channel', '').strip()
    kind = request.args.get('kind', '').strip()

    if source and source not in VALID_MESSAGE_SOURCES:
        return jsonify({"error": f"source must be one of {sorted(VALID_MESSAGE_SOURCES)}"}), 400
    if level and level not in VALID_MESSAGE_LEVELS:
        return jsonify({"error": f"level must be one of {sorted(VALID_MESSAGE_LEVELS)}"}), 400
    if kind and kind not in VALID_MESSAGE_KINDS:
        return jsonify({"error": f"kind must be one of {sorted(VALID_MESSAGE_KINDS)}"}), 400
    if channel and len(channel) > MAX_MESSAGE_CHANNEL_LEN:
        return jsonify({"error": f"channel max length is {MAX_MESSAGE_CHANNEL_LEN}"}), 400

    query = "SELECT * FROM message_events"
    where_clauses = []
    params = []

    if source:
        where_clauses.append("source = ?")
        params.append(source)
    if level:
        where_clauses.append("level = ?")
        params.append(level)
    if channel:
        where_clauses.append("channel = ?")
        params.append(channel)
    if kind:
        where_clauses.append("kind = ?")
        params.append(kind)

    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)

    query += " ORDER BY created_at DESC, id DESC LIMIT ?"
    params.append(limit)

    conn = _get_message_center_connection()
    try:
        rows = conn.execute(query, params).fetchall()
        return jsonify({
            "events": [_serialize_message_event_row(row) for row in rows],
            "count": len(rows)
        })
    finally:
        conn.close()

@app.route('/api/messages/timeline')
def api_messages_timeline():
    """Unified timeline from DB + message log files."""
    try:
        limit = int(request.args.get('limit', 200))
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400

    if limit < 1:
        return jsonify({"error": "limit must be >= 1"}), 400
    if limit > 1000:
        limit = 1000

    level = request.args.get('level', '').strip().lower()
    if level and level not in VALID_MESSAGE_LEVELS:
        return jsonify({"error": f"level must be one of {sorted(VALID_MESSAGE_LEVELS)}"}), 400

    delivery_status = request.args.get('delivery_status', '').strip().lower()
    valid_statuses = {"", "delivered", "failed", "rate_limited", "unknown"}
    if delivery_status not in valid_statuses:
        return jsonify({"error": "delivery_status must be one of delivered, failed, rate_limited, unknown"}), 400

    channel = request.args.get('channel', '').strip()
    agent = request.args.get('agent', '').strip()
    run_id = request.args.get('run_id', '').strip()

    entries = _build_message_timeline(
        limit=limit,
        channel=channel,
        agent=agent,
        run_id=run_id,
        level=level,
        delivery_status=delivery_status,
    )

    host_url = request.host_url.rstrip('/')
    for entry in entries:
        entry["mc_url"] = f"{host_url}{entry['mc_path']}"

    return jsonify({
        "entries": entries,
        "count": len(entries),
        "filters": {
            "channel": channel,
            "agent": agent,
            "run_id": run_id,
            "level": level,
            "delivery_status": delivery_status,
            "limit": limit,
        }
    })

@app.route('/api/messages/status-post')
def api_messages_status_post():
    """
    Build status-only post text for Discord/Telegram:
    "See details in Mission Control: <link>"
    """
    entry_id = request.args.get('entry', '').strip()
    host_url = request.host_url.rstrip('/')

    target = None

    # Prefer direct DB lookup for db:<id> entries (avoids timeline scan limits).
    if entry_id.startswith("db:"):
        raw_db_id = entry_id.split(":", 1)[1]
        try:
            db_id = int(raw_db_id)
        except ValueError:
            return jsonify({"error": "invalid db entry id"}), 400

        _ensure_message_center_db()
        conn = _get_message_center_connection()
        try:
            row = conn.execute("SELECT * FROM message_events WHERE id = ?", (db_id,)).fetchone()
        finally:
            conn.close()

        if row:
            serialized = _serialize_message_event_row(row)
            serialized["id"] = f"db:{serialized['id']}"
            target = _normalize_message_timeline_entry(
                serialized,
                source="db",
                file_name="message_events",
                message_event_id=serialized["id"],
            )

    # Fall back to timeline scan (covers log-backed entries).
    if not target:
        timeline = _build_message_timeline(limit=5000)
        for entry in timeline:
            if entry.get("id") == entry_id:
                target = entry
                break

    if not target and entry_id:
        return jsonify({"error": f"entry not found: {entry_id}"}), 404

    target = target or {"mc_path": "/messages"}
    mc_url = f"{host_url}{target['mc_path']}"
    text = f"See details in Mission Control: {mc_url}"
    return jsonify({
        "entry": target.get("id"),
        "status_only_text": text,
        "mc_url": mc_url,
    })

# ============================================
# Content Pipeline API Endpoints
# ============================================

CONTENT_PIPELINE_FILE = os.path.join(os.path.dirname(__file__), 'data', 'content-pipeline.json')

def _load_pipeline():
    """Load pipeline data from JSON file"""
    try:
        with open(CONTENT_PIPELINE_FILE, 'r') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"items": [], "last_updated": datetime.now().isoformat()}

def _save_pipeline(data):
    """Save pipeline data with atomic write + backup"""
    import shutil
    # Create backup before write
    backup_file = CONTENT_PIPELINE_FILE + '.bak'
    if os.path.exists(CONTENT_PIPELINE_FILE):
        shutil.copy2(CONTENT_PIPELINE_FILE, backup_file)
    
    # Atomic write: write to temp file, then rename
    temp_file = CONTENT_PIPELINE_FILE + '.tmp'
    try:
        with open(temp_file, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(temp_file, CONTENT_PIPELINE_FILE)
        return True
    except Exception as e:
        print(f"Error saving pipeline: {e}")
        # Restore from backup on failure
        if os.path.exists(backup_file):
            shutil.copy2(backup_file, CONTENT_PIPELINE_FILE)
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return False

@app.route('/api/content-pipeline')
def api_content_pipeline_list():
    """List all pipeline items"""
    data = _load_pipeline()
    # Filter out killed items by default (show only active + approved)
    hide_killed = request.args.get('hide_killed', 'true').lower() == 'true'
    items = data.get('items', [])
    if hide_killed:
        items = [i for i in items if not i.get('killed', False)]
    return jsonify({
        "items": items,
        "last_updated": data.get('last_updated')
    })

@app.route('/api/content-pipeline', methods=['POST'])
def api_content_pipeline_create():
    """Add new pipeline item"""
    data = _load_pipeline()
    new_item = request.get_json()
    
    if not new_item:
        return jsonify({"error": "No data provided"}), 400
    
    # Validate required fields
    if 'topic' not in new_item:
        return jsonify({"error": "Missing required field: topic"}), 400
    
    # Validate topic is string and not too long (prevent abuse)
    topic = new_item.get('topic')
    if not isinstance(topic, str) or len(topic) > 500:
        return jsonify({"error": "Topic must be string under 500 chars"}), 400
    
    # Validate stage if provided
    stage = new_item.get('stage', 'trending')
    valid_stages = ['trending', 'research', 'script', 'visual', 'approved', 'published', 'killed']
    if stage not in valid_stages:
        return jsonify({"error": f"Invalid stage. Must be one of: {valid_stages}"}), 400
    
    import uuid
    item = {
        "id": str(uuid.uuid4()),
        "topic": topic[:500],  # Truncate to max length
        "source": str(new_item.get('source', 'unknown'))[:200],
        "stage": stage,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "content": {
            "research": str(new_item.get('content', {}).get('research', ''))[:5000],
            "script": str(new_item.get('content', {}).get('script', ''))[:5000],
            "visual_url": str(new_item.get('content', {}).get('visual_url', ''))[:500]
        },
        "approved": False,
        "killed": False
    }
    
    if 'items' not in data:
        data['items'] = []
    data['items'].append(item)
    data['last_updated'] = datetime.now().isoformat()
    
    if _save_pipeline(data):
        return jsonify(item), 201
    return jsonify({"error": "Failed to save"}), 500

@app.route('/api/content-pipeline/<item_id>/stage', methods=['PUT'])
def api_content_pipeline_stage(item_id):
    """Update item stage"""
    data = _load_pipeline()
    payload = request.get_json(silent=True) or {}
    new_stage = payload.get('stage')
    
    if not new_stage:
        return jsonify({"error": "Missing stage"}), 400
    
    valid_stages = ['trending', 'research', 'script', 'visual', 'approved', 'published']
    if new_stage not in valid_stages:
        return jsonify({"error": f"Invalid stage: {new_stage}"}), 400
    
    for item in data.get('items', []):
        if item.get('id') == item_id:
            item['stage'] = new_stage
            item['updated_at'] = datetime.now().isoformat()
            data['last_updated'] = datetime.now().isoformat()
            if _save_pipeline(data):
                return jsonify(item)
            return jsonify({"error": "Failed to save"}), 500
    
    return jsonify({"error": "Item not found"}), 404

@app.route('/api/content-pipeline/<item_id>/approve', methods=['PUT'])
def api_content_pipeline_approve(item_id):
    """Approve pipeline item"""
    data = _load_pipeline()
    
    for item in data.get('items', []):
        if item.get('id') == item_id:
            item['approved'] = True
            item['killed'] = False
            item['stage'] = 'approved'
            item['updated_at'] = datetime.now().isoformat()
            data['last_updated'] = datetime.now().isoformat()
            if _save_pipeline(data):
                return jsonify(item)
            return jsonify({"error": "Failed to save"}), 500
    
    return jsonify({"error": "Item not found"}), 404

@app.route('/api/content-pipeline/<item_id>/kill', methods=['PUT'])
def api_content_pipeline_kill(item_id):
    """Kill pipeline item"""
    data = _load_pipeline()
    
    for item in data.get('items', []):
        if item.get('id') == item_id:
            item['killed'] = True
            item['approved'] = False
            item['stage'] = 'killed'
            item['updated_at'] = datetime.now().isoformat()
            data['last_updated'] = datetime.now().isoformat()
            if _save_pipeline(data):
                return jsonify(item)
            return jsonify({"error": "Failed to save"}), 500
    
    return jsonify({"error": "Item not found"}), 404

@app.route('/api/content-pipeline/<item_id>', methods=['DELETE'])
def api_content_pipeline_delete(item_id):
    """Delete pipeline item"""
    data = _load_pipeline()
    
    original_count = len(data.get('items', []))
    data['items'] = [i for i in data.get('items', []) if i.get('id') != item_id]
    
    if len(data['items']) < original_count:
        data['last_updated'] = datetime.now().isoformat()
        if _save_pipeline(data):
            return jsonify({"success": True})
        return jsonify({"error": "Failed to save"}), 500
    
    return jsonify({"error": "Item not found"}), 404

# ═══════════════════════════════════════════════════════════════
#  MC v2 ADDITIONS: Kanban, Signals DB, Gateway, Content Pipeline
# ═══════════════════════════════════════════════════════════════

import threading
import queue
import websocket as _ws_client
import uuid

KANBAN_DB = os.path.join(os.path.dirname(__file__), 'data', 'kanban.db')
KANBAN_COLUMNS = ['INBOX', 'PLANNING', 'IN PROGRESS', 'TESTING', 'REVIEW', 'BLOCKED', 'DONE']

SHARKTIME_DB = "/Users/bill/.openclaw/workspace/trading/sharktime/signals.db"
ICT_ALERTS_DB = "/Users/bill/.openclaw/workspace/trading/ict-scanner/alerts.db"

# ── Kanban DB ────────────────────────────────────────────────────

def init_kanban_db():
    os.makedirs(os.path.dirname(KANBAN_DB), exist_ok=True)
    conn = sqlite3.connect(KANBAN_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS kanban_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT DEFAULT '',
            column_name TEXT NOT NULL DEFAULT 'INBOX',
            position INTEGER DEFAULT 0,
            priority TEXT DEFAULT 'medium',
            assigned_agent TEXT DEFAULT '',
            tags TEXT DEFAULT '',
            ai_notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            due_date TEXT DEFAULT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_kanban_column ON kanban_tasks(column_name)")
    conn.execute(
        """
        INSERT INTO kanban_tasks (title, description, column_name, position, priority, assigned_agent, tags, ai_notes, due_date)
        SELECT ?, ?, 'INBOX',
               COALESCE((SELECT MAX(position) + 1 FROM kanban_tasks WHERE column_name = 'INBOX'), 0),
               'medium', 'Scout', 'videri,hardware,planning', '', NULL
        WHERE NOT EXISTS (
            SELECT 1 FROM kanban_tasks WHERE title = ?
        )
        """,
        (
            "Videri Digital Display — Define project scope and deliverables",
            "Define Videri project scope, success criteria, and deliverables for execution planning.",
            "Videri Digital Display — Define project scope and deliverables",
        ),
    )
    conn.commit()
    conn.close()


def _kanban_conn():
    conn = sqlite3.connect(KANBAN_DB)
    conn.row_factory = sqlite3.Row
    return conn


def _row_to_dict(row):
    return dict(row)


# ── Kanban Routes ────────────────────────────────────────────────

@app.route('/agents')
def agents_page():
    return redirect('/team')


@app.route('/agents/<slug>/prompt')
def agent_prompt_view(slug):
    """Serve agent prompt files as plain text."""
    PROMPT_FILES = {
        "bob": "bob-prompt.md", "forge": "forge-prompt.md", "truth": "truth-prompt.md",
        "shark": "shark-prompt.md", "ace": "ace-prompt.md", "sam": "sam-prompt.md",
        "marty": "marty-prompt.md", "quill": "quill-prompt.md", "pixel": "pixel-prompt.md",
        "scrub": "scrub-prompt.md", "scout": "scout-prompt.md", "music-biz": "music-biz-prompt.md",
        "vitruviano-pm": "vitruviano-pm-prompt.md", "sentinel": "sentinel-prompt.md",
    }
    prompt_dir = Path("/Users/bill/.openclaw/workspace/agents")
    filename = PROMPT_FILES.get(slug)
    if not filename:
        return "Agent not found", 404
    prompt_path = prompt_dir / filename
    if not prompt_path.exists():
        return "Prompt file not found", 404
    from flask import Response
    return Response(prompt_path.read_text(), mimetype="text/plain")


@app.route('/kanban')
def kanban_page():
    return render_template('kanban.html')


@app.route('/api/kanban/tasks', methods=['GET'])
def api_kanban_tasks_list():
    try:
        conn = _kanban_conn()
        rows = conn.execute(
            "SELECT * FROM kanban_tasks ORDER BY column_name, position ASC"
        ).fetchall()
        conn.close()
        return jsonify([_row_to_dict(r) for r in rows])
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/kanban/tasks', methods=['POST'])
def api_kanban_tasks_create():
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({"error": "title required"}), 400
    col = data.get('column', 'INBOX')
    if col not in KANBAN_COLUMNS:
        col = 'INBOX'
    priority = data.get('priority', 'medium')
    if priority not in ('low', 'medium', 'high', 'urgent'):
        priority = 'medium'
    try:
        conn = _kanban_conn()
        max_pos = conn.execute(
            "SELECT COALESCE(MAX(position),0) FROM kanban_tasks WHERE column_name=?", (col,)
        ).fetchone()[0]
        cur = conn.execute(
            """INSERT INTO kanban_tasks (title, description, column_name, position, priority,
               assigned_agent, tags, ai_notes, due_date)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                title,
                data.get('description', ''),
                col,
                max_pos + 1,
                priority,
                data.get('assigned_agent', ''),
                data.get('tags', ''),
                data.get('ai_notes', ''),
                data.get('due_date', None),
            )
        )
        conn.commit()
        row = conn.execute("SELECT * FROM kanban_tasks WHERE id=?", (cur.lastrowid,)).fetchone()
        conn.close()
        return jsonify(_row_to_dict(row)), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/kanban/tasks/<int:task_id>', methods=['GET'])
def api_kanban_task_get(task_id):
    conn = _kanban_conn()
    row = conn.execute("SELECT * FROM kanban_tasks WHERE id=?", (task_id,)).fetchone()
    conn.close()
    if not row:
        return jsonify({"error": "not found"}), 404
    return jsonify(_row_to_dict(row))


@app.route('/api/kanban/tasks/<int:task_id>', methods=['PUT'])
def api_kanban_task_update(task_id):
    data = request.get_json(silent=True) or {}
    fields = []
    vals = []
    for f in ['title', 'description', 'priority', 'assigned_agent', 'tags', 'ai_notes', 'due_date']:
        if f in data:
            fields.append(f"{f}=?")
            vals.append(data[f])
    if not fields:
        return jsonify({"error": "no fields"}), 400
    fields.append("updated_at=datetime('now')")
    vals.append(task_id)
    try:
        conn = _kanban_conn()
        conn.execute(f"UPDATE kanban_tasks SET {', '.join(fields)} WHERE id=?", vals)
        conn.commit()
        row = conn.execute("SELECT * FROM kanban_tasks WHERE id=?", (task_id,)).fetchone()
        conn.close()
        if not row:
            return jsonify({"error": "not found"}), 404
        return jsonify(_row_to_dict(row))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/kanban/tasks/<int:task_id>', methods=['DELETE'])
def api_kanban_task_delete(task_id):
    try:
        conn = _kanban_conn()
        conn.execute("DELETE FROM kanban_tasks WHERE id=?", (task_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/kanban/tasks/<int:task_id>/move', methods=['POST'])
def api_kanban_task_move(task_id):
    data = request.get_json(silent=True) or {}
    new_col = data.get('column')
    new_pos = data.get('position', 0)
    if new_col not in KANBAN_COLUMNS:
        return jsonify({"error": "invalid column"}), 400
    try:
        conn = _kanban_conn()
        # Shift existing items in target column down
        conn.execute(
            "UPDATE kanban_tasks SET position=position+1 WHERE column_name=? AND position>=? AND id!=?",
            (new_col, new_pos, task_id)
        )
        conn.execute(
            "UPDATE kanban_tasks SET column_name=?, position=?, updated_at=datetime('now') WHERE id=?",
            (new_col, new_pos, task_id)
        )
        conn.commit()
        row = conn.execute("SELECT * FROM kanban_tasks WHERE id=?", (task_id,)).fetchone()
        conn.close()
        return jsonify(_row_to_dict(row))
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── AI Planning Flow ─────────────────────────────────────────────

@app.route('/api/kanban/ai-plan', methods=['POST'])
def api_kanban_ai_plan():
    """Generate AI planning notes for a task using gateway."""
    data = request.get_json(silent=True) or {}
    title = data.get('title', '')
    description = data.get('description', '')
    if not title:
        return jsonify({"error": "title required"}), 400

    prompt = f"""You are an AI task planner for Mission Control. Analyze this task and provide:
1. Clarifying questions (2-3 max)
2. Recommended assigned agent (from: Bill/main, Scout, Shark, Quill, Pixel, ACE)
3. Suggested priority (low/medium/high/urgent)
4. Estimated complexity (1-5)
5. Tags (comma-separated)

Task: {title}
Description: {description}

Reply in this exact JSON format:
{{
  "questions": ["q1", "q2"],
  "assigned_agent": "agent_name",
  "priority": "medium",
  "complexity": 3,
  "tags": "tag1,tag2",
  "notes": "brief planning notes"
}}"""

    try:
        headers = {"Authorization": f"Bearer {GATEWAY_TOKEN}", "Content-Type": "application/json"}
        payload = {
            "model": "anthropic/claude-sonnet-4-6",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 500
        }
        # Try gateway agent endpoint
        resp = requests.post(
            f"{GATEWAY_URL}/api/agent",
            json={"prompt": prompt, "session": "agent:main:main"},
            headers=headers,
            timeout=15
        )
        if resp.status_code == 200:
            text = resp.text
        else:
            # Fallback: return placeholder
            text = json.dumps({
                "questions": ["What's the deadline?", "Any dependencies?"],
                "assigned_agent": "main",
                "priority": "medium",
                "complexity": 2,
                "tags": "task",
                "notes": f"Auto-planned task: {title}"
            })
    except Exception as _ai_err:
        app.logger.error(f"AI plan error: {_ai_err}")
        text = json.dumps({
            "questions": ["What's the deadline?", "Any dependencies?"],
            "assigned_agent": "main",
            "priority": "medium",
            "complexity": 2,
            "tags": "task",
            "notes": f"Auto-planned task: {title}"
        })

    # Try to extract JSON from response
    try:
        import re as _re
        m = _re.search(r'\{.*\}', text, _re.DOTALL)
        if m:
            result = json.loads(m.group(0))
        else:
            result = json.loads(text)
    except Exception:
        result = {
            "questions": ["What's the deadline?", "Any dependencies?"],
            "assigned_agent": "main",
            "priority": "medium",
            "complexity": 2,
            "tags": "task",
            "notes": f"Task: {title}"
        }

    return jsonify(result)


# ── Gateway Agent/Session Discovery ─────────────────────────────

def _call_gateway_rpc(method, params=None, timeout=8):
    """Call OpenClaw gateway via WebSocket JSON-RPC."""
    result = {"error": "timeout"}
    evt = threading.Event()

    msg_id = str(uuid.uuid4())[:8]
    payload = json.dumps({"jsonrpc": "2.0", "id": msg_id, "method": method, "params": params or {}})

    def on_message(ws, message):
        try:
            data = json.loads(message)
            if data.get("id") == msg_id:
                result.clear()
                result.update(data.get("result", data))
                evt.set()
        except Exception:
            pass

    def on_error(ws, error):
        result["error"] = str(error)
        evt.set()

    def on_open(ws):
        ws.send(payload)

    try:
        ws = _ws_client.WebSocketApp(
            f"ws://127.0.0.1:18789/__openclaw__/ws",
            header=[f"Authorization: Bearer {GATEWAY_TOKEN}"],
            on_message=on_message,
            on_error=on_error,
            on_open=on_open,
        )
        t = threading.Thread(target=ws.run_forever, kwargs={"ping_timeout": timeout}, daemon=True)
        t.start()
        evt.wait(timeout=timeout)
        ws.close()
    except Exception as e:
        result["error"] = str(e)

    return result


@app.route('/api/gateway/sessions')
def api_gateway_sessions():
    """Discover active sessions/agents from OpenClaw gateway."""
    try:
        data = _call_gateway_rpc("sessions.list")
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/gateway/events')
def api_gateway_events():
    """SSE stream: proxy gateway WebSocket events to browser."""
    def generate():
        q = queue.Queue(maxsize=50)

        def on_message(ws, message):
            try:
                q.put_nowait(message)
            except queue.Full:
                pass

        def on_error(ws, error):
            q.put_nowait(json.dumps({"type": "error", "error": str(error)}))

        def on_close(ws, code, msg):
            q.put_nowait(None)  # sentinel

        def run_ws():
            try:
                ws = _ws_client.WebSocketApp(
                    "ws://127.0.0.1:18789/__openclaw__/ws",
                    header=[f"Authorization: Bearer {GATEWAY_TOKEN}"],
                    on_message=on_message,
                    on_error=on_error,
                    on_close=on_close,
                )
                ws.run_forever(ping_interval=20, ping_timeout=10)
            except Exception as e:
                q.put_nowait(json.dumps({"type": "error", "error": str(e)}))
                q.put_nowait(None)

        t = threading.Thread(target=run_ws, daemon=True)
        t.start()

        yield "data: {\"type\":\"connected\"}\n\n"

        while True:
            try:
                msg = q.get(timeout=30)
                if msg is None:
                    yield "data: {\"type\":\"disconnected\"}\n\n"
                    break
                yield f"data: {msg}\n\n"
            except queue.Empty:
                yield "data: {\"type\":\"heartbeat\"}\n\n"

    return app.response_class(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Connection': 'keep-alive',
        }
    )


# ── Trading Signals DB ────────────────────────────────────────────

@app.route('/api/trading-signals/db')
def api_trading_signals_db():
    """Pull latest signals from sharktime and ict-scanner SQLite DBs."""
    result = {
        "sharktime": [],
        "ict_alerts": [],
        "sharktime_trades": [],
        "last_updated": datetime.now().isoformat()
    }

    # Sharktime signals
    try:
        if os.path.exists(SHARKTIME_DB):
            conn = sqlite3.connect(SHARKTIME_DB)
            conn.row_factory = sqlite3.Row
            rows = conn.execute("""
                SELECT id, asset, direction, signal_type, timeframe,
                       ROUND(confidence_score, 3) as confidence_score,
                       entry_price_low, entry_price_high, tp1_price, tp2_price, sl_price,
                       ROUND(r_r_ratio, 2) as r_r_ratio, status, created_at
                FROM signals
                ORDER BY created_at DESC
                LIMIT 20
            """).fetchall()
            result["sharktime"] = [dict(r) for r in rows]

            # Recent trades
            trade_rows = conn.execute("""
                SELECT id, asset, direction, entry_price, exit_price, exit_reason,
                       ROUND(pnl_usd, 2) as pnl_usd, status, timestamp
                FROM trades
                ORDER BY timestamp DESC
                LIMIT 10
            """).fetchall()
            result["sharktime_trades"] = [dict(r) for r in trade_rows]
            conn.close()
    except Exception as e:
        result["sharktime_error"] = str(e)

    # ICT Scanner alerts
    try:
        if os.path.exists(ICT_ALERTS_DB):
            conn = sqlite3.connect(ICT_ALERTS_DB)
            conn.row_factory = sqlite3.Row
            rows = conn.execute("""
                SELECT alert_id, symbol, timeframe, setup_type,
                       sent_timestamp, message_text
                FROM alerts
                ORDER BY sent_timestamp DESC
                LIMIT 15
            """).fetchall()
            result["ict_alerts"] = [dict(r) for r in rows]
            conn.close()
    except Exception as e:
        result["ict_error"] = str(e)

    return jsonify(result)


@app.route('/api/kanban/columns')
def api_kanban_columns():
    return jsonify(KANBAN_COLUMNS)


if __name__ == '__main__':
    port = 8889
    print("Starting Mission Control v2...")
    _ensure_message_center_db()
    init_kanban_db()
    init_approvals_db()
    print(f"Dashboard available at: http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
