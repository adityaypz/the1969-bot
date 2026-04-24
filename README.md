# THE 1969 Auto-Claim Bot

Auto-claim bot for [THE 1969](https://the1969.io?ref=vncturn) hourly trait drops. Multi-account support with anti-detection.

## Features

- Auto-claim traits every hourly drop (max 3/session)
- Multi-account farming with staggered timing
- Human-like interaction proof (mouse telemetry, drag variance)
- Anti-bot score evasion (targets <30/100)
- Proxy support per account
- Periodic heartbeat logs

## Quick Start

1. **Register** on [THE 1969](https://the1969.io?ref=vncturn) (connect your X account)

2. **Install**
```bash
git clone https://github.com/adityaypz/the1969-bot.git
cd the1969-bot
npm install
```

3. **Get your session cookie**
   - Login at [the1969.io](https://the1969.io?ref=vncturn)
   - Open DevTools (`F12`) > Application > Cookies
   - Copy the `the1969_session` value

4. **Configure**
```bash
cp .env.example .env
```
Edit `.env` and add your cookie:
```
ACCOUNTS=[{"name":"myaccount","cookie":"the1969_session=YOUR_COOKIE_HERE"}]
```

5. **Run**
```bash
npm start          # Run bot
npm run auth       # Test authentication
npm run status     # Check drop status
npm run dev        # Run with auto-reload
```

## Multi-Account Setup

```env
ACCOUNTS=[{"name":"acc1","cookie":"the1969_session=..."},{"name":"acc2","cookie":"the1969_session=..."}]
PROXIES=["http://user:pass@proxy1:8080","http://user:pass@proxy2:8080"]
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `POLL_INTERVAL` | 15000 | Status poll interval (ms) |
| `CLAIM_DELAY_MIN` | 2000 | Min delay before claim (ms) |
| `CLAIM_DELAY_MAX` | 8000 | Max delay before claim (ms) |
| `MAX_CLAIMS_PER_SESSION` | 3 | Claims per hourly session |

## How It Works

1. Polls `/api/drop-status` every 15s
2. When drop is **ACTIVE** (hourly, 5-min window):
   - Arms the drop (`/api/drop-arm`)
   - Waits server-enforced delay + random human delay
   - Generates fake mouse/drag telemetry
   - Claims trait (`/api/drop-claim`)
   - Repeats up to 3x per session
3. Waits for next hourly drop

## Disclaimer

Use at your own risk. This bot is for educational purposes only.

---

Built for [THE 1969](https://the1969.io?ref=vncturn)
