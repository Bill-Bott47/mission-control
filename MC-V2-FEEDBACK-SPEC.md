# JonathanOS v2 — Feedback Spec
**Source:** Jonathan's voice review, 2026-03-05 1:49-2:04 PM
**Priority:** P1 — Wire up and fix before next review

---

## Dashboard Page

### 1. My Crew Widget — BROKEN
- Shows 0 active, 0 erroring, 0 idle
- API not returning agent data. Was working before. Fix the data source.

### 2. System Health — Gateway showing "down"
- Gateway is NOT down. Fix the status check to reflect reality.

### 3. pai Compute — Needs more detail
- Currently just says "up"
- Add: what's working, what's not, utilization %, memory/VRAM usage

### 4. Cron Jobs — Errors need drill-down
- OK vs Error breakdown is fine
- **Errors must be clickable** — click into erroring job to see details/logs

### 5. Uptime — Reframe
- Show "uptime since last restart"
- Include reason for last restart

### 6. Recent Activity — Git commits unhelpful
- Hex commit hashes mean nothing to Jonathan
- Replace with human-readable commit messages or remove git commits entirely

### 7. Task Summary — Needs color
- Just numbers isn't enough
- Add color coding / visual distinction per status (e.g., green for done, red for blocked)

### 8. Shark Calls Ticker — CRITICAL FIXES
- **Dashboard shows OLD format** — needs to match the new Signals page format
- Currently just bubbles saying "medium/high" with zero info
- **Required info per call:** Confidence + Asset + Direction + Entry + TP + SL
  - Example: "HIGH · BTC Long · Entry $72K · TP $74K · SL $71K"
  - Can be 2 lines per call
- **Animation broken:** resets and restarts instead of seamless infinite loop
  - Fix: CSS `translateX` continuous scroll, items wrap from left to right end
- **Speed:** Currently too fast — slow down the scroll

---

## Signals Page

### 1. Missing asset names on signal cards
### 2. Layout change: Two columns
- **Longs on LEFT, Shorts on RIGHT**
### 3. Sort by time
- Newest at top, oldest at bottom
### 4. Remove box layout — make more readable

---

## Tasks Page
- ✅ Jonathan happy with current state
- No major feedback

---

## Content Pipeline Page

### 1. Cards must be clickable
- Click into card → see the actual content inside

### 2. Reorder columns
- **Research LEFT of Trending** (currently reversed)

### 3. Two-layer layout
- **Top row:** Trending + Research (inputs / what's new)
- **Bottom row:** Script + Approved (in process)
- **Rejected/Killed:** Push down, not prominent on main view

---

## Calendar Page
- Empty / no data — needs calendar API wired

---

## Team Page

### 1. Task sort order
- Sort by **status**, not task number
- Order: In Progress → To Do → Blocked → Completed

### 2. Agent Detail Pages (click into agent)
- **Accurate live status** at top (currently showing "offline" / "last active: nothing" — both wrong)
- **Tasks in boxes by status:** Working On → Next Up (scheduled order) → Blocked → Completed
- **Prompt excerpt** at bottom — currently empty. Show each agent's soul/personality.
- **Process rules** — Jonathan loves this. Move some to top as "rules of the road." Add escalation rules.
- **Verify sub-agents see process rules** — confirm written into each agent's prompt

---

## Projects Page — CONCEPTUAL RETHINK

### Projects vs Operations vs Wikis
Jonathan wants to distinguish:
- **Projects** = finite (start + finish)
- **Operations** = ongoing, always running
- **Wikis** = accumulated research/knowledge

### Actual Projects (keep):
- Vitruviano App
- Trader Monitor Rebuild (why stalled?)
- Phoenix Outbound Engine
- Discord Voice Feedback Bot
- Web3 Research Agent ("new lead gen source" NOT blocking it)

### NOT Projects (move to operations/wiki):
- Phoenix Agency — ongoing business, not a project
- Agent Council — creates projects, isn't one
- pai Compute — ongoing infra, more of a wiki
- Emma — mark COMPLETE, remove from active

### Mark Complete:
- Health Data Integration — Withings + Oura both wired

### Needs Discussion:
- YouTube Agent — "I have no idea what that is" — 23 tasks Jonathan never heard of
- Bill's Business / Agent OS — not a project yet

### Action:
- Consider adding a **Wiki tab** for ongoing research/operations
- Iterate with Jonathan on taxonomy

---

## Memory Page
- ✅ Good overall
- **Reverse sort order** — start with most recent day, not oldest

---

## Docs Page
- ✅ No feedback

---

## Approvals Page
- Jonathan's notes/approvals **must trigger something** — response in Discord or action
- Confirm feedback loop is wired

---

## Council Page
- Under each council item, add **clickable boxes** showing:
  - The ideas discussed
  - Feedback from each council member
  - How the idea evolved into its final form

---

## Usage Page
- Everything at 100% — known issue, fix data
- **ChannelBurn, Sentinel Reports, Daily reports are SLOW** — optimize loading

---

## Office Page
- Have Pixel work on design details
- "Do something cute" — explore creative office visual ideas

---

## Implementation Notes
- Bob handles all frontend changes
- Forge review required before deploy
- Data source fixes (crew, health, usage) may need API/backend work from Bill
