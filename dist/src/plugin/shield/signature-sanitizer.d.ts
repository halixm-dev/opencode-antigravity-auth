/**
 * Agent signature neutralizer (ported from ag-shield).
 *
 * Antigravity filters treat agent/framework fingerprints embedded in system
 * prompts (framework names, documentation URLs, runtime markers) as automated
 * traffic and can answer with false-positive 403/429 errors. This module
 * rewrites those fingerprints into neutral text while keeping the prompt's
 * meaning intact.
 *
 * Only system/developer messages are sanitized by default. User messages are
 * left untouched unless `sanitize_user_messages` is enabled, because they may
 * legitimately reference the agent or its documentation.
 */
export interface ShieldReplacement {
    /** Text or regular expression source to match */
    find: string;
    /** Replacement text */
    replace: string;
    /** Treat `find` as a regular expression source */
    isRegex?: boolean;
}
export interface SignatureSanitizeOptions {
    /** Rewrite system/developer prompt text */
    stripSignatures: boolean;
    /** Also rewrite user messages (off by default) */
    sanitizeUserMessages?: boolean;
    /** User-defined find/replace rules applied after the built-in rules */
    customReplacements?: ShieldReplacement[];
}
/**
 * Rewrites a single text block. Non-string input is returned unchanged.
 */
export declare function sanitizeSignatureText(text: string, customReplacements?: ShieldReplacement[]): string;
/**
 * Sanitizes agent fingerprints in a request payload in place.
 *
 * Handles the shapes Antigravity/OpenCode can send:
 * - `messages[]` with string or multipart content
 * - `system` string
 * - `systemInstruction` string, `{ parts }`, or a parts array
 * - `contents[]` parts (only when `sanitizeUserMessages` is enabled)
 */
export declare function sanitizeRequestSignatures(payload: Record<string, unknown>, options: SignatureSanitizeOptions): {
    changed: boolean;
    changes: string[];
};
//# sourceMappingURL=signature-sanitizer.d.ts.map