// ============================================
// THE 1969 Bot - Configuration Loader
// ============================================

import dotenv from "dotenv";
import type { BotConfig, AccountConfig } from "./types.js";

dotenv.config();

function extractUsername(cookie: string): string | null {
  try {
    const jwt = cookie.replace("the1969_session=", "").trim();
    const parts = jwt.split(".");
    if (parts.length >= 2) {
      const payload = JSON.parse(Buffer.from(parts[1], "base64").toString());
      return payload.x || null;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

export function loadConfig(): BotConfig {
  let accounts: AccountConfig[] = [];

  // Try new simple format first (COOKIE_1, COOKIE_2, etc)
  let i = 1;
  while (true) {
    const cookie = process.env[`COOKIE_${i}`];
    if (!cookie) break;

    const cleaned = cookie.trim();
    const fullCookie = cleaned.startsWith("the1969_session=") 
      ? cleaned 
      : `the1969_session=${cleaned}`;
    
    const username = extractUsername(fullCookie);
    const proxy = process.env[`PROXY_${i}`];

    accounts.push({
      name: username || `account${i}`,
      cookie: fullCookie,
      proxy: proxy || undefined,
    });

    i++;
  }

  // Fallback to old JSON format if no COOKIE_* found
  if (accounts.length === 0) {
    try {
      const raw = process.env.ACCOUNTS || "[]";
      const parsed = JSON.parse(raw);
      const proxies = JSON.parse(process.env.PROXIES || "[]");

      accounts = parsed.map((acc: any, idx: number) => ({
        name: acc.name || `account-${idx}`,
        cookie: acc.cookie,
        proxy: acc.proxy || proxies[idx] || undefined,
      }));
    } catch (e) {
      console.error("Failed to parse config:", e);
      process.exit(1);
    }
  }

  if (accounts.length === 0) {
    console.error("No accounts configured. Copy .env.example to .env and add your cookies.");
    process.exit(1);
  }

  return {
    accounts,
    pollInterval: int("POLL_INTERVAL", 15000),
    enableAutoClaim: bool("ENABLE_AUTO_CLAIM", true),
    enableTaskClaim: bool("ENABLE_TASK_CLAIM", true),
  };
}

function int(key: string, def: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) : def;
}

function bool(key: string, def: boolean): boolean {
  const v = process.env[key];
  if (!v) return def;
  return v === "true" || v === "1";
}
