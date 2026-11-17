/**
 * Remote Antigravity Hub version fetcher.
 *
 * Resolution strategy:
 *   1. Hub auto-updater manifest (electron-builder YAML, `version:` field)
 *   2. Hardcoded fallback in constants.ts
 *
 * Manifest versions below ANTIGRAVITY_MINIMUM_VERSION are rejected because
 * Cloud Code no longer serves newer models to those clients.
 *
 * Called once at plugin startup to ensure headers use the latest
 * supported version, avoiding "version no longer supported" errors.
 *
 * @see https://github.com/router-for-me/CLIProxyAPI (internal/misc/antigravity_version.go)
 */
export declare const ANTIGRAVITY_HUB_MANIFEST_URL = "https://antigravity-hub-auto-updater-974169037036.us-central1.run.app/manifest/latest-arm64-mac.yml";
/**
 * Returns true for plain `major.minor.patch` versions (no prefixes, suffixes, or pre-release tags).
 */
export declare function isStrictVersion(value: string): boolean;
/**
 * Compares two strict versions numerically. Returns a negative number, zero, or a positive number.
 */
export declare function compareVersions(a: string, b: string): number;
/**
 * Returns true when the version is strict and at least the Cloud Code minimum.
 */
export declare function isSupportedAntigravityVersion(version: string): boolean;
/**
 * Extracts the top-level `version:` value from an electron-builder update manifest.
 * Indented keys (for example inside `files:`) are ignored. Returns null when the
 * value is missing or not a strict `major.minor.patch` version.
 */
export declare function parseHubManifestVersion(text: string): string | null;
/**
 * Fetches the latest Hub version from the auto-updater manifest.
 * Returns null on network errors, non-OK responses, or unparseable manifests.
 */
export declare function fetchHubManifestVersion(url?: string): Promise<string | null>;
/**
 * Fetch the latest Antigravity version and update the global constant.
 * Safe to call before logger is initialized (will silently skip logging).
 */
export declare function initAntigravityVersion(): Promise<void>;
export declare const ANTIGRAVITY_VERSION_REFRESH_INTERVAL_MS: number;
/** Coalesce startup checks and refresh long-lived hosts every few hours. */
export declare function refreshAntigravityVersion(): Promise<void>;
//# sourceMappingURL=version.d.ts.map