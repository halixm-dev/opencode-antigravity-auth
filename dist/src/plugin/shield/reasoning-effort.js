/**
 * Reasoning effort normalization (ported from ag-shield).
 *
 * Agent frameworks sometimes send `reasoning_effort: "none"` (or other values
 * outside the accepted set) through OpenAI-compatible layers. Antigravity
 * rejects those with `400 INVALID_ARGUMENT`. This module removes or maps the
 * value before the request is forwarded.
 */
const VALID_TARGETS = ["remove", "low", "medium", "high"];
function isValidTarget(value) {
    return typeof value === "string" && VALID_TARGETS.includes(value);
}
function shouldApply(value, source) {
    return source === "any" || value === source;
}
function applyToRecord(record, keys, source, target, label, result) {
    for (const key of keys) {
        if (!(key in record)) {
            continue;
        }
        if (!shouldApply(record[key], source)) {
            continue;
        }
        if (target === "remove") {
            delete record[key];
            result.changes.push(`${label}: removed ${key}`);
        }
        else {
            record[key] = target;
            result.changes.push(`${label}: mapped ${key} to ${target}`);
        }
        result.changed = true;
    }
}
/**
 * Normalizes reasoning effort fields in place.
 *
 * Handles:
 * - `reasoning_effort` / `reasoningEffort` at the payload root
 * - `extra_body.reasoning_effort`
 * - `providerOptions.google.reasoningEffort`
 * - `generationConfig.thinkingConfig.thinkingLevel` set to `none`/`auto`/`default`
 */
export function normalizeReasoningEffort(payload, options = {}) {
    const result = { changed: false, changes: [] };
    if (!payload || typeof payload !== "object") {
        return result;
    }
    const source = options.source ?? "any";
    const target = isValidTarget(options.target) ? options.target : "remove";
    applyToRecord(payload, ["reasoning_effort", "reasoningEffort"], source, target, "payload", result);
    const extraBody = payload.extra_body;
    if (extraBody && typeof extraBody === "object" && !Array.isArray(extraBody)) {
        applyToRecord(extraBody, ["reasoning_effort", "reasoningEffort"], source, target, "extra_body", result);
    }
    const providerOptions = payload.providerOptions;
    if (providerOptions && typeof providerOptions === "object" && !Array.isArray(providerOptions)) {
        const google = providerOptions.google;
        if (google && typeof google === "object" && !Array.isArray(google)) {
            applyToRecord(google, ["reasoningEffort", "reasoning_effort"], source, target, "providerOptions.google", result);
        }
    }
    const generationConfig = payload.generationConfig;
    if (generationConfig && typeof generationConfig === "object" && !Array.isArray(generationConfig)) {
        const thinkingConfig = generationConfig.thinkingConfig;
        if (thinkingConfig && typeof thinkingConfig === "object" && !Array.isArray(thinkingConfig)) {
            const thinking = thinkingConfig;
            const level = thinking.thinkingLevel;
            if (typeof level === "string" && ["none", "auto", "default", "off"].includes(level.toLowerCase())) {
                if (target === "remove") {
                    delete thinking.thinkingLevel;
                    result.changes.push("thinkingConfig: removed unsupported thinkingLevel");
                }
                else {
                    thinking.thinkingLevel = target;
                    result.changes.push(`thinkingConfig: mapped thinkingLevel to ${target}`);
                }
                result.changed = true;
            }
        }
    }
    return result;
}
//# sourceMappingURL=reasoning-effort.js.map