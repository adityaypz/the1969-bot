// ============================================
// THE 1969 Bot - Status Checker
// ============================================
// Quick check of current drop status without running the bot
//
// Usage: npm run status

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

  log.info(acc.name, "Fetching drop status...\n");

  const status = await api.getDropStatus(acc);

  if (!status.ok) {
    log.error(acc.name, `Failed: ${status.error}`);
    process.exit(1);
  }

  const now = Date.now();
  const elapsed = now - status.sessId;
  const msUntilNext = Math.max(0, 3600000 - elapsed);
  const msUntilClose = Math.max(0, 300000 - elapsed);

  console.log(chalk.bold("  Drop Status"));
  console.log(chalk.gray("  ─────────────────────────"));
  console.log(`  Session ID:    ${status.sessId}`);
  console.log(
    `  Active:        ${status.isActive ? chalk.green.bold("YES - CLAIM NOW!") : chalk.gray("No")}`
  );
  console.log(`  Pool State:    ${status.poolState}`);
  console.log(
    `  Pool Remaining:${chalk.yellow(` ${Math.round(status.poolPct * 100)}%`)}`
  );
  console.log(`  Your Claims:   ${status.mySessionClaims}/3`);

  if (status.isActive) {
    const closeMins = Math.floor(msUntilClose / 60000);
    const closeSecs = Math.floor((msUntilClose % 60000) / 1000);
    console.log(
      `  Window Closes: ${chalk.red(`${closeMins}m${closeSecs}s`)}`
    );
  } else {
    const nextMins = Math.floor(msUntilNext / 60000);
    const nextSecs = Math.floor((msUntilNext % 60000) / 1000);
    console.log(
      `  Next Drop:     ${chalk.cyan(`${nextMins}m${nextSecs}s`)}`
    );
  }

  console.log();
}

main().catch((e) => {
  log.error("", `Fatal: ${e.message}`);
  process.exit(1);
});
