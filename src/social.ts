// ============================================
// THE 1969 Bot - Social Task Auto-Completer
// ============================================
// Auto-submits like/rt/reply for all active tweet tasks
// to earn BUSTS rewards (10+20+30+100 trifecta = 160 per task)
//
// Flow per task:
// 1. Check myActions to see what's already done
// 2. Submit missing actions (like -> rt -> reply)
// 3. Random delay between actions to look human
// 4. Also claims follow reward if not claimed yet

import type { AccountConfig, BotConfig, SocialTask, TaskAction } from "./types.js";
import * as api from "./api.js";
import * as log from "./logger.js";

const ALL_ACTIONS: TaskAction[] = ["like", "rt", "reply"];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min) + min);
}

export class SocialTaskRunner {
  private account: AccountConfig;
  private config: BotConfig;
  private completedTaskIds: Set<string> = new Set();
  private running = false;
  private totalBusts = 0;
  private totalActions = 0;

  constructor(account: AccountConfig, config: BotConfig) {
    this.account = account;
    this.config = config;
  }

  get name(): string {
    return this.account.name;
  }

  get stats() {
    return {
      totalBusts: this.totalBusts,
      totalActions: this.totalActions,
      completedTasks: this.completedTaskIds.size,
    };
  }

  async start() {
    this.running = true;
    log.info(this.name, "Social task runner starting...");

    // Claim follow reward first (one-time)
    await this.claimFollow();

    // Initial task sweep
    await this.sweep();

    // Then check for new tasks every 10 minutes
    while (this.running) {
      await sleep(10 * 60 * 1000);
      if (this.running) await this.sweep();
    }
  }

  stop() {
    this.running = false;
  }

  private async claimFollow() {
    try {
      const me = await api.getMe(this.account);
      if (me.ok && me.user?.followClaimedAt) {
        log.debug(this.name, "Follow reward already claimed");
        return;
      }

      const res = await api.claimFollowTask(this.account);
      if (res.claimed) {
        this.totalBusts += res.reward || 0;
        log.success(this.name, `Follow reward claimed: +${res.reward} BUSTS`);
      } else if (res.error) {
        log.debug(this.name, `Follow claim: ${res.error}`);
      }
    } catch (e: any) {
      log.error(this.name, `Follow claim error: ${e.message}`);
    }
  }

  async sweep() {
    try {
      const res = await api.getActiveTasks(this.account);
      if (!res.ok || !res.tasks) {
        log.error(this.name, `Failed to fetch tasks: ${(res as any).error || "unknown"}`);
        return;
      }

      const tasks = res.tasks;
      const pending = tasks.filter(
        (t) => !this.isTaskFullyDone(t)
      );

      if (pending.length === 0) {
        log.info(this.name, `All ${tasks.length} social tasks completed`);
        return;
      }

      log.info(
        this.name,
        `Found ${pending.length} tasks with pending actions (${tasks.length} total)`
      );

      for (const task of pending) {
        if (!this.running) break;
        await this.processTask(task);
      }
    } catch (e: any) {
      log.error(this.name, `Task sweep error: ${e.message}`);
    }
  }

  private isTaskFullyDone(task: SocialTask): boolean {
    if (this.completedTaskIds.has(String(task.id))) return true;
    const done = task.myActions || {};
    return ALL_ACTIONS.every((a) => a in done);
  }

  private getMissingActions(task: SocialTask): TaskAction[] {
    const done = task.myActions || {};
    return ALL_ACTIONS.filter((a) => !(a in done));
  }

  private async processTask(task: SocialTask) {
    const missing = this.getMissingActions(task);
    if (missing.length === 0) {
      this.completedTaskIds.add(String(task.id));
      return;
    }

    log.info(
      this.name,
      `Task #${task.id}: ${missing.join("+")} pending | Tweet: ${task.tweetUrl}`
    );

    for (const action of missing) {
      if (!this.running) break;

      // Human-like delay between actions (3-8s)
      const delay = randInt(3000, 8000);
      await sleep(delay);

      try {
        const res = await api.submitTask(this.account, task.id, action);

        if (res.submitted) {
          const pts = res.points || 0;
          this.totalBusts += pts;
          this.totalActions++;
          log.success(
            this.name,
            `Task #${task.id} ${action}: +${pts} BUSTS (${res.status})`
          );
        } else {
          log.warn(
            this.name,
            `Task #${task.id} ${action} failed: ${res.error || "unknown"}`
          );
        }
      } catch (e: any) {
        log.error(this.name, `Task #${task.id} ${action} error: ${e.message}`);
      }
    }

    // Check if trifecta (all 3 done) - bonus is auto-awarded server-side
    if (missing.length === ALL_ACTIONS.length) {
      log.success(
        this.name,
        `Task #${task.id} TRIFECTA! All 3 actions done (+${task.rewards.trifecta} bonus)`
      );
      this.totalBusts += task.rewards.trifecta;
    }

    this.completedTaskIds.add(String(task.id));
  }
}
