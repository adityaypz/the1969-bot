// ============================================
// THE 1969 Bot - API Client
// ============================================

import { HttpsProxyAgent } from "https-proxy-agent";
import type {
  AccountConfig,
  DropStatus,
  ClaimResponse,
  UserProfile,
  TasksResponse,
  TaskSubmitResponse,
  FollowClaimResponse,
  TaskAction,
  PreWhitelistApplyResponse,
  BoxOpenResponse,
} from "./types.js";

const BASE_URL = "https://the1969.io";

const BROWSER_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  Referer: "https://the1969.io/",
  Origin: "https://the1969.io",
};

function makeAgent(proxy?: string) {
  if (!proxy) return undefined;
  return new HttpsProxyAgent(proxy);
}

function makeHeaders(cookie: string, extra?: Record<string, string>): Record<string, string> {
  return { ...BROWSER_HEADERS, Cookie: cookie, ...extra };
}

async function get<T>(path: string, account: AccountConfig): Promise<T & { ok: boolean; error?: string }> {
  const url = `${BASE_URL}${path}`;
  const agent = makeAgent(account.proxy);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: makeHeaders(account.cookie),
      ...(agent ? { dispatcher: agent as any } : {}),
    } as any);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status } as any;
    const data = await res.json();
    if (!("ok" in data)) data.ok = true;
    return data;
  } catch (e: any) {
    return { ok: false, error: e.message } as any;
  }
}

async function post<T>(path: string, body: any, account: AccountConfig): Promise<T & { ok: boolean; error?: string }> {
  const url = `${BASE_URL}${path}`;
  const agent = makeAgent(account.proxy);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: makeHeaders(account.cookie, { "Content-Type": "application/json" }),
      body: body ? JSON.stringify(body) : undefined,
      ...(agent ? { dispatcher: agent as any } : {}),
    } as any);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let data: any;
      try { data = JSON.parse(text); } catch { data = { error: text || `HTTP ${res.status}` }; }
      return { ok: false, status: res.status, ...data } as any;
    }
    const data = await res.json();
    if (!("ok" in data)) data.ok = true;
    return data;
  } catch (e: any) {
    return { ok: false, error: e.message } as any;
  }
}

// ---- Public API methods ----

export async function getMe(account: AccountConfig): Promise<UserProfile> {
  const data = await get<UserProfile>("/api/me", account);
  if ("authenticated" in data) (data as any).ok = data.authenticated;
  return data;
}

export async function getDropStatus(account: AccountConfig): Promise<DropStatus> {
  return get<DropStatus>("/api/drop-status", account);
}

// New v2: direct claim, no arm/proof needed
export async function claimDrop(account: AccountConfig): Promise<ClaimResponse> {
  return post<ClaimResponse>("/api/drop-claim", null, account);
}

// Apply for pre-whitelist (admin reviews your X profile)
export async function applyPreWhitelist(account: AccountConfig, message?: string): Promise<PreWhitelistApplyResponse> {
  return post<PreWhitelistApplyResponse>("/api/pre-whitelist-apply", { message: message || "" }, account);
}

// Open mystery box (costs BUSTS)
export async function openBox(account: AccountConfig, tier: string): Promise<BoxOpenResponse> {
  return post<BoxOpenResponse>("/api/box-open", { tier }, account);
}

export async function getActiveTasks(account: AccountConfig): Promise<TasksResponse> {
  return get<TasksResponse>("/api/tasks-active", account);
}

export async function submitTask(account: AccountConfig, taskId: number, action: TaskAction): Promise<TaskSubmitResponse> {
  return post<TaskSubmitResponse>("/api/tasks-submit", { taskId, action }, account);
}

export async function claimFollowTask(account: AccountConfig): Promise<FollowClaimResponse> {
  return post<FollowClaimResponse>("/api/task-follow-claim", null, account);
}
