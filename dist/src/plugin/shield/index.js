/**
 * Agent signature shield (ported from ag-shield).
 *
 * Combines prompt fingerprint neutralization and reasoning-effort
 * normalization into a single entry point for the request pipeline.
 */
import { normalizeReasoningEffort } from "./reasoning-effort.js";
import { sanitizeRequestSignatures } from "./signature-sanitizer.js";
/**
 * Applies every enabled shield transformation to a request payload in place.
 *
 * Call this before the Antigravity system instruction is injected so the
 * plugin's own identity text is never rewritten.
 */
export function applyShieldToRequestPayload(payload, config) {
    const result = { changed: false, changes: [] };
    if (!payload || typeof payload !== "object" || !config.enabled) {
        return result;
    }
    if (config.strip_signatures) {
        const sanitized = sanitizeRequestSignatures(payload, {
            stripSignatures: true,
            sanitizeUserMessages: config.sanitize_user_messages,
            customReplacements: config.custom_replacements,
        });
        result.changed = result.changed || sanitized.changed;
        result.changes.push(...sanitized.changes);
    }
    if (config.normalize_reasoning_effort) {
        const normalized = normalizeReasoningEffort(payload, {
            source: config.reasoning_effort_source,
            target: config.reasoning_effort_target,
        });
        result.changed = result.changed || normalized.changed;
        result.changes.push(...normalized.changes);
    }
    return result;
}
export { sanitizeSignatureText, sanitizeRequestSignatures } from "./signature-sanitizer.js";
export { normalizeReasoningEffort } from "./reasoning-effort.js";
export { buildTitleResponse, deriveTitle, detectTitleRequest, maybeBuildTitleResponse, } from "./title-mock.js";
//# sourceMappingURL=index.js.map