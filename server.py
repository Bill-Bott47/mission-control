#!/usr/bin/env python3
"""
Mission Control v1 - Dashboard for Jonathan
Simple Flask server serving a real-time dashboard
"""

import json
import os
import subprocess
import psutil
import time
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, render_template, jsonify, request
import requests
import re

app = Flask(__name__)

# Configuration
GATEWAY_TOKEN = "2306cfed437022f822d3830b3347fc2ab154abc32a3f0e03"
GATEWAY_URL = "http://127.0.0.1:18789"
EMMA_GATEWAY_URL = "http://127.0.0.1:18790"
TRADING_DIR = "/Users/bill/.openclaw/workspace/trading"
REMINDERS_FILE = "/Users/bill/.openclaw/workspace/REMINDERS.md"

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

@app.route('/')
def dashboard():
    """Main dashboard page"""
    return render_template('index.html')

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

@app.route('/api/infrastructure')
def api_infrastructure():
    """API endpoint for infrastructure map data"""
    return jsonify({
        "timestamp": datetime.now().isoformat(),
        **get_infrastructure_data()
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
    """Save pipeline data with atomic write"""
    # Atomic write: write to temp file, then rename
    temp_file = CONTENT_PIPELINE_FILE + '.tmp'
    try:
        with open(temp_file, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(temp_file, CONTENT_PIPELINE_FILE)
        return True
    except Exception as e:
        print(f"Error saving pipeline: {e}")
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
    
    import uuid
    item = {
        "id": str(uuid.uuid4()),
        "topic": new_item.get('topic'),
        "source": new_item.get('source', 'unknown'),
        "stage": new_item.get('stage', 'trending'),
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
        "content": {
            "research": new_item.get('content', {}).get('research', ''),
            "script": new_item.get('content', {}).get('script', ''),
            "visual_url": new_item.get('content', {}).get('visual_url', '')
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
    new_stage = request.get_json().get('stage')
    
    if not new_stage:
        return jsonify({"error": "Missing stage"}), 400
    
    valid_stages = ['trending', 'research', 'script', 'visual', 'approved']
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

if __name__ == '__main__':
    # Try port 8888 first, fall back to 8889 if occupied
    port = 8888
    print("Starting Mission Control v1...")
    
    # Check if port 8888 is available
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('0.0.0.0', 8888))
    except OSError:
        print(f"Port 8888 is in use, using port 8889 instead...")
        port = 8889
    
    print(f"Dashboard available at: http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)