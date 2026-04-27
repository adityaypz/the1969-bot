// ============================================
// THE 1969 Bot - Drop Claimer Engine (v2)
// ============================================
// Strategy: PRE-FIRE claim at exact drop timestamp
// We know next drop = sessId + 2hrs (7200000ms)
// Instead of polling for isActive, we sleep until
// exact drop time and fire claim at T+0ms.
// Pool has 200 slots, 1000+ people online, gone in 3s.

import type { AccountConfig, AccountState, BotConfig } from "./types.js";
import * as api from "./api.js";
import * as log from "./logger.js";

const DROP_CYCLE_MS = 2 * 60 * 60 * 1000; // 2 hours

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h${m % 60}m`;
  if (m > 0) return `${m}m${s % 60}s`;
  return `${s}s`;
}

export class DropClaimer {
  private state: AccountState;
  private config: BotConfig;
  private running = false;
  private lastHeartbeat = 0;
  private eligible = false;

  constructor(account: AccountConfig, config: BotConfig) {
    this.config = config;
    this.state = {
      config: account,
      profile: null,
      lastDropStatus: null,
      sessionClaims: 0,
      totalClaims: 0,
      totalBusts: 0,
      lastClaimTime: 0,
      errors: 0,
      claimInProgress: false,
    };
  }

  get name(): string {
    return this.state.config.name;
  }

  get stats() {
    return {
      totalClaims: this.state.totalClaims,
      totalBusts: this.state.totalBusts,
      errors: this.state.errors,
      sessionClaims: this.state.sessionClaims,
    };
  }

  async start() {
    this.running = true;
    log.info(this.name, "Starting claimer...");

    const me = await api.getMe(this.state.config);
    if (!me.ok) {
      log.error(this.name, `Auth failed: ${me.error || "invalid session"}. Check cookie.`);
      this.running = false;
      return;
    }

    this.state.profile = me;
    const u = me.user!;
    log.success(
      this.name,
      `Authenticated as @${u.xUsername} | Balance: ${u.bustsBalance} BUSTS | Inventory: ${me.inventory?.length ?? 0} traits`
    );

    if (u.dropEligible) {
      log.success(this.name, "Drop eligible: YES");
      this.eligible = true;
    } else if (me.preWhitelist) {
      if (me.preWhitelist.status === "rejected") {
        log.error(this.name, "Pre-whitelist REJECTED. Claimer disabled.");
        this.running = false;
        return;
      }
      log.warn(this.name, `Pre-whitelist: ${me.preWhitelist.status}. Waiting...`);
    } else {
      log.info(this.name, "Applying for pre-whitelist...");
      const apply = await api.applyPreWhitelist(this.state.config);
      if (apply.ok || apply.submitted) {
        log.success(this.name, `Applied! Waiting for admin review.`);
      }
    }

    if (u.suspended) {
      log.error(this.name, "Account SUSPENDED.");
      this.running = false;
      return;
    }

    this.mainLoop();
  }

  stop() {
    this.running = false;
    log.warn(this.name, "Claimer stopped.");
  }

  private async mainLoop() {
    while (this.running) {
      try {
        // Step 1: Get drop status to know next drop time
        const status = await api.getDropStatus(this.state.config);
        if (!status.ok) {
          this.state.errors++;
          await sleep(15000);
          continue;
        }

        this.state.lastDropStatus = status;
        this.state.sessionClaims = status.mySessionClaims || 0;

        // Already claimed this session?
        if (this.state.sessionClaims >= status.maxClaims) {
          log.info(this.name, `Already claimed this session. Next drop in ${formatMs(status.msUntilNext)}`);
          // Sleep until next session + small buffer
          await this.sleepWithHeartbeat(status.msUntilNext);
          continue;
        }

        // Check eligibility
        if (!this.eligible) {
          const me = await api.getMe(this.state.config);
          if (me.ok && me.user?.dropEligible) {
            this.eligible = true;
            log.success(this.name, "Drop approval confirmed!");
          } else {
            log.info(this.name, `Not eligible yet. Checking again in 5min. Next drop in ${formatMs(status.msUntilNext)}`);
            await sleep(300_000);
            continue;
          }
        }

        // Drop is currently active?
        if (status.isActive && status.poolPct > 0 && status.poolState !== "sealed") {
          log.info(this.name, `Drop ACTIVE NOW! Pool: ${status.poolState} (${Math.round(status.poolPct * 100)}%) - FIRING!`);
          await this.fireClaim();
          continue;
        }

        // Pool already empty for this session
        if (status.isActive && (status.poolState === "sealed" || status.poolPct <= 0)) {
          log.info(this.name, `Pool already empty. Next drop in ${formatMs(status.msUntilNext)}`);
          await this.sleepWithHeartbeat(status.msUntilNext);
          continue;
        }

        // Not active yet - sleep until exact drop time, then pre-fire
        const msUntil = status.msUntilNext;

        if (msUntil > 60_000) {
          // Far away - sleep with heartbeat
          log.info(this.name, `Next drop in ${formatMs(msUntil)}. Sleeping...`);
          await this.sleepWithHeartbeat(msUntil - 30_000); // wake up 30s before
          continue;
        }

        if (msUntil > 5_000) {
          // Close - countdown
          log.warn(this.name, `Drop in ${formatMs(msUntil)}! Preparing to snipe...`);
          await sleep(msUntil - 3000); // sleep until 3s before
        }

        if (msUntil > 0) {
          // Final countdown - precision sleep
          const remaining = status.msUntilNext - (Date.now() - (Date.now())); // recalc
          const finalStatus = await api.getDropStatus(this.state.config);
          if (finalStatus.ok && finalStatus.msUntilNext > 0) {
            const preciseWait = Math.max(0, finalStatus.msUntilNext - 100); // fire 100ms early
            log.warn(this.name, `SNIPING in ${preciseWait}ms...`);
            if (preciseWait > 0) await sleep(preciseWait);
          }
        }

        // FIRE!
        await this.fireClaim();

      } catch (e: any) {
        log.error(this.name, `Loop error: ${e.message}`);
        this.state.errors++;
        await sleep(10000);
      }
    }
  }

  private async fireClaim() {
    this.state.claimInProgress = true;
    const t0 = Date.now();

    try {
      log.info(this.name, "FIRING CLAIM!");
      const claim = await api.claimDrop(this.state.config);
      const elapsed = Date.now() - t0;

      if (!claim.ok) {
        const err = claim.error || "unknown";
        log.error(this.name, `Claim failed (${elapsed}ms): ${err}`);
        this.state.errors++;

        if (err === "pool_exhausted") {
          log.warn(this.name, `Pool gone in ${elapsed}ms. Will try next session.`);
        } else if (err === "not_pre_whitelisted") {
          log.error(this.name, "Not approved. Stopping.");
          this.running = false;
        } else if (err === "session_not_active") {
          // Fired too early - wait 500ms and retry once
          log.warn(this.name, "Too early! Retrying in 500ms...");
          await sleep(500);
          const retry = await api.claimDrop(this.state.config);
          if (retry.ok) {
            this.handleSuccess(retry, Date.now() - t0);
          } else {
            log.error(this.name, `Retry failed: ${(retry as any).error}`);
          }
        }
        return;
      }

      this.handleSuccess(claim, elapsed);
    } finally {
      this.state.claimInProgress = false;
    }
  }

  private handleSuccess(claim: any, elapsed: number) {
    this.state.sessionClaims++;
    this.state.totalClaims++;
    this.state.totalBusts += (claim.bustsReward || 0) + (claim.dailyBonus || 0);
    this.state.lastClaimTime = Date.now();

    const elem = claim.element;
    log.success(
      this.name,
      `CLAIMED in ${elapsed}ms! ${elem?.name || "?"} (${elem?.rarity || "?"}) [${elem?.type}/${elem?.variant}] | +${claim.bustsReward} BUSTS${claim.dailyBonus ? ` +${claim.dailyBonus} daily` : ""} | #${claim.position}`
    );
  }

  private async sleepWithHeartbeat(totalMs: number) {
    const start = Date.now();
    while (this.running && Date.now() - start < totalMs) {
      const remaining = totalMs - (Date.now() - start);
      const now = Date.now();
      if (now - this.lastHeartbeat >= 60_000) {
        this.lastHeartbeat = now;
        log.info(this.name, `Sleeping... next drop in ${formatMs(remaining)}`);
      }
      await sleep(Math.min(15000, remaining));
    }
  }
}
