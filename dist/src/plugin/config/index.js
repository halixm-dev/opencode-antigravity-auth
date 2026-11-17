/**
 * Configuration module for opencode-antigravity-auth plugin.
 *
 * @example
 * ```typescript
 * import { loadConfig, type AntigravityConfig } from "./config";
 *
 * const config = loadConfig(directory);
 * if (config.session_recovery) {
 *   // Enable session recovery
 * }
 * ```
 */
export { AntigravityConfigSchema, SignatureCacheConfigSchema, ShieldConfigSchema, ShieldReplacementSchema, DEFAULT_CONFIG, DEFAULT_SHIELD_CONFIG, } from "./schema.js";
export { loadConfig, getUserConfigPath, getProjectConfigPath, getDefaultLogsDir, configExists, initRuntimeConfig, getKeepThinking, getShieldConfig, } from "./loader.js";
//# sourceMappingURL=index.js.map