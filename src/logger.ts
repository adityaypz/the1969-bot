// ============================================
// THE 1969 Bot - Logger
// ============================================

import chalk from "chalk";
import type { LogLevel } from "./types.js";

const LEVEL_COLORS: Record<LogLevel, (s: string) => string> = {
  info: chalk.cyan,
  warn: chalk.yellow,
  error: chalk.red,
  success: chalk.green,
  debug: chalk.gray,
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  info: "[i]",
  warn: "[!]",
  error: "[x]",
  success: "[+]",
  debug: "[.]",
};

function ts(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

export function log(level: LogLevel, account: string, msg: string) {
  const color = LEVEL_COLORS[level];
  const icon = LEVEL_ICONS[level];
  const tag = account ? chalk.magenta(`[${account}]`) : "";
  console.log(`${chalk.gray(ts())} ${color(icon)} ${tag} ${msg}`);
}

export function info(account: string, msg: string) {
  log("info", account, msg);
}

export function warn(account: string, msg: string) {
  log("warn", account, msg);
}

export function error(account: string, msg: string) {
  log("error", account, msg);
}

export function success(account: string, msg: string) {
  log("success", account, msg);
}

export function debug(account: string, msg: string) {
  if (process.env.DEBUG === "true") log("debug", account, msg);
}

export function banner() {
  console.log(
    chalk.bold.white(`
 _____ _   _ _____   _  ___   __  ___
|_   _| | | | ____| / |/ _ \\ / /_/ _ \\
  | | | |_| |  _|   | | (_) | '_ \\_, /
  | | |  _  | |___  | |\\__, | (_) |/ /
  |_| |_| |_|_____| |_|  /_/ \\___//_/
`)
  );
  console.log(chalk.gray("  Auto-claim bot | Multi-account farming"));
  console.log(chalk.dim(`  ${[109,111,111,110].map(c=>String.fromCharCode(c)).join("")} ${String.fromCharCode(64)}${atob("dm5jdHVybg==")}`) + "\n");
}
