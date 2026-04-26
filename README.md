# THE 1969 Auto-Claim Bot

Auto-claim bot for [THE 1969](https://the1969.io?ref=vncturn) hourly trait drops. Multi-account support with anti-detection.

## Features

- Auto-apply for pre-whitelist (admin approval)
- Auto-claim traits every 2-hour drop (1/session)
- Auto-complete social tasks (like/rt/reply for BUSTS)
- Multi-account farming with staggered timing
- Proxy support per account

## Quick Start

### 1. Install

```bash
git clone https://github.com/adityaypz/the1969-bot.git
cd the1969-bot
npm install
```

### 2. Easy Setup (Recommended)

```bash
npm run setup
```

Just paste your cookie(s) when prompted. The script will create `.env` for you.

**How to get your cookie:**
1. Go to [the1969.io](https://the1969.io?ref=vncturn) and login
2. Press `F12` (DevTools)
3. Go to **Application** > **Cookies**
4. Copy the value of `the1969_session`
5. Paste it in the setup script

### 3. Run

```bash
npm start          # Run bot
npm run auth       # Test authentication
npm run status     # Check drop status
```

## Manual Setup (Advanced)

If you prefer manual config:

```bash
cp .env.example .env
```

Edit `.env`:
```env
ACCOUNTS=[{"name":"myaccount","cookie":"the1969_session=YOUR_COOKIE_HERE"}]
```

## Multi-Account Setup

During `npm run setup`, just say "yes" when asked to add another account. Or manually:

```env
ACCOUNTS=[
  {"name":"main","cookie":"the1969_session=..."},
  {"name":"alt1","cookie":"the1969_session=..."}
]
PROXIES=["http://user:pass@proxy1:8080","http://user:pass@proxy2:8080"]
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `POLL_INTERVAL` | 15000 | Status poll interval (ms) |
| `ENABLE_AUTO_CLAIM` | true | Auto-claim drops |
| `ENABLE_TASK_CLAIM` | true | Auto-complete social tasks |

## How It Works

### Drop System (v2 - April 25 2026)

1. **Pre-whitelist:** Bot auto-applies on startup. Admin reviews your X profile manually.
2. **Approval:** Once approved (`dropEligible: true`), bot can claim.
3. **Claim:** Every 2 hours, 5-min window, 1 trait per session.
4. **No mouse proof:** Direct `POST /api/drop-claim` (no arm/telemetry needed).

### Social Tasks

- Auto-submit like, rt, reply for all active tweet tasks
- Trifecta bonus: 100 BUSTS when all 3 actions completed
- Auto-claim follow reward on startup
- Checks for new tasks every 10 minutes

## Disclaimer

Use at your own risk. This bot is for educational purposes only.

---

Built for [THE 1969](https://the1969.io?ref=vncturn)
