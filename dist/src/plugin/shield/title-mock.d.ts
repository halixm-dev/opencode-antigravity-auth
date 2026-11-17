/**
 * Local session-title responder (ported from ag-shield).
 *
 * OpenCode asks the model to name a session with a dedicated request:
 *
 * "Reply with a title for it and nothing else: one line, no quotes, ..."
 *
 * That request burns a real upstream call (and rate-limit quota) for a string
 * that can be produced locally. This module detects those requests and answers
 * them in-process with the native Gemini response shape, including SSE.
 */
export interface TitleDetection {
    isTitleRequest: boolean;
    title: string;
}
export interface TitleMockOptions {
    /** Force streaming SSE output regardless of the detected request */
    streaming?: boolean;
    /** Model name echoed back in the response */
    model?: string;
}
/**
 * Derives a readable title from the first chunk of conversation text.
 */
export declare function deriveTitle(source: string): string;
/**
 * Detects whether a payload is a session-title request and derives its title.
 */
export declare function detectTitleRequest(payload: Record<string, unknown>): TitleDetection;
/**
 * Builds the local response for a detected title request.
 */
export declare function buildTitleResponse(title: string, options?: TitleMockOptions): Response;
/**
 * Parses a request body and produces a local title response when applicable.
 * Returns `null` when the request should be forwarded normally.
 */
export declare function maybeBuildTitleResponse(body: unknown, options?: TitleMockOptions): Response | null;
//# sourceMappingURL=title-mock.d.ts.map