// ============================================
// THE 1969 Bot - Auth Tester
// ============================================
// Tests all configured accounts to verify cookies are valid
//
// Usage: npm run auth

import { loadConfig } from "./config.js";
import * as api from "./api.js";
import * as log from "./logger.js";
import chalk from "chalk";

async function main() {
  log.banner();
  log.info("", "Testing authentication for all accounts...\n");

  const config = loadConfig();

  for (const acc of config.accounts) {
    log.info(acc.name, "Checking auth...");

    const me = await api.getMe(acc);

    if (!me.ok) {
      log.error(acc.name, `AUTH FAILED: ${me.error || "invalid session"}`);
      log.error(acc.name, "Cookie may be expired. Re-login and update .env");
      continue;
    }

    const u = me.user;
    log.success(acc.name, `Authenticated as @${u?.xUsername || "unknown"} (${u?.xName})`);
    log.info(acc.name, `  Balance: ${chalk.yellow(String(u?.bustsBalance ?? 0))} BUSTS`);
    log.info(acc.name, `  Inventory: ${me.inventory?.length ?? 0} traits`);
    log.info(acc.name, `  Whitelisted: ${u?.isWhitelisted ? chalk.green("YES") : chalk.red("NO")}`);
    log.info(acc.name, `  Completed NFTs: ${me.completedNFTs?.length ?? 0}`);
    log.info(acc.name, `  Referral Code: ${u?.referralCode || "none"}`);

    // Also check drop status
    const drop = await api.getDropStatus(acc);
    if (drop.ok) {
      const now = Date.now();
      const elapsed = now - drop.sessId;
      const msUntilNext = Math.max(0, 3600000 - elapsed);
      const mins = Math.floor(msUntilNext / 60000);
      const secs = Math.floor((msUntilNext % 60000) / 1000);

      log.info(
        acc.name,
        `  Drop: ${drop.isActive ? chalk.green("ACTIVE") : chalk.gray("waiting")} | Pool: ${drop.poolState} (${Math.round(drop.poolPct * 100)}%) | Next: ${mins}m${secs}s | Session claims: ${drop.mySessionClaims}/3`
      );
    }

    console.log();
  }
}

main().catch((e) => {
  log.error("", `Fatal: ${e.message}`);
  process.exit(1);
});
