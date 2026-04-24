// ============================================
// THE 1969 Bot - Type Definitions
// ============================================

export interface AccountConfig {
  name: string;
  cookie: string;
  proxy?: string;
}

export interface BotConfig {
  accounts: AccountConfig[];
  pollInterval: number;
  claimDelayMin: number;
  claimDelayMax: number;
  armWaitBuffer: number;
  maxClaimsPerSession: number;
  enableAutoClaim: boolean;
  enableTaskClaim: boolean;
}

// API Response types
export interface ApiResponse<T = any> {
  ok: boolean;
  error?: string;
  status?: number;
  data?: T;
}

export interface DropStatus {
  ok: boolean;
  error?: string;
  sessId: number;
  poolState: "stocked" | "thinning" | "low" | "sealed";
  poolPct: number;
  isActive: boolean;
  mySessionClaims: number;
  msUntilNext: number;
  msUntilClose: number;
  maxClaims: number;
  admin?: any;
}

export interface ArmResponse {
  ok: boolean;
  token: string;
  nonce: string;
  notValidBeforeMs: number;
  expiresAtMs: number;
  error?: string;
}

export interface InteractionProof {
  nonce: string;
  windowOpenMs: number;
  moveCount: number;
  pathEntropy: number;
  dragVarX: number;
  dragVarY: number;
  armedMs: number;
}

export interface ClaimResponse {
  ok: boolean;
  element?: {
    type: string;
    variant: string;
    name: string;
    rarity: string;
  };
  bustsReward?: number;
  position?: number;
  dailyBonus?: number;
  error?: string;
}

export interface UserProfile {
  ok: boolean; // normalized by api.ts
  error?: string;
  authenticated?: boolean;
  user?: {
    id: string;
    xUsername: string;
    xName: string;
    xAvatar: string;
    bustsBalance: number;
    isWhitelisted: boolean;
    isAdmin: boolean;
    referralCode: string;
    walletAddress: string | null;
    dailyClaimedOn: string | null;
    followClaimedAt: string | null;
  };
  inventory?: any[];
  completedNFTs?: any[];
  pendingGifts?: any[];
  pendingBustsTransfers?: any[];
  bustsHistory?: any[];
  whitelistWallet?: string | null;
}

export interface TasksResponse {
  ok: boolean;
  tasks?: Array<{
    id: string;
    type: string;
    action: string;
    reward: number;
    completed: boolean;
  }>;
}

// Session state tracking
export interface SessionState {
  sessId: number;
  isActive: boolean;
  isPoolEmpty: boolean;
  msUntilNext: number;
  msUntilClose: number;
  poolState: string;
  poolPct: number;
  claimsThisSession: number;
  canClaim: boolean;
  maxClaims: number;
}

// Account runtime state
export interface AccountState {
  config: AccountConfig;
  profile: UserProfile | null;
  lastDropStatus: DropStatus | null;
  sessionClaims: number;
  totalClaims: number;
  totalBusts: number;
  lastClaimTime: number;
  errors: number;
  isArming: boolean;
  isClaiming: boolean;
  windowOpenMs: number; // simulated page open time
}

export type LogLevel = "info" | "warn" | "error" | "success" | "debug";
