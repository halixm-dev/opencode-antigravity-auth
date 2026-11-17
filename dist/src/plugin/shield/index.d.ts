/**
 * Agent signature shield (ported from ag-shield).
 *
 * Combines prompt fingerprint neutralization and reasoning-effort
 * normalization into a single entry point for the request pipeline.
 */
import type { ShieldConfig } from "../config/index.js";
export interface ShieldResult {
    changed: boolean;
    changes: string[];
}
/**
 * Applies every enabled shield transformation to a request payload in place.
 *
 * Call this before the Antigravity system instruction is injected so the
 * plugin's own identity text is never rewritten.
 */
export declare function applyShieldToRequestPayload(payload: Record<string, unknown>, config: ShieldConfig): ShieldResult;
export { sanitizeSignatureText, sanitizeRequestSignatures } from "./signature-sanitizer.js";
export type { ShieldReplacement, SignatureSanitizeOptions } from "./signature-sanitizer.js";
export { normalizeReasoningEffort } from "./reasoning-effort.js";
export type { ReasoningEffortOptions, ReasoningEffortTarget } from "./reasoning-effort.js";
export { buildTitleResponse, deriveTitle, detectTitleRequest, maybeBuildTitleResponse, } from "./title-mock.js";
export type { TitleDetection, TitleMockOptions } from "./title-mock.js";
//# sourceMappingURL=index.d.ts.map