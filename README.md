# Mission Control v1 🎯

A simple, dark-mode dashboard that shows Jonathan everything at a glance.

## What It Shows

- **🤖 Bot Status**: All 8 trading bots with green/red status + paper P&L
- **⏰ Cron Jobs**: OpenClaw scheduled tasks (when API available)
- **📈 Trading Signals**: Latest trader signals and daily opportunities
- **✅ Reminders**: Jonathan To Do list + Grocery reminders from Apple Reminders
- **⚙️ System Health**: Uptime, memory, disk usage, Emma gateway status
- **🛒 Grocery List**: Current shopping list
- **🎯 Goals**: Jonathan's focus areas (hardcoded for v1)

## Tech Stack

- Python Flask (lightweight HTTP server)
- Vanilla HTML/CSS/JS (no frameworks)
- Auto-refresh every 30 seconds
- Dark mode, responsive design

## URLs

- **Dashboard**: http://localhost:8888
- **API**: http://localhost:8888/api/status

## Current Status

✅ **Running**: 3/8 bots active (pairs-trading, polymarket-bot, sports-arb)  
✅ **Data Sources**: All file-based sources working  
⚠️ **Cron API**: Gateway returns HTML instead of JSON (gracefully handled)  
✅ **Auto-start**: Configured as LaunchAgent  

## Files Created

```
mission-control/
├── server.py              # Flask app with all data sources
├── templates/index.html   # Main dashboard page
├── static/style.css      # Dark mode styling
├── static/app.js         # Auto-refresh + frontend logic
├── requirements.txt      # Python dependencies
├── start.sh             # Launch script
├── test.sh              # Test suite
├── com.openclaw.mission-control.plist  # LaunchAgent config
├── venv/                # Python virtual environment
└── README.md            # This file
```

## Manual Commands

```bash
# Start manually
./start.sh

# Test all endpoints
./test.sh

# Stop LaunchAgent
launchctl unload ~/Library/LaunchAgents/com.openclaw.mission-control.plist

# Start LaunchAgent
launchctl load ~/Library/LaunchAgents/com.openclaw.mission-control.plist
```

## Next Steps (Future Versions)

- Fix cron API integration
- Add auth for remote access
- Better error handling and retry logic
- Historical P&L charts
- Mobile push notifications for critical alerts

---

**Built**: February 16, 2026  
**Time**: ~25 minutes  
**Philosophy**: Simple, boring tech that works 🔧