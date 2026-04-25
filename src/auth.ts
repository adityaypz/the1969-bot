// ============================================
// THE 1969 Bot - Auth Tester
// ============================================

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

    const u = me.user!;
    log.success(acc.name, `Authenticated as @${u.xUsername} (${u.xName})`);
    log.info(acc.name, `  Balance: ${chalk.yellow(String(u.bustsBalance))} BUSTS`);
    log.info(acc.name, `  Inventory: ${me.inventory?.length ?? 0} traits`);
    log.info(acc.name, `  Whitelisted: ${u.isWhitelisted ? chalk.green("YES") : chalk.red("NO")}`);
    log.info(acc.name, `  Drop Eligible: ${u.dropEligible ? chalk.green("YES") : chalk.red("NO")}`);
    log.info(acc.name, `  Suspended: ${u.suspended ? chalk.red("YES") : chalk.green("NO")}`);
    log.info(acc.name, `  Referral Code: ${u.referralCode || "none"}`);

    // Pre-whitelist status
    if (me.preWhitelist) {
      const status = me.preWhitelist.status;
      const color = status === "approved" ? chalk.green : status === "rejected" ? chalk.red : chalk.yellow;
      log.info(acc.name, `  Pre-Whitelist: ${color(status.toUpperCase())}`);
    } else {
      log.info(acc.name, `  Pre-Whitelist: ${chalk.gray("not applied")}`);
    }

    // Drop status
    const drop = await api.getDropStatus(acc);
    if (drop.ok) {
      const mins = Math.floor(drop.msUntilNext / 60000);
      const secs = Math.floor((drop.msUntilNext % 60000) / 1000);
      log.info(
        acc.name,
        `  Drop: ${drop.isActive ? chalk.green("ACTIVE") : chalk.gray("waiting")} | Pool: ${drop.poolState} (${Math.round(drop.poolPct * 100)}%) | Next: ${mins}m${secs}s | Claims: ${drop.mySessionClaims}/${drop.maxClaims}`
      );
    }

    console.log();
  }
}

main().catch((e) => {
  log.error("", `Fatal: ${e.message}`);
  process.exit(1);
});
