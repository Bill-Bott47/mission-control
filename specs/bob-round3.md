# Bob Round 3 — MC v2 Complete Visual + Functional Rebuild

## Context
The previous visual rebuild was lost (sub-agent sandbox, never committed). We're rebuilding from the current codebase which has: Flask server.py (2021 lines), basic templates (index.html, kanban.html, agents.html, tasks.html, message_center.html), and static assets. The Kanban board and server routes are solid — the UI layer needs a complete overhaul.

## CRITICAL: Commit Your Work
- **Git commit all changes before finishing.** Branch: `feature/mc-v2-visual`
- Every file you create or modify MUST be committed
- Do NOT rely on the working directory persisting — git is the source of truth

## Server: Port 8889
- The server runs on port 8889. Do NOT change the port.
- Test by starting the server and verifying http://localhost:8889 returns 200

## Design Direction
- Dark terminal aesthetic (current dark blue theme is fine as base)
- Clean, modern, information-dense but readable
- Color variation — don't be monotone. Different sections should have visual distinction
- Agent colors: each agent gets a distinct color used consistently across all pages

## Pages to Build/Rebuild

### 1. Dashboard (index.html) — COMPLETE REBUILD
**Kill:** Bot Status, Cron Jobs (404), Reminders, Migration Plan, Pending Tasks, Infrastructure
**Build:**
- **Ticker strip at top** — scrolling horizontal bar showing latest trading signals: `NVDA SHORT 90% · SPY SHORT 67%` etc. Green for LONG, red for SHORT. Data from `/api/signals` endpoint
- **4 clean cards below:**
  - **Your Crew** — agent status summary (how many active, last activity)  
  - **System Health** — gateway status, uptime, error count
  - **Recent Activity** — last 5-10 agent actions/events
  - **Task Summary** — open/in-progress/done counts from kanban.db

### 2. Navigation — REBUILD
**Current:** Top nav bar with Dashboard, Kanban, Agents, Tasks, Messages, Ops
**New sidebar navigation:**
- Dashboard
- Tasks (Kanban)
- Content (Pipeline)
- Calendar
- Team (merge old Agents page here)
- Projects
- Memory
- Docs
- Approvals (with badge count for pending items)
- Council
- Office

Remove "Messages" and "Ops" from top-level nav. Messages content moves under an Activity sub-section if needed.

### 3. Team Page — REBUILD (replaces Agents)
- Pull agent list from `/api/team` endpoint (already returns 13 agents)
- Each agent card: emoji, name, role, status indicator (online/idle/offline), last active time
- Add SENTINEL to the data (it's missing from agents.json — add it: SENTINEL 🛡️, Infrastructure Monitor, pai Ollama)
- Full agent list: Bill 🫡, Bob 🔨, Forge ⚒️, Truth 👁️, Shark 🦈, ACE 💪, Sam 🎯, Marty 📣, Quill ✍️, Pixel 🎨, Scrub 🧽, Scout 🔭, Content PM 🗓️, Librarian 📚, Music Biz 🎶, Vitruviano PM 📱, Ops 🛠️, SENTINEL 🛡️

### 4. Calendar Page — NEW
- **Default to Day view** (not week) — today's schedule with full readable blocks
- Pull real cron job data from gateway: use `subprocess.run(["openclaw", "cron", "list", "--json"], capture_output=True)` in a new `/api/cron-jobs-live` endpoint
- **Color by agent** — each agent/job source gets a distinct color
- **Color legend** at top showing which color = which agent
- **"Always Running" section** — horizontal scrolling list for high-frequency jobs (≤15min interval), NOT chopped circles/chips
- Job blocks tall enough to show full name in day view
- Click a job → clean detail panel (not the ugly sidebar from before)

### 5. Content Pipeline Page — NEW
- Pipeline stages: Trending → Research → Script → Visual → Approved → Published
- Interactive: create new pieces, drag between stages, approve/reject
- Each piece shows: title, assigned agent, current stage, created date
- Data model: create `content_pipeline` table in mission-control.db or use content-pipeline.json
- API endpoints: GET/POST/PUT /api/content-pipeline

### 6. Tasks/Kanban — ENHANCE (existing works, add interactivity)
- Keep current Kanban board structure
- Add: create task button, drag-and-drop between columns, assign to agents, mark complete, add notes
- Import existing tasks: create `/api/import-tasks` endpoint that reads TASK_TRACKER.md and populates kanban.db
- Wire up the import on first load if kanban.db is empty

### 7. Projects Page — REBUILD  
- Data from data/projects.json (already has 7+ projects)
- Card layout with: name, description, status badge, priority (show ONCE, with "why"), assignee (prominent), progress %
- **Clickable cards** → detail slide-out showing linked tasks + completion status
- Fix: priority was showing twice (redundant label). Show once with context.
- Add missing projects if not in projects.json

### 8. Memory Page — NEW
- Three-column layout: file list | file content viewer | search
- Reads from workspace memory files: `../../memory/*.md` + `../../MEMORY.md`
- Search functionality across all memory files
- Already approved by Jonathan — keep it clean

### 9. Docs Page — NEW  
- Two sections:
  - **Workspace Files** — SOUL.md, AGENTS.md, TOOLS.md, USER.md, TASK_TRACKER.md, project specs (browsable + readable in-app)
  - **GitHub Repos** — mission-control, vitruvian-phoenix, workspace. Show: last commit, open PRs, branch status
- For GitHub data: shell out to `gh repo view --json` and `gh pr list --json`
- File viewer: click a file → renders markdown content

### 10. Approvals Page — NEW (placeholder with structure)
- Queue of items waiting for Jonathan's sign-off
- Each item: what it is, who's waiting, why it matters
- Actions: Approve, Reject, Reply (free-text input field for context/questions)
- Sidebar nav badge showing pending count (red dot or number)
- API: GET/POST /api/approvals
- Data model: `approvals` table in mission-control.db (id, title, description, submitted_by, status, reply_text, created_at, resolved_at)

### 11. Council Page — NEW (placeholder with structure)
- Three councils displayed:
  - **Content Council**: Quill, Pixel, Scrub, Content PM, Marty, Scout
  - **Business Council**: Bob, Sam, Scout, Scrub
  - **Project Council**: Scout, Marty, Sam, Bob, Scrub
- Each council shows: members, active deliberations (empty for now), recent decisions, pass/fail rates
- This is a placeholder — the deliberation engine comes later

### 12. Office Page — NEW (placeholder)
- Placeholder page with a fun visual
- Style inspiration: eBoy (eboy.com) — isometric pixel art city scenes
- For now: a static placeholder image or CSS art with "Office — Coming Soon"
- This will eventually be an interactive isometric view of the agent workspace

## Technical Requirements
- All new pages need: HTML template in templates/, CSS in static/, JS in static/ if interactive
- Use a shared base template (create templates/base.html) with the sidebar nav
- All existing pages must extend base.html
- Server endpoints for new data sources
- SQLite for Approvals + Content Pipeline data
- Keep kanban.db as-is for tasks

## File Structure After Build
```
templates/
  base.html          # Shared layout with sidebar
  index.html         # Dashboard (rebuilt)
  kanban.html        # Tasks/Kanban (enhanced)
  team.html          # Team page (new)
  calendar.html      # Calendar (new)
  content.html       # Content Pipeline (new)
  projects.html      # Projects (rebuilt)
  memory.html        # Memory (new)
  docs.html          # Docs (new)
  approvals.html     # Approvals (new)
  council.html       # Council (new)
  office.html        # Office placeholder (new)
static/
  shell.css          # Sidebar + global layout
  style.css          # Base styles (updated)
  kanban.css/js      # Keep existing
  calendar.css/js    # New
  content.css/js     # New
  projects.css/js    # Updated
  memory.css/js      # New
  docs.css/js        # New
  approvals.css/js   # New
  council.css        # New
  office.css         # New
```

## What NOT to Do
- Don't break existing API endpoints
- Don't change the port from 8889
- Don't remove kanban.db or its schema
- Don't hardcode agent lists — pull from API or agents.json where possible
