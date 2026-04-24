// ============================================
// THE 1969 Bot - API Client
// ============================================

import { HttpsProxyAgent } from "https-proxy-agent";
import type {
  AccountConfig,
  DropStatus,
  ArmResponse,
  ClaimResponse,
  InteractionProof,
  UserProfile,
  TasksResponse,
} from "./types.js";
import * as log from "./logger.js";

const BASE_URL = "https://the1969.io";

// Realistic browser headers
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
  return {
    ...BROWSER_HEADERS,
    Cookie: cookie,
    ...extra,
  };
}

async function get<T>(
  path: string,
  account: AccountConfig
): Promise<T & { ok: boolean; error?: string }> {
  const url = `${BASE_URL}${path}`;
  const agent = makeAgent(account.proxy);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: makeHeaders(account.cookie),
      ...(agent ? { dispatcher: agent as any } : {}),
    } as any);

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}`, status: res.status } as any;
    }

    const data = await res.json();
    // Normalize: ensure ok field exists for 2xx responses
    if (!("ok" in data)) data.ok = true;
    return data;
  } catch (e: any) {
    return { ok: false, error: e.message } as any;
  }
}

async function post<T>(
  path: string,
  body: any,
  account: AccountConfig
): Promise<T & { ok: boolean; error?: string }> {
  const url = `${BASE_URL}${path}`;
  const agent = makeAgent(account.proxy);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: makeHeaders(account.cookie, {
        "Content-Type": "application/json",
      }),
      body: body ? JSON.stringify(body) : undefined,
      ...(agent ? { dispatcher: agent as any } : {}),
    } as any);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text || `HTTP ${res.status}` };
      }
      return { ok: false, status: res.status, ...data } as any;
    }

    const data = await res.json();
    // Normalize: ensure ok field exists for 2xx responses
    if (!("ok" in data)) data.ok = true;
    return data;
  } catch (e: any) {
    return { ok: false, error: e.message } as any;
  }
}

// ---- Public API methods ----

export async function getMe(account: AccountConfig): Promise<UserProfile> {
  const data = await get<UserProfile>("/api/me", account);
  // Normalize: API uses "authenticated" instead of "ok"
  if ("authenticated" in data) {
    (data as any).ok = data.authenticated;
  }
  return data;
}

export async function getDropStatus(account: AccountConfig): Promise<DropStatus> {
  return get<DropStatus>("/api/drop-status", account);
}

export async function armDrop(account: AccountConfig): Promise<ArmResponse> {
  return post<ArmResponse>("/api/drop-arm", null, account);
}

export async function claimDrop(
  account: AccountConfig,
  armToken: string,
  interactionProof: InteractionProof
): Promise<ClaimResponse> {
  return post<ClaimResponse>(
    "/api/drop-claim",
    { armToken, interactionProof },
    account
  );
}

export async function getActiveTasks(account: AccountConfig): Promise<TasksResponse> {
  return get<TasksResponse>("/api/tasks-active", account);
}

export async function submitTask(
  account: AccountConfig,
  taskId: string,
  action: string
): Promise<{ ok: boolean; error?: string }> {
  return post("/api/tasks-submit", { taskId, action }, account);
}

export async function claimFollowTask(
  account: AccountConfig
): Promise<{ ok: boolean; error?: string }> {
  return post("/api/task-follow-claim", null, account);
}
