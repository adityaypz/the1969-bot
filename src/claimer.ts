// ============================================
// THE 1969 Bot - Drop Claimer Engine (v2)
// ============================================
// New flow (post April 25 2026 update):
// - No more arm/proof/mouse telemetry
// - Admin pre-whitelist approval required
// - Direct POST /api/drop-claim (no body)
// - 2-hour cycle, 5-min window, 1 claim per session

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

    // Verify auth + check eligibility
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
      // Auto-apply for pre-whitelist
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

        // Adaptive polling near drop time
        if (msUntil <= 10_000) interval = 2000;
        else if (msUntil <= 30_000) interval = 3000;
        else if (msUntil <= 60_000) interval = 5000;

        // Slow poll during active (already claimed or waiting)
        if (this.state.lastDropStatus?.isActive && this.state.claimInProgress) {
          interval = 10000;
        }

        await sleep(interval);
      }
    }
  }

  private async tick() {
    if (Date.now() < this.cooldownUntil) return;

    const status = await api.getDropStatus(this.state.config);
    if (!status.ok) {
      log.error(this.name, `Drop status error: ${status.error}`);
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

    const { isActive, msUntilNext, msUntilClose, poolState, poolPct, maxClaims } = status;
    const isPoolEmpty = poolState === "sealed" || poolPct <= 0;
    const canClaim = this.state.sessionClaims < maxClaims;

    if (!isActive) {
      const now = Date.now();
      if (msUntilNext <= 30_000 && msUntilNext > 0) {
        log.warn(this.name, `DROP IN ${formatMs(msUntilNext)}! Snipe mode active`);
      }
      if (now - this.lastHeartbeat >= 60_000) {
        this.lastHeartbeat = now;
        log.info(this.name, `Waiting for next drop in ${formatMs(msUntilNext)} | Pool: ${poolState} (${Math.round(poolPct * 100)}%)`);
      }
      return;
    }

    // Drop active
    if (isPoolEmpty) return;
    if (!canClaim) return;
    if (this.state.claimInProgress) return;

    // Check eligibility (refresh periodically)
    if (!this.state.profile?.user?.dropEligible && !this.appliedPreWL) {
      const me = await api.getMe(this.state.config);
      if (me.ok) {
        this.state.profile = me;
        if (!me.user?.dropEligible) {
          log.warn(this.name, "Not yet approved for drops. Waiting for admin review...");
          this.cooldownUntil = Date.now() + 120_000; // check again in 2 min
          return;
        }
        log.success(this.name, "Drop approval confirmed!");
      }
    }

    log.info(
      this.name,
      `Drop ACTIVE! Pool: ${poolState} (${Math.round(poolPct * 100)}%) | Claims: ${this.state.sessionClaims}/${maxClaims} | Window closes in ${formatMs(msUntilClose)}`
    );

    await this.executeClaim();
  }

  private async executeClaim() {
    this.state.claimInProgress = true;

    try {
      // Small random delay (1-3s) to not be instant
      const delay = 1000 + Math.random() * 2000;
      log.info(this.name, `Claiming in ${formatMs(delay)}...`);
      await sleep(delay);

      log.info(this.name, "Claiming...");
      const claim = await api.claimDrop(this.state.config);

      if (!claim.ok) {
        const err = claim.error || "unknown";
        log.error(this.name, `Claim failed: ${err}${claim.hint ? ` (${claim.hint})` : ""}`);
        this.state.errors++;

        if (err === "rate_limited") {
          this.cooldownUntil = Date.now() + 20_000;
          log.warn(this.name, "Rate limited. Backing off 20s...");
        } else if (err === "not_pre_whitelisted") {
          log.error(this.name, "Not approved for drops. Stopping claimer for this account.");
          this.running = false;
        } else if (err === "pool_exhausted") {
          log.warn(this.name, "Pool exhausted.");
          this.cooldownUntil = Date.now() + 300_000;
        } else {
          this.cooldownUntil = Date.now() + 15_000;
        }
        return;
      }

      // Success!
      this.state.sessionClaims++;
      this.state.totalClaims++;
      this.state.totalBusts += (claim.bustsReward || 0) + (claim.dailyBonus || 0);
      this.state.lastClaimTime = Date.now();

      const elem = claim.element;
      log.success(
        this.name,
        `CLAIMED: ${elem?.name || "unknown"} (${elem?.rarity || "?"}) [${elem?.type}/${elem?.variant}] | +${claim.bustsReward} BUSTS${claim.dailyBonus ? ` +${claim.dailyBonus} daily bonus` : ""} | Position: #${claim.position}`
      );
    } finally {
      this.state.claimInProgress = false;
    }
  }
}
