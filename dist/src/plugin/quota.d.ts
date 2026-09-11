import type { PluginClient } from "./types";
import type { AccountMetadataV3 } from "./storage";
export type QuotaGroup = "claude" | "gemini-pro" | "gemini-flash";
export interface QuotaGroupSummary {
    remainingFraction?: number;
    resetTime?: string;
    modelCount: number;
}
export interface QuotaSummary {
    groups: Partial<Record<QuotaGroup, QuotaGroupSummary>>;
    modelCount: number;
    error?: string;
}
export interface GeminiCliQuotaModel {
    modelId: string;
    remainingFraction: number;
    resetTime?: string;
}
export interface GeminiCliQuotaSummary {
    models: GeminiCliQuotaModel[];
    error?: string;
}
export type AccountQuotaStatus = "ok" | "disabled" | "error";
export interface AccountQuotaResult {
    index: number;
    email?: string;
    status: AccountQuotaStatus;
    error?: string;
    disabled?: boolean;
    quota?: QuotaSummary;
    geminiCliQuota?: GeminiCliQuotaSummary;
    updatedAccount?: AccountMetadataV3;
}
export declare function checkAccountsQuota(accounts: AccountMetadataV3[], client: PluginClient, providerId?: string): Promise<AccountQuotaResult[]>;
//# sourceMappingURL=quota.d.ts.map