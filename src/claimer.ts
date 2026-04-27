// ============================================
// THE 1969 Bot - Drop Claimer Engine (v2)
// ============================================
// Strategy: predict drop time, fire claim at exact moment
// Drop cycle = 2 hours. We know sessId = epoch of cycle start.
// Claim fires INSTANTLY when isActive detected - zero delay.

import type { AccountConfig, AccountState, BotConfig } from "./types.js";
import * as api from "./api.js";
import * as log from "./logger.js";

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
  private cooldownUntil = 0;
  private appliedPreWL = false;
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

    // Check pre-whitelist status
    if (u.dropEligible) {
      log.success(this.name, "Drop eligible: YES (approved)");
      this.eligible = true;
    } else if (me.preWhitelist) {
      log.info(this.name, `Pre-whitelist status: ${me.preWhitelist.status}`);
      if (me.preWhitelist.status === "pending") {
        log.warn(this.name, "Waiting for admin approval. Will check periodically.");
      } else if (me.preWhitelist.status === "rejected") {
        log.error(this.name, "Pre-whitelist REJECTED. Drop claimer disabled. Social tasks still active.");
        this.running = false;
        return;
      }
    } else {
      log.info(this.name, "Not applied for pre-whitelist yet. Applying...");
      const apply = await api.applyPreWhitelist(this.state.config);
      if (apply.ok || apply.submitted) {
        log.success(this.name, `Applied! Status: ${apply.status || "pending"}. Waiting for admin review.`);
        this.appliedPreWL = true;
      } else {
        log.error(this.name, `Apply failed: ${apply.error}`);
      }
    }

    if (u.suspended) {
      log.error(this.name, "Account SUSPENDED. Cannot claim.");
      this.running = false;
      return;
    }

    this.pollLoop();
  }

  stop() {
    this.running = false;
    log.warn(this.name, "Claimer stopped.");
  }

  private async pollLoop() {
    while (this.running) {
      try {
        await this.tick();
      } catch (e: any) {
        log.error(this.name, `Poll error: ${e.message}`);
        this.state.errors++;
      }

      if (this.running) {
        const msUntil = this.state.lastDropStatus?.msUntilNext ?? Infinity;
        let interval = this.config.pollInterval;

        // AGGRESSIVE polling near drop time
        if (msUntil <= 5_000) interval = 500;       // <5s: every 500ms
        else if (msUntil <= 15_000) interval = 1000; // <15s: every 1s
        else if (msUntil <= 30_000) interval = 2000; // <30s: every 2s
        else if (msUntil <= 60_000) interval = 5000; // <1min: every 5s

        // Already claimed this session? slow down
        if (this.state.lastDropStatus?.isActive && this.state.sessionClaims > 0) {
          interval = 30000;
        }

        await sleep(interval);
      }
    }
  }

  private async tick() {
    if (Date.now() < this.cooldownUntil) return;

    // Check eligibility periodically if not yet approved
    if (!this.eligible) {
      const me = await api.getMe(this.state.config);
      if (me.ok && me.user?.dropEligible) {
        this.eligible = true;
        this.state.profile = me;
        log.success(this.name, "Drop approval confirmed!");
      } else {
        // Only check every 5 min
        this.cooldownUntil = Date.now() + 300_000;
        return;
      }
    }

    const status = await api.getDropStatus(this.state.config);
    if (!status.ok) {
      this.state.errors++;
      return;
    }

    // Session reset
    if (this.state.lastDropStatus && status.sessId !== this.state.lastDropStatus.sessId) {
      log.info(this.name, `New session: ${status.sessId}`);
      this.state.sessionClaims = 0;
      this.cooldownUntil = 0;
    }

    this.state.lastDropStatus = status;
    this.state.sessionClaims = status.mySessionClaims || 0;

    const { isActive, msUntilNext, poolState, poolPct, maxClaims } = status;
    const isPoolEmpty = poolState === "sealed" || poolPct <= 0;
    const canClaim = this.state.sessionClaims < maxClaims;

    if (!isActive) {
      const now = Date.now();
      if (msUntilNext <= 15_000 && msUntilNext > 0) {
        log.warn(this.name, `DROP IN ${formatMs(msUntilNext)}! Snipe mode - polling every 500ms`);
      }
      if (now - this.lastHeartbeat >= 60_000) {
        this.lastHeartbeat = now;
        log.info(this.name, `Waiting for next drop in ${formatMs(msUntilNext)} | Pool: ${poolState} (${Math.round(poolPct * 100)}%)`);
      }
      return;
    }

    // Drop active - CLAIM IMMEDIATELY
    if (isPoolEmpty || !canClaim || this.state.claimInProgress) return;

    log.info(this.name, `Drop ACTIVE! Pool: ${poolState} (${Math.round(poolPct * 100)}%) - CLAIMING NOW!`);
    await this.executeClaim();
  }

  private async executeClaim() {
    this.state.claimInProgress = true;

    try {
      // NO DELAY - fire immediately
      const t0 = Date.now();
      const claim = await api.claimDrop(this.state.config);
      const elapsed = Date.now() - t0;

      if (!claim.ok) {
        const err = claim.error || "unknown";
        log.error(this.name, `Claim failed (${elapsed}ms): ${err}`);
        this.state.errors++;

        if (err === "rate_limited") {
          this.cooldownUntil = Date.now() + 20_000;
        } else if (err === "not_pre_whitelisted") {
          log.error(this.name, "Not approved. Stopping claimer.");
          this.running = false;
        } else if (err === "pool_exhausted") {
          log.warn(this.name, `Pool exhausted after ${elapsed}ms. Too slow.`);
          this.cooldownUntil = Date.now() + 300_000;
        } else if (err === "already_claimed_session") {
          log.info(this.name, "Already claimed this session.");
          this.state.sessionClaims = 1;
        } else {
          this.cooldownUntil = Date.now() + 15_000;
        }
        return;
      }

      // Success!
      const elapsed2 = Date.now() - t0;
      this.state.sessionClaims++;
      this.state.totalClaims++;
      this.state.totalBusts += (claim.bustsReward || 0) + (claim.dailyBonus || 0);
      this.state.lastClaimTime = Date.now();

      const elem = claim.element;
      log.success(
        this.name,
        `CLAIMED in ${elapsed2}ms: ${elem?.name || "unknown"} (${elem?.rarity || "?"}) [${elem?.type}/${elem?.variant}] | +${claim.bustsReward} BUSTS${claim.dailyBonus ? ` +${claim.dailyBonus} daily` : ""} | #${claim.position}`
      );
    } finally {
      this.state.claimInProgress = false;
    }
  }
}
