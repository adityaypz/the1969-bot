// ============================================
// THE 1969 Bot - Configuration Loader
// ============================================

import dotenv from "dotenv";
import type { BotConfig, AccountConfig } from "./types.js";

dotenv.config();

export function loadConfig(): BotConfig {
  let accounts: AccountConfig[] = [];

  try {
    const raw = process.env.ACCOUNTS || "[]";
    const parsed = JSON.parse(raw);
    const proxies = JSON.parse(process.env.PROXIES || "[]");

    accounts = parsed.map((acc: any, i: number) => ({
      name: acc.name || `account-${i}`,
      cookie: acc.cookie,
      proxy: acc.proxy || proxies[i] || undefined,
    }));
  } catch (e) {
    console.error("Failed to parse ACCOUNTS from .env:", e);
    process.exit(1);
  }

  if (accounts.length === 0) {
    console.error("No accounts configured. See .env.example");
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
