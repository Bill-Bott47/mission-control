# QA Checklist — MC v2 Complete Review

Every item below came directly from Jonathan's feedback in #bill-direct on March 4, 2026. The QA agent must verify each line. Mark ✅ or ❌.

## Design (from Alex Finn reference screenshots)
- [ ] Dark theme: background `#0D0D0F` to `#141420` (NOT navy blue)
- [ ] Purple/violet accent color `#7C3AED` (NOT blue)
- [ ] Sans-serif font (Inter or system) — NOT monospace
- [ ] Left sidebar navigation ~170-180px with icons
- [ ] Sidebar has ALL pages: Dashboard, Tasks, Content, Calendar, Team, Projects, Memory, Docs, Approvals, Council, Office
- [ ] Active sidebar item has highlighted background
- [ ] Cards have rounded corners (12px), subtle borders, elevated from background
- [ ] Color variation across sections — NOT monotone
- [ ] Each agent has a distinct consistent color

## Dashboard (COMPLETE REBUILD)
- [ ] Bot Status section REMOVED (all bots stopped, useless)
- [ ] Cron Jobs section REMOVED (was showing 404)
- [ ] Old Reminders section REMOVED
- [ ] Ticker strip at top with trading signals (green=LONG, red=SHORT)
- [ ] "Your Crew" card — agent status summary
- [ ] "System Health" card — gateway status, uptime, errors
- [ ] "Recent Activity" card — last 5-10 agent actions
- [ ] "Task Summary" card — open/in-progress/done counts
- [ ] Only 4 cards + ticker strip — nothing else

## Team Page (replaces Agents)
- [ ] Merged from separate Agents page — no duplicate
- [ ] Shows ALL agents (at minimum 16): Bill, Bob, Forge, Truth, Shark, ACE, Sam, Marty, Quill, Pixel, Scrub, Scout, Content PM, SENTINEL, Librarian, Music Biz, Vitruviano PM, Ops
- [ ] SENTINEL is included (was missing before)
- [ ] Each card: emoji, name, role, status, last active
- [ ] Agent avatar colors are distinct and consistent

## Tasks/Kanban
- [ ] Existing Kanban board structure preserved
- [ ] Create task button works
- [ ] Can move tasks between columns (drag-and-drop or buttons)
- [ ] Real task data from kanban.db or TASK_TRACKER.md import
- [ ] Cards show assignee and notes

## Calendar
- [ ] DEFAULT VIEW IS DAY (not week) — Jonathan explicitly asked for this
- [ ] Pulls real cron job data from gateway
- [ ] Color-coded by agent/source — each agent gets a distinct color
- [ ] Color LEGEND at top showing which color = which agent
- [ ] "Always Running" section for high-frequency jobs (≤15min interval)
- [ ] Always Running shown as horizontal scrolling list (NOT chopped circles)
- [ ] Job blocks tall enough to show full name in day view
- [ ] Click job → clean detail panel
- [ ] More color variation — not monotone

## Content Pipeline (NOT Message Center)
- [ ] Shows content pipeline stages: Trending → Research → Script → Visual → Approved → Published
- [ ] Interactive: create, drag between stages, approve/reject
- [ ] Each piece shows: title, agent, stage, date
- [ ] NOT showing the old Message Center (debug tool) — that's gone

## Projects
- [ ] Card layout with: name, description, status badge
- [ ] Priority shown ONCE with "why" — NOT twice (was duplicate before)
- [ ] Prominent assignees on each card
- [ ] Clickable cards → detail view
- [ ] Progress bar or percentage
- [ ] All projects from data/projects.json

## Memory
- [ ] Three-column layout: file list | viewer | search
- [ ] Reads real workspace memory files
- [ ] Search works across memory files
- [ ] Jonathan approved this as-is — keep it clean

## Docs
- [ ] Workspace files section: SOUL.md, AGENTS.md, TOOLS.md, etc.
- [ ] GitHub repos section: mission-control, vitruvian-phoenix, workspace
- [ ] Real data (not placeholder)
- [ ] Click file → renders content

## Approvals
- [ ] Queue of items pending Jonathan's approval
- [ ] Each item: what, who, why
- [ ] Actions: Approve, Reject, Reply (with text input)
- [ ] Sidebar nav badge showing pending count
- [ ] Interactive — buttons actually work

## Council
- [ ] Content Council: Quill, Pixel, Scrub, Content PM, Marty, Scout
- [ ] Business Council: Bob, Sam, Scout, Scrub
- [ ] Project Council: Scout, Marty, Sam, Bob, Scrub
- [ ] Rosters match EXACTLY (Jonathan 👍'd these)
- [ ] Shows: members, active deliberations, recent decisions

## Office
- [ ] eBoy isometric pixel art style (Jonathan's request)
- [ ] Placeholder is acceptable for now
- [ ] "Coming Soon" or similar

## Navigation
- [ ] OLD top nav bar REMOVED
- [ ] New LEFT sidebar
- [ ] Sidebar items have icons
- [ ] "Messages" and "Ops" NOT in top-level nav
- [ ] Approvals has badge count for pending items

## Technical
- [ ] Server runs on port 8889
- [ ] All files committed to git branch `feature/mc-v2-visual`
- [ ] Branch pushed to origin
- [ ] No broken imports or 500 errors
- [ ] All pages load without JS errors
