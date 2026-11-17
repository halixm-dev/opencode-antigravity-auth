import type { PluginClient } from "./types.js";
import type { AccountMetadataV3 } from "./storage.js";
export type QuotaGroup = "claude" | "gemini-pro" | "gemini-flash";
export interface QuotaGroupSummary {
    remainingFraction?: number;
    resetTime?: string;
    /** Reset belonging to the model that supplies remainingFraction. */
    remainingFractionResetTime?: string;
    modelCount: number;
}
export interface QuotaSummary {
    groups: Partial<Record<QuotaGroup, QuotaGroupSummary>>;
    modelCount: number;
    models?: Record<string, AvailableModel>;
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
export interface FetchAvailableModelsResponse {
    models?: Record<string, FetchAvailableModelEntry>;
    agentModelSorts?: Array<{
        groups?: Array<{
            modelIds?: string[];
        }>;
    }>;
    tieredModelIds?: Record<string, string[]>;
}
export interface AvailableModel {
    displayName?: string;
    maxTokens?: number;
    maxOutputTokens?: number;
    supportsImages?: boolean;
    supportsThinking?: boolean;
    disabled?: boolean;
    selectable?: boolean;
}
interface FetchAvailableModelEntry extends AvailableModel {
    quotaInfo?: {
        remainingFraction?: number;
        resetTime?: string;
    };
    displayName?: string;
    modelName?: string;
}
export declare function checkAccountsQuota(accounts: AccountMetadataV3[], client: PluginClient, providerId?: string, options?: {
    includeDisabled?: boolean;
    onAccountUpdated?: (original: AccountMetadataV3, updated: AccountMetadataV3) => Promise<unknown>;
    signal?: AbortSignal;
}): Promise<AccountQuotaResult[]>;
export {};
//# sourceMappingURL=quota.d.ts.map