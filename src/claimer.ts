// ============================================
// THE 1969 Bot - Drop Claimer Engine
// ============================================
// Handles the full claim cycle per account:
// 1. Poll /api/drop-status every N seconds
// 2. When drop is active + can claim -> arm
// 3. Wait for notValidBeforeMs + human delay
// 4. Submit claim with fake interaction proof
// 5. Repeat up to maxClaims per session

import type { AccountConfig, AccountState, BotConfig, DropStatus } from "./types.js";
import * as api from "./api.js";
import * as log from "./logger.js";
import { buildInteractionProof, getHumanClaimDelay } from "./interaction.js";

const DROP_CYCLE_MS = 60 * 60 * 1000; // 1 hour
const CLAIM_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

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
      windowOpenMs: Date.now() - Math.floor(Math.random() * 300000 + 30000), // fake page open 30s-5min ago
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

    // Verify auth first
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

    // Start poll loop
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

      // Adaptive polling: fast near drop time, slow otherwise
      if (this.running) {
        const msUntil = this.state.lastDropStatus?.msUntilNext ?? Infinity;
        let interval = this.config.pollInterval; // default 15s

        if (msUntil <= 10_000) {
          // <10s to drop: poll every 1s (snipe mode)
          interval = 1000;
        } else if (msUntil <= 30_000) {
          // <30s: poll every 3s
          interval = 3000;
        } else if (msUntil <= 60_000) {
          // <1min: poll every 5s
          interval = 5000;
        }

        // Also fast-poll while drop is active
        if (this.state.lastDropStatus?.isActive) {
          interval = 2000;
        }

        await sleep(interval);
      }
    }
  }

  private async tick() {
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
      // Reset fake window open time for new session
      this.state.windowOpenMs =
        Date.now() - Math.floor(Math.random() * 300000 + 30000);
    }

    this.state.lastDropStatus = status;
    this.state.sessionClaims = status.mySessionClaims || 0;

    // Use server-provided timing
    const msUntilNext = status.msUntilNext;
    const msUntilClose = status.msUntilClose;
    const isActive = status.isActive;
    const isPoolEmpty =
      status.poolState === "sealed" || status.poolPct <= 0;
    const canClaim =
      this.state.sessionClaims < this.config.maxClaimsPerSession;

    if (!isActive) {
      // Snipe mode alert
      const now = Date.now();
      if (msUntilNext <= 30_000 && msUntilNext > 0) {
        log.warn(this.name, `DROP IN ${formatMs(msUntilNext)}! Snipe mode active (polling every 1-3s)`);
      }

      // Print heartbeat every 60s so user knows bot is alive
      if (now - this.lastHeartbeat >= 60_000) {
        this.lastHeartbeat = now;
        log.info(
          this.name,
          `Waiting for next drop in ${formatMs(msUntilNext)} | Pool: ${status.poolState} (${Math.round(status.poolPct * 100)}%)`
        );
      }
      return;
    }

    // Drop is active!
    if (isPoolEmpty) {
      log.warn(this.name, `Drop active but pool empty (${status.poolState})`);
      return;
    }

    if (!canClaim) {
      log.info(
        this.name,
        `Max claims reached (${this.state.sessionClaims}/${this.config.maxClaimsPerSession}). Waiting for next session.`
      );
      return;
    }

    if (this.state.isArming || this.state.isClaiming) {
      log.debug(this.name, "Already in claim flow, skipping...");
      return;
    }

    // GO! Start claim flow
    log.info(
      this.name,
      `Drop ACTIVE! Pool: ${status.poolState} (${Math.round(status.poolPct * 100)}%) | Claims: ${this.state.sessionClaims}/${this.config.maxClaimsPerSession} | Window closes in ${formatMs(msUntilClose)}`
    );

    await this.executeClaim();
  }

  private async executeClaim() {
    this.state.isArming = true;

    try {
      // Step 1: ARM
      log.info(this.name, "Arming drop...");
      const arm = await api.armDrop(this.state.config);

      if (!arm.ok) {
        log.error(this.name, `Arm failed: ${arm.error}`);
        this.state.errors++;
        return;
      }

      log.info(
        this.name,
        `Armed! Token received. Wait until: ${new Date(arm.notValidBeforeMs).toLocaleTimeString()}`
      );

      // Step 2: Wait for notValidBeforeMs + human-like buffer
      const armTime = Date.now();
      const waitMs = arm.notValidBeforeMs - armTime;
      if (waitMs > 0) {
        const humanDelay = getHumanClaimDelay(
          this.config.claimDelayMin,
          this.config.claimDelayMax
        );
        const totalWait = waitMs + this.config.armWaitBuffer + humanDelay;
        log.info(this.name, `Waiting ${formatMs(totalWait)} before claiming...`);
        await sleep(totalWait);
      } else {
        const delay = getHumanClaimDelay(
          this.config.claimDelayMin,
          this.config.claimDelayMax
        );
        log.info(this.name, `Adding human delay: ${formatMs(delay)}`);
        await sleep(delay);
      }

      // Step 3: Build interaction proof
      this.state.isClaiming = true;
      const armedMs = Date.now() - armTime; // real elapsed time since arm
      const windowOpenMs = Date.now() - this.state.windowOpenMs;

      const proof = buildInteractionProof(arm.nonce, windowOpenMs, armedMs);

      log.debug(
        this.name,
        `Proof: moves=${proof.moveCount} entropy=${proof.pathEntropy} dragX=${proof.dragVarX} dragY=${proof.dragVarY} windowMs=${proof.windowOpenMs} armedMs=${proof.armedMs}`
      );

      // Step 4: CLAIM
      log.info(this.name, "Claiming...");
      const claim = await api.claimDrop(
        this.state.config,
        arm.token,
        proof
      );

      if (!claim.ok) {
        log.error(this.name, `Claim failed: ${claim.error}`);
        this.state.errors++;
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

      // If we can still claim, try again after a delay
      if (this.state.sessionClaims < this.config.maxClaimsPerSession) {
        const nextDelay = getHumanClaimDelay(3000, 10000);
        log.info(
          this.name,
          `${this.config.maxClaimsPerSession - this.state.sessionClaims} claims remaining. Next in ${formatMs(nextDelay)}...`
        );
        await sleep(nextDelay);

        // Re-check status before next claim
        if (this.running) {
          await this.executeClaim();
        }
      }
    } finally {
      this.state.isArming = false;
      this.state.isClaiming = false;
    }
  }
}
