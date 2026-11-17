/**
 * Reasoning effort normalization (ported from ag-shield).
 *
 * Agent frameworks sometimes send `reasoning_effort: "none"` (or other values
 * outside the accepted set) through OpenAI-compatible layers. Antigravity
 * rejects those with `400 INVALID_ARGUMENT`. This module removes or maps the
 * value before the request is forwarded.
 */
export type ReasoningEffortTarget = "remove" | "low" | "medium" | "high";
export interface ReasoningEffortOptions {
    /** Only act when the current value equals this. `"any"` matches everything. */
    source?: string;
    /** Replacement value, or `"remove"` to drop the field */
    target?: ReasoningEffortTarget;
}
export interface ReasoningEffortResult {
    changed: boolean;
    changes: string[];
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
export declare function normalizeReasoningEffort(payload: Record<string, unknown>, options?: ReasoningEffortOptions): ReasoningEffortResult;
//# sourceMappingURL=reasoning-effort.d.ts.map