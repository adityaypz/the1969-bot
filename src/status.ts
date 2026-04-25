// ============================================
// THE 1969 Bot - Status Checker
// ============================================

import { loadConfig } from "./config.js";
import * as api from "./api.js";
import * as log from "./logger.js";
import chalk from "chalk";

async function main() {
  log.banner();

  const config = loadConfig();
  const acc = config.accounts[0];

  if (!acc) {
    log.error("", "No accounts configured");
    process.exit(1);
  }

  log.info(acc.name, "Fetching status...\n");

  const [me, status] = await Promise.all([
    api.getMe(acc),
    api.getDropStatus(acc),
  ]);

  if (me.ok && me.user) {
    const u = me.user;
    console.log(chalk.bold("  Account"));
    console.log(chalk.gray("  ─────────────────────────"));
    console.log(`  User:          @${u.xUsername} (${u.xName})`);
    console.log(`  Balance:       ${chalk.yellow(String(u.bustsBalance))} BUSTS`);
    console.log(`  Drop Eligible: ${u.dropEligible ? chalk.green("YES") : chalk.red("NO")}`);
    console.log(`  Pre-WL:        ${me.preWhitelist ? me.preWhitelist.status : "not applied"}`);
    console.log(`  Inventory:     ${me.inventory?.length ?? 0} traits`);
    console.log();
  }

  if (status.ok) {
    const nextMins = Math.floor(status.msUntilNext / 60000);
    const nextSecs = Math.floor((status.msUntilNext % 60000) / 1000);

    console.log(chalk.bold("  Drop Status"));
    console.log(chalk.gray("  ─────────────────────────"));
    console.log(`  Active:        ${status.isActive ? chalk.green.bold("YES - CLAIM NOW!") : chalk.gray("No")}`);
    console.log(`  Pool:          ${status.poolState} (${chalk.yellow(Math.round(status.poolPct * 100) + "%")})`);
    console.log(`  Your Claims:   ${status.mySessionClaims}/${status.maxClaims}`);
    console.log(`  Cycle:         2 hours, 5-min window, ${status.maxClaims} claim/session`);
    console.log(`  Next Drop:     ${chalk.cyan(`${nextMins}m${nextSecs}s`)}`);
    if (status.portraitsBuilt != null) {
      console.log(`  Portraits:     ${status.portraitsBuilt}/${status.supplyCap}`);
    }
    console.log();
  }
}

main().catch((e) => {
  log.error("", `Fatal: ${e.message}`);
  process.exit(1);
});
