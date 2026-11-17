import type { HeaderStyle } from "../constants.js";
/**
 * Files/directories that should be gitignored in the config directory.
 * These contain sensitive data or machine-specific state.
 */
export declare const GITIGNORE_ENTRIES: string[];
/**
 * Ensures a .gitignore file exists in the config directory with entries
 * for sensitive files. Creates the file if missing, or appends missing
 * entries if it already exists.
 */
export declare function ensureGitignore(configDir: string): Promise<void>;
/**
 * Synchronous version of ensureGitignore for use in sync code paths.
 */
export declare function ensureGitignoreSync(configDir: string): void;
export type ModelFamily = "claude" | "gemini";
export type { HeaderStyle };
export interface RateLimitState {
    claude?: number;
    gemini?: number;
}
export interface RateLimitStateV3 {
    claude?: number;
    "gemini-antigravity"?: number;
    "gemini-cli"?: number;
    [key: string]: number | undefined;
}
export interface AccountMetadataV1 {
    email?: string;
    refreshToken: string;
    projectId?: string;
    managedProjectId?: string;
    addedAt: number;
    lastUsed: number;
    isRateLimited?: boolean;
    rateLimitResetTime?: number;
    lastSwitchReason?: "rate-limit" | "initial" | "rotation";
}
export interface AccountStorageV1 {
    version: 1;
    accounts: AccountMetadataV1[];
    activeIndex: number;
}
export interface AccountMetadata {
    email?: string;
    refreshToken: string;
    projectId?: string;
    managedProjectId?: string;
    addedAt: number;
    lastUsed: number;
    lastSwitchReason?: "rate-limit" | "initial" | "rotation";
    rateLimitResetTimes?: RateLimitState;
}
export interface AccountStorage {
    version: 2;
    accounts: AccountMetadata[];
    activeIndex: number;
}
export type CooldownReason = "auth-failure" | "network-error" | "project-error" | "validation-required";
export interface AccountMetadataV3 {
    /** Stable menu identity, preserved when OAuth refresh tokens rotate. */
    id?: string;
    /** Hashes identify native connections that still hold an older OAuth token. */
    refreshTokenHashes?: string[];
    email?: string;
    refreshToken: string;
    projectId?: string;
    managedProjectId?: string;
    addedAt: number;
    lastUsed: number;
    enabled?: boolean;
    lastSwitchReason?: "rate-limit" | "initial" | "rotation";
    rateLimitResetTimes?: RateLimitStateV3;
    coolingDownUntil?: number;
    cooldownReason?: CooldownReason;
    /** Per-account device fingerprint for rate limit mitigation */
    fingerprint?: import("./fingerprint.js").Fingerprint;
    fingerprintHistory?: import("./fingerprint.js").FingerprintVersion[];
    /** Set when Google asks the user to verify this account before requests can continue. */
    verificationRequired?: boolean;
    verificationRequiredAt?: number;
    verificationRequiredReason?: string;
    verificationUrl?: string;
    /** Cached soft quota data */
    cachedQuota?: Record<string, {
        remainingFraction?: number;
        resetTime?: string;
        remainingFractionResetTime?: string;
        modelCount: number;
    }>;
    cachedQuotaUpdatedAt?: number;
}
export declare const accountTokenHash: (token: string) => string;
export declare function matchesAccountToken(account: AccountMetadataV3, token: string): boolean;
/** Update credentials without losing the identity of older native connections. */
export declare function updateAccountCredentials(account: AccountMetadataV3, parts: {
    refreshToken?: string;
    projectId?: string;
    managedProjectId?: string;
}): void;
export declare function saveAccountCredentials(original: AccountMetadataV3, updated: AccountMetadataV3): Promise<AccountStorageV4 | null>;
export interface AccountStorageV3 {
    version: 3;
    accounts: AccountMetadataV3[];
    activeIndex: number;
    activeIndexByFamily?: {
        claude?: number;
        gemini?: number;
    };
}
export interface AccountStorageV4 {
    version: 4;
    accounts: AccountMetadataV3[];
    activeIndex: number;
    activeIndexByFamily?: {
        claude?: number;
        gemini?: number;
    };
}
/**
 * Gets the config directory path, with the following precedence:
 * 1. OPENCODE_CONFIG_DIR env var (if set)
 * 2. ~/.config/opencode (all platforms, including Windows)
 *
 * On Windows, also checks for legacy %APPDATA%\opencode path for migration.
 */
declare function getConfigDir(): string;
export declare function getStoragePath(): string;
/**
 * Gets the config directory path. Exported for use by other modules.
 */
export { getConfigDir };
export declare function deduplicateAccountsByEmail<T extends {
    email?: string;
    lastUsed?: number;
    addedAt?: number;
}>(accounts: T[]): T[];
export declare function migrateV2ToV3(v2: AccountStorage): AccountStorageV3;
export declare function migrateV3ToV4(v3: AccountStorageV3): AccountStorageV4;
export declare function loadAccounts(): Promise<AccountStorageV4 | null>;
export declare function saveAccounts(storage: AccountStorageV4): Promise<void>;
/** Apply a targeted change to the latest pool while holding its file lock. */
export declare function updateAccounts(update: (storage: AccountStorageV4) => void): Promise<AccountStorageV4 | null>;
/**
 * Save accounts storage by replacing the entire file (no merge).
 * Use this for destructive operations like delete where we need to
 * remove accounts that would otherwise be merged back from existing storage.
 */
export declare function saveAccountsReplace(storage: AccountStorageV4): Promise<void>;
export declare function clearAccounts(): Promise<void>;
//# sourceMappingURL=storage.d.ts.map