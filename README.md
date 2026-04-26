# THE 1969 Auto-Claim Bot

Auto-claim bot for [THE 1969](https://the1969.io?ref=vncturn). Multi-account support.

## Quick Start

### 1. Install

```bash
git clone https://github.com/adityaypz/the1969-bot.git
cd the1969-bot
npm install
```

### 2. Setup

```bash
cp .env.example .env
```

Edit `.env` - **just paste your cookies:**

```env
COOKIE_1=eyJhbGciOiJIUzI1NiJ9...
COOKIE_2=eyJhbGciOiJIUzI1NiJ9...
```

**How to get cookie:**
1. Go to [the1969.io](https://the1969.io?ref=vncturn) and login
2. Press `F12` → **Application** → **Cookies**
3. Copy value of `the1969_session`
4. Paste in `.env`

### 3. Run

```bash
npm start
```

That's it. Bot will:
- Auto-apply for pre-whitelist
- Auto-claim drops (once approved)
- Auto-complete social tasks

## Commands

```bash
npm start       # Run bot
npm run auth    # Test cookies
npm run status  # Check drop status
```

## Multi-Account

Just add more cookies:

```env
COOKIE_1=first_cookie_here
COOKIE_2=second_cookie_here
COOKIE_3=third_cookie_here
```

Optional proxies (same order):

```env
PROXY_1=http://user:pass@proxy1:8080
PROXY_2=http://user:pass@proxy2:8080
```

## Features

- **Auto-claim drops:** 2-hour cycle, 1 trait per session
- **Social tasks:** Auto like/rt/reply for BUSTS
- **Pre-whitelist:** Auto-applies, waits for admin approval
- **Multi-account:** Unlimited accounts, staggered timing
- **Proxy support:** Per-account proxies

## How It Works

1. Bot applies for pre-whitelist (admin reviews X profile)
2. Once approved → auto-claims every 2 hours
3. Social tasks run in parallel (160 BUSTS per task)

## Config

| Variable | Default | Description |
|---|---|
| `POLL_INTERVAL` | 15000 | Poll interval (ms) |
| `ENABLE_AUTO_CLAIM` | true | Auto-claim drops |
| `ENABLE_TASK_CLAIM` | true | Auto social tasks |

---

Built for [THE 1969](https://the1969.io?ref=vncturn)
