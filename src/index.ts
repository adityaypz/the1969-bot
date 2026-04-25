// ============================================
// THE 1969 Bot - Main Entry Point (v2)
// ============================================
// Updated for new drop system (April 25 2026):
// - Admin pre-whitelist approval
// - Direct claim (no arm/proof)
// - 2-hour cycle, 1 claim per session
//
// Usage:
//   npm start        - Run the bot
//   npm run auth     - Test auth for all accounts
//   npm run status   - Check drop status

import { loadConfig } from "./config.js";
import { DropClaimer } from "./claimer.js";
import { SocialTaskRunner } from "./social.js";
import * as log from "./logger.js";
import chalk from "chalk";

async function main() {
  log.banner();

  const config = loadConfig();

  log.info("", `Loaded ${config.accounts.length} account(s)`);
  log.info("", `Poll interval: ${config.pollInterval / 1000}s`);
  log.info("", `Auto-claim: ${config.enableAutoClaim ? "ON" : "OFF"}`);
  log.info("", `Social tasks: ${config.enableTaskClaim ? "ON" : "OFF"}`);
  log.info("", `Drop cycle: 2 hours | 1 claim/session | Admin approval required`);
  console.log();

  const claimers: DropClaimer[] = [];
  const socialRunners: SocialTaskRunner[] = [];

  for (let i = 0; i < config.accounts.length; i++) {
    const acc = config.accounts[i];
    log.info("", `Initializing [${acc.name}]${acc.proxy ? ` via proxy` : ""}...`);

    // Stagger start
    if (i > 0) {
      const stagger = Math.floor(Math.random() * 3000 + 2000);
      await new Promise((r) => setTimeout(r, stagger));
    }

    if (config.enableAutoClaim) {
      const claimer = new DropClaimer(acc, config);
      claimers.push(claimer);
      claimer.start();
    }

    if (config.enableTaskClaim) {
      const social = new SocialTaskRunner(acc, config);
      socialRunners.push(social);
      social.start();
    }
  }

  // Stats every 5 min
  setInterval(() => {
    console.log();
    log.info("", chalk.bold("=== Session Stats ==="));
    for (const c of claimers) {
      const s = c.stats;
      log.info(c.name, `Drops: ${s.totalClaims} (session: ${s.sessionClaims}) | BUSTS: ${s.totalBusts} | Errors: ${s.errors}`);
    }
    for (const s of socialRunners) {
      const st = s.stats;
      log.info(s.name, `Tasks: ${st.completedTasks} done, ${st.totalActions} actions | BUSTS: ${st.totalBusts}`);
    }
    console.log();
  }, 5 * 60 * 1000);

  const shutdown = () => {
    log.warn("", "Shutting down...");
    for (const c of claimers) c.stop();
    for (const s of socialRunners) s.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  log.success("", "Bot running. Press Ctrl+C to stop.\n");
}

main().catch((e) => {
  log.error("", `Fatal: ${e.message}`);
  process.exit(1);
});
