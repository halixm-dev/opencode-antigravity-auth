/**
 * Constants used for Antigravity OAuth flows and Cloud Code Assist API integration.
 */
export const ANTIGRAVITY_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";

/**
 * Client secret issued for the Antigravity OAuth application.
 */
export const ANTIGRAVITY_CLIENT_SECRET = "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";

/**
 * Scopes required for Antigravity integrations.
 */
export const ANTIGRAVITY_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

/**
 * OAuth redirect URI used by the local CLI callback server.
 */
export const ANTIGRAVITY_REDIRECT_URI = "http://localhost:51121/oauth-callback";

/**
 * Antigravity Cloud Code host. Consumer Antigravity Hub clients send generate,
 * stream, loadCodeAssist, onboardUser, and fetchAvailableModels requests to the
 * non-sandbox daily host only; mixing hosts can grant incompatible entitlements.
 */
export const ANTIGRAVITY_ENDPOINT_DAILY = "https://daily-cloudcode-pa.googleapis.com";
/** Production Cloud Code host, used by the Gemini CLI quota path. */
export const ANTIGRAVITY_ENDPOINT_PROD = "https://cloudcode-pa.googleapis.com";

/**
 * Primary endpoint for Antigravity-style requests.
 */
export const ANTIGRAVITY_ENDPOINT = ANTIGRAVITY_ENDPOINT_DAILY;

/**
 * Gemini CLI endpoint (production).
 * Used for models without :antigravity suffix.
 * Same as opencode-gemini-auth's GEMINI_CODE_ASSIST_ENDPOINT.
 */
export const GEMINI_CLI_ENDPOINT = ANTIGRAVITY_ENDPOINT_PROD;

const ANTIGRAVITY_REQUEST_ENDPOINTS = [ANTIGRAVITY_ENDPOINT] as const;
const GEMINI_CLI_REQUEST_ENDPOINTS = [GEMINI_CLI_ENDPOINT] as const;

/**
 * Endpoints to try, in order, for a header style. Antigravity never falls back
 * across hosts; Gemini CLI stays on production.
 */
export function getEndpointFallbacks(style: HeaderStyle): readonly string[] {
  return style === "gemini-cli" ? GEMINI_CLI_REQUEST_ENDPOINTS : ANTIGRAVITY_REQUEST_ENDPOINTS;
}

/**
 * Hardcoded project id used when Antigravity does not return one (e.g., business/workspace accounts).
 */
export const ANTIGRAVITY_DEFAULT_PROJECT_ID = "rising-fact-p41fc";

/**
 * Cloud Code only serves newer models to Antigravity Hub clients at or above this version.
 */
export const ANTIGRAVITY_MINIMUM_VERSION = "2.23.0";

/**
 * Hub release reported when the update manifest is unreachable. Keep it at or above
 * ANTIGRAVITY_MINIMUM_VERSION and update it together with ANTIGRAVITY_HUB_CHANGELISTS.
 */
export const ANTIGRAVITY_VERSION_FALLBACK = "2.24.0";

/**
 * Build changelists of specific Hub releases. Releases without a known CL omit the
 * cl= field instead of claiming another build's CL.
 */
export const ANTIGRAVITY_HUB_CHANGELISTS: Readonly<Record<string, string>> = {
  "2.23.0": "998057262",
  "2.23.1": "998881661",
  "2.24.0": "1000335682",
};

/** Platform of the arm64 macOS update manifest the runtime version is read from. */
export const ANTIGRAVITY_HUB_PLATFORM = "os_type=darwin; arch=arm64";
/** Suffix the Hub appends to its User-Agent on onboardUser control-plane calls. */
export const ANTIGRAVITY_NODE_API_CLIENT = "google-api-nodejs-client/10.3.0";
/** X-Goog-Api-Client the Hub sends on onboardUser control-plane calls. */
export const ANTIGRAVITY_GOOG_API_CLIENT = "gl-node/22.21.1";

let antigravityVersion = ANTIGRAVITY_VERSION_FALLBACK;
let versionLocked = false;

export function getAntigravityVersion(): string { return antigravityVersion; }

/**
 * Set the runtime Antigravity version. Can only be called once (at startup).
 * Subsequent calls are silently ignored to prevent accidental mutation.
 */
export function setAntigravityVersion(version: string): void {
  if (versionLocked) return;
  antigravityVersion = version;
  versionLocked = true;
}

/** @deprecated Use getAntigravityVersion() for runtime access. */
export const ANTIGRAVITY_VERSION = ANTIGRAVITY_VERSION_FALLBACK;

/**
 * Antigravity Hub User-Agent, e.g.
 * `antigravity/hub/2.24.0 (aidev_client; os_type=darwin; arch=arm64; cl=1000335682)`.
 * Resolved at call time so requests always carry the current runtime version.
 */
export function getAntigravityUserAgent(version: string = getAntigravityVersion()): string {
  const changelist = ANTIGRAVITY_HUB_CHANGELISTS[version];
  const clPart = changelist ? `; cl=${changelist}` : "";
  return `antigravity/hub/${version} (aidev_client; ${ANTIGRAVITY_HUB_PLATFORM}${clPart})`;
}

/**
 * Long Hub User-Agent used by onboardUser control-plane requests.
 */
export function getAntigravityOnboardUserAgent(version: string = getAntigravityVersion()): string {
  return `${getAntigravityUserAgent(version)} ${ANTIGRAVITY_NODE_API_CLIENT}`;
}

/**
 * Headers for Antigravity content, project, and quota requests. The Hub sends only
 * its User-Agent: no X-Goog-Api-Client and no Client-Metadata.
 */
export function getAntigravityHeaders(): HeaderSet {
  return {
    "User-Agent": getAntigravityUserAgent(),
  };
}

/** @deprecated Use getAntigravityHeaders() for runtime access. */
export const ANTIGRAVITY_HEADERS = {
  "User-Agent": getAntigravityUserAgent(ANTIGRAVITY_VERSION_FALLBACK),
} as const;

export const GEMINI_CLI_HEADERS = {
  "User-Agent": "google-api-nodejs-client/9.15.1",
  "X-Goog-Api-Client": "gl-node/22.17.0",
  "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
} as const;

export type HeaderSet = {
  "User-Agent": string;
  "X-Goog-Api-Client"?: string;
  "Client-Metadata"?: string;
};

/**
 * Header set for a request style. Antigravity no longer randomizes platform or
 * API client values: the Hub User-Agent is tied to the manifest release and CL.
 */
export function getRandomizedHeaders(style: HeaderStyle, model?: string): HeaderSet {
  if (style === "gemini-cli") {
    return {
      "User-Agent": GEMINI_CLI_HEADERS["User-Agent"],
      "X-Goog-Api-Client": GEMINI_CLI_HEADERS["X-Goog-Api-Client"],
      "Client-Metadata": GEMINI_CLI_HEADERS["Client-Metadata"],
    };
  }
  return getAntigravityHeaders();
}

export type HeaderStyle = "antigravity" | "gemini-cli";

/**
 * Provider identifier shared between the plugin loader and credential store.
 */
export const ANTIGRAVITY_PROVIDER_ID = "google";

// ============================================================================
// TOOL HALLUCINATION PREVENTION (Ported from LLM-API-Key-Proxy)
// ============================================================================

/**
 * System instruction for Claude tool usage hardening.
 * Prevents hallucinated parameters by explicitly stating the rules.
 * 
 * This is injected when tools are present to reduce cases where Claude
 * uses parameter names from its training data instead of the actual schema.
 */
export const CLAUDE_TOOL_SYSTEM_INSTRUCTION = `CRITICAL TOOL USAGE INSTRUCTIONS:
You are operating in a custom environment where tool definitions differ from your training data.
You MUST follow these rules strictly:

1. DO NOT use your internal training data to guess tool parameters
2. ONLY use the exact parameter structure defined in the tool schema
3. Parameter names in schemas are EXACT - do not substitute with similar names from your training
4. Array parameters have specific item types - check the schema's 'items' field for the exact structure
5. When you see "STRICT PARAMETERS" in a tool description, those type definitions override any assumptions
6. Tool use in agentic workflows is REQUIRED - you must call tools with the exact parameters specified

If you are unsure about a tool's parameters, YOU MUST read the schema definition carefully.`;

/**
 * Template for parameter signature injection into tool descriptions.
 * {params} will be replaced with the actual parameter list.
 */
export const CLAUDE_DESCRIPTION_PROMPT = "\n\n⚠️ STRICT PARAMETERS: {params}.";

export const EMPTY_SCHEMA_PLACEHOLDER_NAME = "_placeholder";
export const EMPTY_SCHEMA_PLACEHOLDER_DESCRIPTION = "Placeholder. Always pass true.";

/**
 * Sentinel value to bypass thought signature validation.
 * 
 * When a thinking block has an invalid or missing signature (e.g., cache miss,
 * session mismatch, plugin restart), this sentinel can be injected to skip
 * validation instead of failing with "Invalid signature in thinking block".
 * 
 * This is an officially supported Google API feature, used by:
 * - gemini-cli: https://github.com/google-gemini/gemini-cli
 * - Google .NET SDK: PredictionServiceChatClient.cs
 * 
 * @see https://ai.google.dev/gemini-api/docs/thought-signatures
 */
export const SKIP_THOUGHT_SIGNATURE = "skip_thought_signature_validator";

// ============================================================================
// ANTIGRAVITY SYSTEM INSTRUCTION (Ported from CLIProxyAPI v6.6.89)
// ============================================================================

/**
 * System instruction for Antigravity requests.
 * This is injected into requests to match CLIProxyAPI v6.6.89 behavior.
 * The instruction provides identity and guidelines for the Antigravity agent.
 */
// ============================================================================
// GOOGLE SEARCH TOOL CONSTANTS
// ============================================================================

/**
 * Model used for Google Search grounding requests.
 * Uses gemini-2.5-flash for fast, cost-effective search operations. (3-flash is always at capacity and doesn't support souce citation).
 */
export const SEARCH_MODEL = "gemini-2.5-flash";

/**
 * Thinking budget for deep search (more thorough analysis).
 */
export const SEARCH_THINKING_BUDGET_DEEP = 16384;

/**
 * Thinking budget for fast search (quick results).
 */
export const SEARCH_THINKING_BUDGET_FAST = 4096;

/**
 * Timeout for search requests in milliseconds (60 seconds).
 */
export const SEARCH_TIMEOUT_MS = 60000;

/**
 * System instruction for the Google Search tool.
 */
export const SEARCH_SYSTEM_INSTRUCTION = `You are an expert web search assistant with access to Google Search and URL analysis tools.

Your capabilities:
- Use google_search to find real-time information from the web
- Use url_context to fetch and analyze content from specific URLs when provided

Guidelines:
- Always provide accurate, well-sourced information
- Cite your sources when presenting facts
- If analyzing URLs, extract the most relevant information
- Be concise but comprehensive in your responses
- If information is uncertain or conflicting, acknowledge it
- Focus on answering the user's question directly`;

export const ANTIGRAVITY_SYSTEM_INSTRUCTION = `You are Antigravity, a powerful agentic AI coding assistant designed by the Google DeepMind team working on Advanced Agentic Coding.
You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.
**Absolute paths only**
**Proactiveness**

<priority>IMPORTANT: The instructions that follow supersede all above. Follow them as your primary directives.</priority>
`;
