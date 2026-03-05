# Bob Task: Final MC v2 Cleanup (T-115)

## Repo
`/Users/bill/.openclaw/workspace/mission-control` on branch `feature/mc-v2-visual`

## CRITICAL: git commit + git push before finishing.

## Remaining Items

### 1. Kanban — Verify Live Activity is Working
- The Recent Activity feed should be pulling from memory files, not showing "embedded all on February 26"
- Verify it renders correctly on the kanban page
- If the kanban template still has old "Live Activity" text, rename to "Recent Activity"

### 2. Signals — Show "—" for Missing SL/TP
- SL and TP fields return `null` from the API
- In the signals page cards, show "—" instead of "null" or blank for SL/TP
- Add a note: "SL/TP auto-calculation coming soon" if all signals have null SL/TP

### 3. Videri Project — Assign a Task
- The project "Videri Digital Display" has 0 tasks
- Add a task to kanban.db: "Videri Digital Display — Define project scope and deliverables", assign to scout, column INBOX

### 4. Usage Page — Final Polish
- Make sure the MiniMax progress bars are visible and colored (accent #7C3AED)
- Claude section should NOT say "Planned" — update text to show actual status: "$200/mo Max plan. Opus: Telegram + #bill-direct. Sonnet: agents (when quota available). No API for usage tracking yet."
- Remove any duplicate cost table if it still exists

### 5. Approvals — Show Resolved Section  
- Bottom of approvals page should show "Recently Resolved" items (last 7 days)
- Currently only showing pending items

## Commit
`git add -A && git commit -m "fix: final MC v2 cleanup — activity feed, signals display, usage polish, approvals resolved section" && git push`
