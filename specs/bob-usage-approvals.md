# Bob Task: Usage Page Redesign + Approvals Reply Loop

## Repo
`/Users/bill/.openclaw/workspace/mission-control` on branch `feature/mc-v2-visual`

## CRITICAL RULES
1. **git commit + git push** before you finish. Non-negotiable.
2. Work on `feature/mc-v2-visual` branch.
3. Test all changes with `curl` before committing.

## Task 1: Usage Page Layout Redesign

**Problem:** Page is not laid out clearly. Hard to scan. Jonathan says "needs a once-over."

**Fix:**
- Providers section: Make into a clean grid of cards with BIG status indicators and cost numbers
- MiniMax section: Progress bars should be prominent with % and remaining count
- Claude section: Remove "planned" placeholder. Show "$200/mo Max plan — Opus (Telegram DM, #bill-direct), Sonnet (agents when quota available). Weekly rolling limits." Link to console.anthropic.com if possible.
- Codex section: Show tokens used today / this week in big readable numbers, not a wall of session titles
- Remove duplicate cost table at bottom (providers grid already shows costs)
- Channel burn section: Simplify — show top 5 channels by usage, not every cron job detail
- SENTINEL reports: Keep but make collapsible/accordion so they don't dominate the page

**Design reference:** Dark theme, bg `#0D0D0F`, cards `#252535`, accent `#7C3AED`, Inter font. Match the style of the rest of MC v2.

## Task 2: Approvals Reply Processing

**Problem:** When Jonathan replies to an approval in MC, the reply gets stored in DB and posted to #inbox but nobody processes it. No feedback loop.

**Fix:**
- When Jonathan submits a reply via the MC approvals page, the UI should show "✅ Reply received — routing to Bill" immediately
- The API endpoint should update the approval status based on keywords:
  - "approved" / "yes" / "go" / "do it" → status = approved
  - "no" / "reject" / "kill" / "cancel" → status = rejected
  - Anything else → status = pending (keep open, reply stored)
- Add a "Resolved" section at bottom of approvals page showing recently resolved items (last 7 days)
- Keep the Discord #inbox post (channel 1475882688559845541) for routing

## Task 3: Commit + Push
- `git add -A && git commit -m "feat: usage page redesign + approvals reply loop" && git push`
