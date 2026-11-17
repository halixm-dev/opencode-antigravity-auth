/**
 * Device Fingerprint Generator for Rate Limit Mitigation
 *
 * Ported from antigravity-claude-proxy PR #170
 * https://github.com/badrisnarayanan/antigravity-claude-proxy/pull/170
 *
 * Generates randomized device fingerprints to help distribute API usage
 * across different apparent device identities.
 */
export interface ClientMetadata {
    ideType: string;
    platform: string;
    pluginType: string;
}
export interface Fingerprint {
    deviceId: string;
    sessionToken: string;
    userAgent: string;
    apiClient: string;
    clientMetadata: ClientMetadata;
    createdAt: number;
    /** @deprecated Kept for backward compat with stored fingerprints */
    quotaUser?: string;
}
/**
 * Fingerprint version for history tracking.
 * Stores a snapshot of a fingerprint with metadata about when/why it was saved.
 */
export interface FingerprintVersion {
    fingerprint: Fingerprint;
    timestamp: number;
    reason: 'initial' | 'regenerated' | 'restored';
}
/** Maximum number of fingerprint versions to keep per account */
export declare const MAX_FINGERPRINT_HISTORY = 5;
export interface FingerprintHeaders {
    "User-Agent": string;
}
/**
 * Generate a randomized device fingerprint.
 * Each fingerprint represents a unique "device" identity. The userAgent is the
 * shared Hub User-Agent because Cloud Code ties it to the release and build CL.
 */
export declare function generateFingerprint(): Fingerprint;
/**
 * Collect fingerprint based on actual current system.
 * Uses real OS info for stored metadata; the userAgent is still the Hub User-Agent.
 */
export declare function collectCurrentFingerprint(): Fingerprint;
/**
 * Migrate a fingerprint's userAgent to the current Hub User-Agent.
 * Saved fingerprints may carry a legacy `antigravity/<version> <os>/<arch>` agent or
 * an older Hub release. Requests never send the stored value; this keeps storage in sync.
 * Returns true if the userAgent was changed.
 */
export declare function updateFingerprintVersion(fingerprint: Fingerprint): boolean;
/**
 * Build HTTP headers from a fingerprint object.
 * The User-Agent is resolved at call time from the current Hub version, so a stale
 * stored fingerprint userAgent is never sent.
 */
export declare function buildFingerprintHeaders(fingerprint: Fingerprint | null): Partial<FingerprintHeaders>;
/**
 * Get or create the session fingerprint.
 * Returns the same fingerprint for all calls within a session.
 */
export declare function getSessionFingerprint(): Fingerprint;
/**
 * Regenerate the session fingerprint.
 * Call this to get a fresh identity (e.g., after rate limiting).
 */
export declare function regenerateSessionFingerprint(): Fingerprint;
//# sourceMappingURL=fingerprint.d.ts.map