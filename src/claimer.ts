// ============================================
// THE 1969 Bot - Drop Claimer Engine
// ============================================
// Handles the full claim cycle per account:
// 1. Poll /api/drop-status
// 2. When drop is active + can claim -> arm
// 3. Wait for notValidBeforeMs
// 4. Submit claim with fake interaction proof
// 5. Repeat up to maxClaims per session

import type { AccountConfig, AccountState, BotConfig, DropStatus } from "./types.js";
import * as api from "./api.js";
import * as log from "./logger.js";
import { buildInteractionProof } from "./interaction.js";

const DROP_CYCLE_MS = 60 * 60 * 1000;
const CLAIM_WINDOW_MS = 5 * 60 * 1000;

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
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHeartbeat = 0;
  private claimCooldownUntil = 0; // backoff after errors
  private claimInProgress = false; // lock to prevent concurrent claim flows

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
      isArming: false,
      isClaiming: false,
      windowOpenMs: Date.now() - Math.floor(Math.random() * 300000 + 30000),
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
    const u = me.user;
    log.success(
      this.name,
      `Authenticated as @${u?.xUsername || "unknown"} | Balance: ${u?.bustsBalance ?? 0} BUSTS | Inventory: ${me.inventory?.length ?? 0} traits`
    );

    this.pollLoop();
  }

  stop() {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
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
        let interval = this.config.pollInterval; // 15s default

        if (msUntil <= 10_000) {
          interval = 1000;
        } else if (msUntil <= 30_000) {
          interval = 3000;
        } else if (msUntil <= 60_000) {
          interval = 5000;
        }

        // During active drop: poll every 5s (not 2s - avoid rate limit on status)
        if (this.state.lastDropStatus?.isActive) {
          interval = 5000;
        }

        await sleep(interval);
      }
    }
  }

  private async tick() {
    // Respect cooldown from rate limits
    if (Date.now() < this.claimCooldownUntil) {
      return;
    }

    const status = await api.getDropStatus(this.state.config);

    if (!status.ok) {
      log.error(this.name, `Drop status error: ${status.error}`);
      this.state.errors++;
      return;
    }

    // Track session reset
    if (
      this.state.lastDropStatus &&
      status.sessId !== this.state.lastDropStatus.sessId
    ) {
      log.info(this.name, `New session: ${status.sessId}`);
      this.state.sessionClaims = 0;
      this.claimCooldownUntil = 0;
      this.state.windowOpenMs =
        Date.now() - Math.floor(Math.random() * 300000 + 30000);
    }

    this.state.lastDropStatus = status;
    this.state.sessionClaims = status.mySessionClaims || 0;

    const msUntilNext = status.msUntilNext;
    const msUntilClose = status.msUntilClose;
    const isActive = status.isActive;
    const isPoolEmpty =
      status.poolState === "sealed" || status.poolPct <= 0;
    const canClaim =
      this.state.sessionClaims < this.config.maxClaimsPerSession;

    if (!isActive) {
      const now = Date.now();
      if (msUntilNext <= 30_000 && msUntilNext > 0) {
        log.warn(this.name, `DROP IN ${formatMs(msUntilNext)}! Snipe mode active`);
      }

      if (now - this.lastHeartbeat >= 60_000) {
        this.lastHeartbeat = now;
        log.info(
          this.name,
          `Waiting for next drop in ${formatMs(msUntilNext)} | Pool: ${status.poolState} (${Math.round(status.poolPct * 100)}%)`
        );
      }
      return;
    }

    // Drop is active
    if (isPoolEmpty) {
      return; // silent - pool empty, nothing to do
    }

    if (!canClaim) {
      log.info(
        this.name,
        `Max claims reached (${this.state.sessionClaims}/${this.config.maxClaimsPerSession}).`
      );
      return;
    }

    // Prevent concurrent claim flows
    if (this.claimInProgress) {
      return;
    }

    log.info(
      this.name,
      `Drop ACTIVE! Pool: ${status.poolState} (${Math.round(status.poolPct * 100)}%) | Claims: ${this.state.sessionClaims}/${this.config.maxClaimsPerSession} | Window closes in ${formatMs(msUntilClose)}`
    );

    await this.executeClaim();
  }

  private async executeClaim() {
    this.claimInProgress = true;

    try {
      // Step 1: ARM
      log.info(this.name, "Arming drop...");
      const arm = await api.armDrop(this.state.config);

      if (!arm.ok) {
        const err = (arm as any).error || "unknown";
        log.error(this.name, `Arm failed: ${err}`);
        this.state.errors++;

        if (err === "rate_limited") {
          // Back off 15-20s on rate limit
          const backoff = 15000 + Math.random() * 5000;
          log.warn(this.name, `Rate limited. Backing off ${formatMs(backoff)}...`);
          this.claimCooldownUntil = Date.now() + backoff;
        } else {
          // Generic error: back off 5s
          this.claimCooldownUntil = Date.now() + 5000;
        }
        return;
      }

      const armTime = Date.now();
      const waitMs = arm.notValidBeforeMs - armTime;

      log.info(
        this.name,
        `Armed! Wait until: ${new Date(arm.notValidBeforeMs).toLocaleTimeString()} (${formatMs(Math.max(0, waitMs))})`
      );

      // Step 2: Wait EXACTLY until notValidBeforeMs + safe buffer
      if (waitMs > 0) {
        // Add 300-600ms buffer to be safely past the threshold
        const buffer = Math.floor(Math.random() * 300 + 300);
        await sleep(waitMs + buffer);
      } else {
        // Already past - add small buffer just in case
        await sleep(300);
      }

      // Step 3: Build interaction proof
      const armedMs = Date.now() - armTime;
      const windowOpenMs = Date.now() - this.state.windowOpenMs;
      const proof = buildInteractionProof(arm.nonce, windowOpenMs, armedMs);

      // Step 4: CLAIM
      log.info(this.name, "Claiming...");
      const claim = await api.claimDrop(
        this.state.config,
        arm.token,
        proof
      );

      if (!claim.ok) {
        const err = (claim as any).error || "unknown";
        log.error(this.name, `Claim failed: ${err}`);
        this.state.errors++;

        if (err === "rate_limited") {
          const backoff = 15000 + Math.random() * 5000;
          log.warn(this.name, `Rate limited. Backing off ${formatMs(backoff)}...`);
          this.claimCooldownUntil = Date.now() + backoff;
        } else if (err === "slot_not_yet_revealed") {
          // Tried too early - wait 2s and retry once
          log.warn(this.name, "Too early! Retrying in 2s...");
          await sleep(2000);
          if (this.running) {
            log.info(this.name, "Retrying claim...");
            const retryProof = buildInteractionProof(arm.nonce, windowOpenMs + 2000, armedMs + 2000);
            const retry = await api.claimDrop(this.state.config, arm.token, retryProof);
            if (retry.ok) {
              this.handleClaimSuccess(retry);
            } else {
              log.error(this.name, `Retry failed: ${(retry as any).error}`);
              this.claimCooldownUntil = Date.now() + 10000;
            }
          }
        } else if (err === "pool_exhausted") {
          log.warn(this.name, "Pool exhausted. Waiting for next session.");
          this.claimCooldownUntil = Date.now() + 60000; // don't retry this session
        } else if (err === "proof_drag_too_short") {
          log.warn(this.name, "Drag proof rejected. Retrying with new proof in 5s...");
          await sleep(5000);
          // Will retry on next tick with fresh proof
        } else {
          this.claimCooldownUntil = Date.now() + 10000;
        }
        return;
      }

      // Success!
      this.handleClaimSuccess(claim);

      // If we can still claim, wait then try again
      if (this.state.sessionClaims < this.config.maxClaimsPerSession) {
        const nextDelay = 3000 + Math.random() * 5000;
        log.info(
          this.name,
          `${this.config.maxClaimsPerSession - this.state.sessionClaims} claims remaining. Next in ${formatMs(nextDelay)}...`
        );
        await sleep(nextDelay);

        if (this.running) {
          await this.executeClaim();
        }
      }
    } finally {
      this.claimInProgress = false;
    }
  }

  private handleClaimSuccess(claim: any) {
    this.state.sessionClaims++;
    this.state.totalClaims++;
    this.state.totalBusts += (claim.bustsReward || 0) + (claim.dailyBonus || 0);
    this.state.lastClaimTime = Date.now();

    const elem = claim.element;
    log.success(
      this.name,
      `CLAIMED: ${elem?.name || "unknown"} (${elem?.rarity || "?"}) [${elem?.type}/${elem?.variant}] | +${claim.bustsReward} BUSTS${claim.dailyBonus ? ` +${claim.dailyBonus} daily bonus` : ""} | Position: #${claim.position}`
    );
  }
}
