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
  enableAutoClaim: boolean;
  enableTaskClaim: boolean;
}

// API Response types
export interface DropStatus {
  ok: boolean;
  error?: string;
  sessId: number;
  poolState: "stocked" | "flowing" | "thinning" | "low" | "sealed";
  poolPct: number;
  isActive: boolean;
  mySessionClaims: number;
  msUntilNext: number;
  msUntilClose: number;
  maxClaims: number;
  portraitsBuilt?: number;
  supplyCap?: number;
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
  hint?: string;
}

export interface PreWhitelistApplyResponse {
  ok: boolean;
  id?: string;
  status?: string; // "pending" | "approved" | "rejected"
  submitted?: boolean;
  alreadyApproved?: boolean;
  error?: string;
}

export interface UserProfile {
  ok: boolean;
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
    suspended: boolean;
    dropEligible: boolean;
  };
  preWhitelist: {
    id: string;
    status: string; // "pending" | "approved" | "rejected"
    message?: string;
    decidedAt?: string;
  } | null;
  inventory?: any[];
  completedNFTs?: any[];
  pendingGifts?: any[];
  pendingBustsTransfers?: any[];
  bustsHistory?: any[];
  whitelistWallet?: string | null;
}

export interface BoxOpenResponse {
  ok: boolean;
  element?: {
    type: string;
    variant: string;
    name: string;
    rarity: string;
  };
  cost?: number;
  error?: string;
}

export type TaskAction = "like" | "rt" | "reply";

export interface SocialTask {
  id: number;
  tweetId: string;
  tweetUrl: string;
  description: string;
  rewards: {
    like: number;
    rt: number;
    reply: number;
    trifecta: number;
  };
  activeFrom: string;
  activeUntil: string | null;
  myActions: Record<string, any>;
}

export interface TasksResponse {
  ok: boolean;
  tasks?: SocialTask[];
}

export interface TaskSubmitResponse {
  ok: boolean;
  submitted?: boolean;
  points?: number;
  status?: string;
  error?: string;
}

export interface FollowClaimResponse {
  ok: boolean;
  claimed?: boolean;
  reward?: number;
  claimedAt?: string;
  verified?: boolean;
  error?: string;
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
  claimInProgress: boolean;
}

export type LogLevel = "info" | "warn" | "error" | "success" | "debug";
