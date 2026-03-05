# Bob Task: Signals Page Fix + Kanban Live Activity + Projects-Tasks Sync

## Repo
`/Users/bill/.openclaw/workspace/mission-control` on branch `feature/mc-v2-visual`

## CRITICAL: git commit + git push before finishing.

## Task 1: Signals Page — Fix Stale Data

**Problem:** Signals page shows data from March 1 (4 days stale). No SL/TP. API returns 0 signals.

**Root cause:** `/api/signals` endpoint isn't properly reading:
- Shark snapshot: `/Users/bill/.openclaw/workspace/trading/shark/latest_snapshot.txt`
- ICT scanner: `/Users/bill/.openclaw/workspace/trading/weekly_scanner/signals.json`

**Fix:**
- Debug and fix the `/api/signals` endpoint in `server.py` to properly parse both files
- Add file modification timestamp to the API response so the UI can show "Last updated: X ago"
- If data is older than 24h, show a warning badge "⚠️ Stale — last update X days ago"
- Display SL/TP fields if present in the signal data (they may not always be there — show "—" if missing)

## Task 2: Kanban Live Activity Panel

**Problem:** Shows "embedded all on February 26" — stale and confusing.

**Fix:**
- Replace with a real activity feed from these sources:
  - Recent git commits from the MC repo: `git log --oneline -10 --since="7 days ago"`
  - Recent cron job completions (read from gateway if available)
  - Or simplest: Read recent entries from `/Users/bill/.openclaw/workspace/memory/` daily files
- Show as a scrollable list: timestamp + event description
- Title it "Recent Activity" not "Live Activity"
- If no recent data, show "No recent activity" instead of stale placeholder

## Task 3: Projects ↔ Tasks Linkage

**Problem:** 17 projects exist in `data/projects.json` but many don't have tasks in the kanban. Jonathan wants every project to have assigned tasks.

**Fix:**
- In the `/api/projects` endpoint, cross-reference each project with kanban tasks (match by project name or tag)
- Return `task_count` and `task_ids` for each project in the API response
- In the projects page UI, show task count badge on each project card
- Projects with 0 tasks should show a "⚠️ No tasks" indicator
- Add a "View Tasks" link on each project card that filters the kanban to that project's tasks

## Commit
`git add -A && git commit -m "fix: signals data, kanban activity, projects-tasks linkage" && git push`
