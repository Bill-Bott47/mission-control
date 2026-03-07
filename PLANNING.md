# JonathanOS — Planning Doc

## Vision
A single dashboard for Jonathan to see everything at a glance — agency, trading, bots, health, family, todos. Desktop app + web accessible remotely.

## What It Needs to Show

### Agency (Phoenix)
- Client pipeline / active proposals
- Revenue tracking
- Notion integration (live data)
- Alex's BD progress
- Upcoming meetings/calls

### Trading & Bots
- All bot status (running/down/paper P&L)
- Live positions & paper trades
- Today's market reads (morning/midday/closing)
- Trader watch signals
- Arb opportunities found
- Daily P&L across all strategies

### Personal Business
- Side hustle status (music curation, etc.)
- Automated income streams + revenue
- Twitter/social metrics

### Health
- Weight trend (Withings)
- Activity (Apple Watch/Oura)
- Sleep score
- Workout log

### Family
- Shared reminders / grocery list
- Calendar (upcoming events)
- Baby countdown (due late June/early July 2026)

### System Status
- All cron jobs + last run status
- Bot processes (up/down)
- Emma status
- OpenClaw health

## Architecture Options

### Option A: Electron App + Web Server
- Electron for desktop (native feel, lives in dock)
- Same codebase serves web UI
- Can access remotely via Tailscale or Cloudflare tunnel
- Tech: React + Electron + Express backend
- Pros: True desktop app, offline capable
- Cons: Heavier build, Electron overhead

### Option B: Progressive Web App (PWA)
- Local web server (Express/Fastify)
- PWA installable on desktop + phone
- Access via localhost at home, tunnel when remote
- Tech: React/Svelte + Express backend
- Pros: Lighter, works everywhere, phone too
- Cons: Less native feel

### Option C: Tauri App + Web
- Tauri instead of Electron (Rust-based, way lighter)
- Native desktop feel with tiny footprint
- Web version for remote access
- Tech: Svelte/React + Tauri + API server
- Pros: Fast, small, native, modern
- Cons: Newer ecosystem

### Recommendation: Option C (Tauri + Svelte)
- Tauri is perfect for Mac mini — lightweight, fast, native
- Svelte for UI — minimal JS, reactive, fast builds
- API server pulls from: OpenClaw crons, Notion API, trading bot files, health APIs, Reminders
- Same UI serves as web app for remote access

## Data Sources
- OpenClaw gateway API (cron status, bot health)
- Notion API (agency data)
- Trading bot files (paper_trades.json, signals, etc.)
- Apple Reminders (AppleScript)
- Apple Health / Oura / Withings APIs
- Google Drive (proposals)
- Twitter API (social metrics)

## Build Phases
1. **Phase 1:** Core dashboard — bot status, cron health, trading P&L, system status
2. **Phase 2:** Agency view — Notion integration, pipeline, proposals
3. **Phase 3:** Health + Family — Apple Health, reminders, calendar, baby countdown
4. **Phase 4:** Remote access — Tailscale/Cloudflare tunnel, auth
5. **Phase 5:** Polish — notifications, alerts, mobile PWA

## Questions for Jonathan
- Tauri vs Electron vs PWA preference?
- What's the #1 thing you'd want to see when you open it?
- Any specific design vibe? (minimal, data-dense, dark mode?)
- Do you want it on your phone too or just desktop + browser?
