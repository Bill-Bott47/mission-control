# JonathanOS — Tools Plan

## Platform
- Next.js 14 (App Router)
- Dark mode, modular, each tool = its own page
- Hosted locally on Mac mini, accessible remotely via Cloudflare tunnel
- Auth layer for remote access

## Confirmed Tools

### 1. Pipeline Tracker
- Visual kanban of all leads/prospects
- Data sources: Notion API + Google Drive proposals
- **Coordinate with Alex's agent** — need to establish communication protocol
- Alex handles proposals, Bill handles intel/research
- Show: lead name, stage, last touch, next action, owner (Jonathan/Alex)

### 2. Client Health Dashboard
- Active client status, deliverables, contract dates
- **Coordinate with Bryan's agent** — Bryan works closely with clients
- At-risk flags, renewal dates, satisfaction signals

### 3. Competitive Intel
- Track competitor agencies via their team's social accounts
- **Key account: @emilylai** — CMO at competitor, tweets about their work
- More accounts TBD (Jonathan will feed)
- Auto-scan their tweets, extract: new services, client wins, pricing signals, strategy shifts
- Weekly competitive brief

### 4. Bot Command Center
- Start/stop/restart any trading bot with a button
- Live P&L charts
- Alert history
- Status indicators

### 5. Signal Aggregator + Auto-Alerts + Paper Trading
- All 8 traders' latest calls in one view
- Convergence/divergence scoring (how many traders aligned on same direction/asset)
- **Auto-alert via Telegram** when conviction score exceeds threshold
- **Auto paper trade** on high-conviction signals
- Track hit rate per trader and per combination over time
- Build a real track record before risking money
- Dashboard shows: open paper trades, closed P&L, trader accuracy leaderboard

### 6. Revenue Dashboard
- All income streams: agency, trading bots, music curation
- Unified view

## Agent Coordination Needed
- **Alex's agent (PlumpJuicy)** — Pipeline data, proposal status, BD activity — in Superchat group
- **Bryan's agent** — Client health, deliverable status, satisfaction — in Superchat group
- Communication method: Superchat Telegram group (-1003505035993)

## Competitive Intel
- **Competitor: Hype** (agency)
- @emilylai — CMO at Hype, tweets about their work (confirmed)
- (more accounts TBD from Jonathan)

## Auth
- Simple password for remote access

## Night Shift (Autonomous Overnight Work)
Run heavy compute tasks on the Mac mini while Jonathan sleeps (11pm-6am CST):
- **Backtesting** — test strategy ideas against historical data, grade via Forge
- **Data collection** — scrape historical prices, funding rates, OI, order flow
- **Bot optimization** — tune parameters based on paper trade performance
- **Competitive intel** — deep scans of Hype + competitor accounts
- **Prospect research** — web2 lead gen, audit target company sites/social
- **Memory maintenance** — review daily notes, update MEMORY.md
- Only surface results that pass Forge's bar in the morning brief

## Build Order
1. Next.js foundation + auth
2. Bot Command Center (most immediate value, data already exists)
3. Pipeline Tracker (needs Alex coordination)
4. Competitive Intel (can start with @emilylai immediately)
5. Client Health Dashboard (needs Bryan coordination)
6. Signal Aggregator
7. Revenue Dashboard
