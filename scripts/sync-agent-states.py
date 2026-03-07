#!/usr/bin/env python3
"""Sync OpenClaw gateway session activity to Star Office state.

- Reads active OpenClaw sessions from gateway API (default: http://127.0.0.1:18789)
- Maps session activity to Star Office states
- Pushes state updates to Star Office /set_state
- Loops every 30 seconds by default
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

import requests

try:
    import websocket  # type: ignore
except Exception:
    websocket = None

GATEWAY_BASE = os.environ.get("OPENCLAW_GATEWAY_URL", "http://127.0.0.1:18789").rstrip("/")
STAR_OFFICE_BASE = os.environ.get("STAR_OFFICE_URL", "http://127.0.0.1:19000").rstrip("/")
GATEWAY_TOKEN = os.environ.get(
    "OPENCLAW_GATEWAY_TOKEN",
    "2306cfed437022f822d3830b3347fc2ab154abc32a3f0e03",
)
SYNC_INTERVAL_SECONDS = int(os.environ.get("SYNC_INTERVAL_SECONDS", "30"))
ACTIVE_WINDOW_SECONDS = int(os.environ.get("SYNC_ACTIVE_WINDOW_SECONDS", "300"))
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("SYNC_REQUEST_TIMEOUT_SECONDS", "8"))

STATE_IDLE = "idle"
STATE_WRITING = "writing"
STATE_RESEARCHING = "researching"
STATE_EXECUTING = "executing"
STATE_SYNCING = "syncing"
STATE_ERROR = "error"
VALID_STATES = {
    STATE_IDLE,
    STATE_WRITING,
    STATE_RESEARCHING,
    STATE_EXECUTING,
    STATE_SYNCING,
    STATE_ERROR,
}

AGENT_NAME_MAP = {
    "main": "Bill",
    "bill": "Bill",
    "forge": "Forge",
    "truth": "Truth",
    "bob": "Bob",
    "shark": "Shark",
    "ace": "Ace",
    "sam": "Sam",
    "marty": "Marty",
    "quill": "Quill",
    "pixel": "Pixel",
    "scrub": "Scrub",
    "scout": "Scout",
    "music-biz": "Music Biz",
    "music_biz": "Music Biz",
    "vitruviano-pm": "Vitruviano PM",
    "vitruviano_pm": "Vitruviano PM",
    "sentinel": "Sentinel",
}

STATUS_ACTIVE_HINTS = {
    "active",
    "running",
    "busy",
    "online",
    "processing",
    "working",
}

STATUS_INACTIVE_HINTS = {
    "idle",
    "offline",
    "stopped",
    "complete",
    "completed",
    "done",
    "closed",
    "inactive",
}

ERROR_KEYWORDS = (
    "error",
    "failed",
    "exception",
    "crash",
    "panic",
)
SYNC_KEYWORDS = (
    "sync",
    "backup",
    "upload",
    "download",
    "push",
    "pull",
    "merge",
)
RESEARCH_KEYWORDS = (
    "research",
    "investigate",
    "analysis",
    "analyze",
    "explore",
    "read docs",
)
EXECUTE_KEYWORDS = (
    "execute",
    "executing",
    "run",
    "running",
    "test",
    "build",
    "deploy",
    "command",
    "terminal",
)
WRITING_KEYWORDS = (
    "write",
    "writing",
    "draft",
    "plan",
    "edit",
    "refactor",
    "implement",
    "code",
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: Any) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, (int, float)):
        ts = float(value)
        if ts > 1e12:
            ts /= 1000.0
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        except Exception:
            return None
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _pick(session: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in session and session[key] not in (None, ""):
            return session[key]
    return None


def _normalize_agent_key(session: Dict[str, Any]) -> str:
    raw = _pick(
        session,
        "agent",
        "agentId",
        "agent_id",
        "slug",
        "name",
        "owner",
    )
    if not raw:
        return "main"
    text = str(raw).strip().lower()
    text = text.replace(" ", "-")
    if text.startswith("agent/"):
        text = text.split("/", 1)[1]
    return text


def _display_name(agent_key: str) -> str:
    if agent_key in AGENT_NAME_MAP:
        return AGENT_NAME_MAP[agent_key]
    return agent_key.replace("-", " ").title()


def _extract_sessions(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []

    for key in ("sessions", "items", "data", "result"):
        value = payload.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]
        if isinstance(value, dict):
            nested = _extract_sessions(value)
            if nested:
                return nested

    if all(not isinstance(v, (list, dict)) for v in payload.values()):
        return []

    nested_candidates: List[Dict[str, Any]] = []
    for value in payload.values():
        nested_candidates.extend(_extract_sessions(value))
    return nested_candidates


def _fetch_sessions_http() -> List[Dict[str, Any]]:
    headers = {}
    if GATEWAY_TOKEN:
        headers["Authorization"] = f"Bearer {GATEWAY_TOKEN}"

    endpoints = (
        f"{GATEWAY_BASE}/__openclaw__/api/sessions",
        f"{GATEWAY_BASE}/api/sessions",
        f"{GATEWAY_BASE}/sessions",
    )

    for url in endpoints:
        try:
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
            if resp.status_code >= 400:
                continue
            payload = resp.json()
            sessions = _extract_sessions(payload)
            if sessions:
                return sessions
        except Exception:
            continue
    return []


def _fetch_sessions_ws() -> List[Dict[str, Any]]:
    if websocket is None:
        return []
    ws_url = GATEWAY_BASE.replace("http://", "ws://").replace("https://", "wss://") + "/__openclaw__/ws"
    message_id = str(uuid.uuid4())[:8]
    request_payload = {
        "jsonrpc": "2.0",
        "id": message_id,
        "method": "sessions.list",
        "params": {},
    }
    headers = []
    if GATEWAY_TOKEN:
        headers.append(f"Authorization: Bearer {GATEWAY_TOKEN}")

    ws = None
    try:
        ws = websocket.create_connection(ws_url, timeout=REQUEST_TIMEOUT_SECONDS, header=headers)
        ws.send(json.dumps(request_payload))
        deadline = time.time() + REQUEST_TIMEOUT_SECONDS
        while time.time() < deadline:
            raw = ws.recv()
            data = json.loads(raw)
            if data.get("id") != message_id:
                continue
            result = data.get("result", data)
            sessions = _extract_sessions(result)
            if sessions:
                return sessions
            if isinstance(result, dict):
                direct = _extract_sessions(result)
                if direct:
                    return direct
            return []
    except Exception:
        return []
    finally:
        if ws is not None:
            try:
                ws.close()
            except Exception:
                pass
    return []


def fetch_sessions() -> List[Dict[str, Any]]:
    sessions = _fetch_sessions_http()
    if sessions:
        return sessions
    return _fetch_sessions_ws()


def _is_active_session(session: Dict[str, Any]) -> bool:
    status_text = str(
        _pick(session, "status", "state", "phase", "lifecycle") or ""
    ).strip().lower()

    if status_text in STATUS_INACTIVE_HINTS:
        return False
    if status_text in STATUS_ACTIVE_HINTS:
        return True

    last_activity = _pick(
        session,
        "lastActivityAt",
        "last_activity_at",
        "updatedAt",
        "updated_at",
        "startedAt",
        "started_at",
    )
    dt = _parse_dt(last_activity)
    if dt is None:
        return True
    return (_utc_now() - dt).total_seconds() <= ACTIVE_WINDOW_SECONDS


def _session_text(session: Dict[str, Any]) -> str:
    parts = [
        str(_pick(session, "activity", "currentTask", "task", "detail", "summary", "title") or ""),
        str(_pick(session, "status", "state", "phase") or ""),
        str(_pick(session, "command", "mode") or ""),
    ]
    return " ".join(p for p in parts if p).strip().lower()


def map_session_to_state(session: Dict[str, Any]) -> str:
    text = _session_text(session)

    if any(word in text for word in ERROR_KEYWORDS):
        return STATE_ERROR
    if any(word in text for word in SYNC_KEYWORDS):
        return STATE_SYNCING
    if any(word in text for word in RESEARCH_KEYWORDS):
        return STATE_RESEARCHING
    if any(word in text for word in EXECUTE_KEYWORDS):
        return STATE_EXECUTING
    if any(word in text for word in WRITING_KEYWORDS):
        return STATE_WRITING
    return STATE_IDLE


def _activity_rank(session: Dict[str, Any]) -> float:
    last_activity = _pick(
        session,
        "lastActivityAt",
        "last_activity_at",
        "updatedAt",
        "updated_at",
        "startedAt",
        "started_at",
    )
    dt = _parse_dt(last_activity)
    if dt is None:
        return 0.0
    return dt.timestamp()


def _agent_priority(agent_key: str) -> int:
    if agent_key in {"main", "bill"}:
        return 0
    return 1


def choose_primary_session(sessions: Iterable[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    active = [s for s in sessions if _is_active_session(s)]
    if not active:
        return None

    def sort_key(session: Dict[str, Any]) -> Any:
        agent_key = _normalize_agent_key(session)
        return (_agent_priority(agent_key), -_activity_rank(session), agent_key)

    active.sort(key=sort_key)
    return active[0]


def build_detail(agent_key: str, session: Dict[str, Any], state: str) -> str:
    name = _display_name(agent_key)
    task = _pick(session, "activity", "currentTask", "task", "summary", "title", "detail")
    if task:
        text = re.sub(r"\s+", " ", str(task)).strip()
        if len(text) > 120:
            text = text[:117] + "..."
        return f"{name}: {text}"
    return f"{name}: {state}"


def push_star_office_state(state: str, detail: str) -> Dict[str, Any]:
    if state not in VALID_STATES:
        state = STATE_IDLE

    url = f"{STAR_OFFICE_BASE}/set_state"
    payload = {"state": state, "detail": detail}
    resp = requests.post(url, json=payload, timeout=REQUEST_TIMEOUT_SECONDS)
    resp.raise_for_status()
    try:
        return resp.json()
    except Exception:
        return {"status": "ok"}


def run_once(last_sent: Optional[Dict[str, str]]) -> Dict[str, str]:
    sessions = fetch_sessions()
    primary = choose_primary_session(sessions)

    if primary is None:
        state = STATE_IDLE
        detail = "No active OpenClaw sessions"
    else:
        agent_key = _normalize_agent_key(primary)
        state = map_session_to_state(primary)
        detail = build_detail(agent_key, primary, state)

    current = {"state": state, "detail": detail}
    if last_sent == current:
        print(f"[{datetime.now().isoformat()}] no-op {state} :: {detail}")
        return last_sent

    try:
        result = push_star_office_state(state, detail)
        print(f"[{datetime.now().isoformat()}] pushed {state} :: {detail} -> {result}")
        return current
    except Exception as exc:
        print(f"[{datetime.now().isoformat()}] push failed: {exc}", file=sys.stderr)
        return last_sent or current


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync OpenClaw session activity to Star Office state")
    parser.add_argument("--interval", type=int, default=SYNC_INTERVAL_SECONDS, help="Loop interval in seconds (default: 30)")
    parser.add_argument("--once", action="store_true", help="Run one sync cycle and exit")
    args = parser.parse_args()

    last_sent: Optional[Dict[str, str]] = None
    if args.once:
        run_once(last_sent)
        return 0

    while True:
        started = time.time()
        last_sent = run_once(last_sent)
        elapsed = time.time() - started
        sleep_for = max(1, args.interval - int(elapsed))
        time.sleep(sleep_for)


if __name__ == "__main__":
    raise SystemExit(main())
