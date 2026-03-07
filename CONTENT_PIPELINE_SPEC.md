# Content Pipeline Dashboard — JonathanOS V2

**Feature:** Content Pipeline View  
**Status:** PLANNED  
**Target:** MC V2 + Discord Integration  
**Due:** 2026-03-01

---

## Overview

Add a dedicated Content Pipeline section to JonathanOS V2 that shows the real-time status of the Scrub → Quill → Pixel → Jonathan approval flow. Also integrate with Discord for approvals.

---

## Requirements

### 1. MC V2 Dashboard View
- **New tab/section** in JonathanOS dashboard
- **Pipeline stages:**
  - 🔍 **Trending** (Scrub) — content found, awaiting research
  - 📝 **Research** (Quill) — researched, awaiting script
  - ✍️ **Script** (Quill) — script written, awaiting approval
  - 👁️ **Visual** (Pixel) — visual created, awaiting approval
  - ✅ **Approved** — ready to post
  - ❌ **Killed** — rejected (HIDDEN by default per Jonathan)
- **Show per item:**
  - Topic/title
  - Source (what Scrub found)
  - Timestamp
  - Current stage
  - Actions (approve/reject buttons)
- **Filter:** Show only Approved + In Progress by default

### 2. Discord Integration
- **Structured output** to #content-lab showing current pipeline state
- **Interactive approvals** via emoji reactions (✅/❌)
- **Agent writes** content to pipeline state file

### 3. Data Storage
- **JSON file** as simple state store: `mission-control/data/content-pipeline.json`
- **Structure:**
```json
{
  "items": [
    {
      "id": "uuid",
      "topic": "AI agents in marketing",
      "source": "Twitter/@somename",
      "stage": "script", // trending, research, script, visual, approved, killed
      "created_at": "2026-02-26T09:00:00Z",
      "updated_at": "2026-02-26T09:15:00Z",
      "content": {
        "research": "...",
        "script": "...",
        "visual_url": "..."
      },
      "approved": false,
      "killed": false
    }
  ]
}
```

### 4. API Endpoints (Flask)
- `GET /api/content-pipeline` — List all items
- `POST /api/content-pipeline` — Add new item (for agents)
- `PUT /api/content-pipeline/<id>/stage` — Move to next stage
- `PUT /api/content-pipeline/<id>/approve` — Approve item
- `PUT /api/content-pipeline/<id>/kill` — Kill item
- `DELETE /api/content-pipeline/<id>` — Remove item

### 5. Agents Write to Pipeline
- **Scrub** → creates item in "trending" stage
- **Quill** → moves to "research", then "script"
- **Pixel** → adds visual, moves to "visual"
- **Jonathan** → approves/kills

---

## Implementation Plan

### Phase 1: Backend (API + Data)
1. Create `data/content-pipeline.json` schema
2. Add API endpoints to `server.py`
3. Test endpoints with curl

### Phase 2: Frontend (MC V2)
1. Add content-pipeline section to `index.html`
2. Add CSS for pipeline stages
3. Add JavaScript to fetch and render
4. Add approval buttons

### Phase 3: Discord Integration
1. Create Discord output format
2. Add emoji reaction handling (future)

### Phase 4: Agent Integration
1. Update skill prompts to write to pipeline
2. Test end-to-end flow

---

## Files to Modify/Create

- `data/content-pipeline.json` (create)
- `server.py` (add endpoints)
- `templates/index.html` (add section)
- `static/style.css` (add styles)
- `static/app.js` (add fetch logic)

---

## Out of Scope (V1)
- Automatic posting to Twitter/LinkedIn
- Complex analytics
- Multi-channel distribution
- Historical analytics

---

## Success Criteria
- [ ] Can view pipeline in MC V2
- [ ] Shows only approved + in-progress items (not killed)
- [ ] Agents can add items via API
- [ ] Jonathan can approve/kill from dashboard
- [ ] Discord shows pipeline summary
