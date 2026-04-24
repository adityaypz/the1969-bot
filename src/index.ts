// ============================================
// THE 1969 Bot - Main Entry Point
// ============================================
// Multi-account auto-claim bot for the1969.io
//
// Usage:
//   npm start        - Run the bot
//   npm run dev      - Run with auto-reload
//   npm run auth     - Test auth for all accounts
//   npm run status   - Check drop status
//
// Setup:
//   1. Copy .env.example to .env
//   2. Add your account cookies (see .env.example)
//   3. npm start

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
  log.info("", `Claim delay: ${config.claimDelayMin}-${config.claimDelayMax}ms`);
  log.info("", `Max claims/session: ${config.maxClaimsPerSession}`);
  log.info("", `Auto-claim: ${config.enableAutoClaim ? "ON" : "OFF"}`);
  log.info("", `Social tasks: ${config.enableTaskClaim ? "ON" : "OFF"}`);
  console.log();

  const claimers: DropClaimer[] = [];
  const socialRunners: SocialTaskRunner[] = [];

  for (let i = 0; i < config.accounts.length; i++) {
    const acc = config.accounts[i];
    log.info("", `Initializing [${acc.name}]${acc.proxy ? ` via proxy` : ""}...`);

    // Stagger start by 2-5s per account
    if (i > 0) {
      const stagger = Math.floor(Math.random() * 3000 + 2000);
      log.debug("", `Staggering ${acc.name} by ${stagger}ms`);
      await new Promise((r) => setTimeout(r, stagger));
    }

    // Drop claimer
    if (config.enableAutoClaim) {
      const claimer = new DropClaimer(acc, config);
      claimers.push(claimer);
      claimer.start();
    }

    // Social task runner
    if (config.enableTaskClaim) {
      const social = new SocialTaskRunner(acc, config);
      socialRunners.push(social);
      social.start();
    }
  }

  // Stats printer every 5 minutes
  setInterval(() => {
    console.log();
    log.info("", chalk.bold("=== Session Stats ==="));
    for (const c of claimers) {
      const s = c.stats;
      log.info(
        c.name,
        `Drops: ${s.totalClaims} (session: ${s.sessionClaims}) | BUSTS: ${s.totalBusts} | Errors: ${s.errors}`
      );
    }
    for (const s of socialRunners) {
      const st = s.stats;
      log.info(
        s.name,
        `Tasks: ${st.completedTasks} done, ${st.totalActions} actions | BUSTS: ${st.totalBusts}`
      );
    }
    console.log();
  }, 5 * 60 * 1000);

  // Graceful shutdown
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
