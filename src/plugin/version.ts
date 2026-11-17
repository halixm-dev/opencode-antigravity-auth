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

import {
  ANTIGRAVITY_MINIMUM_VERSION,
  getAntigravityVersion,
  setAntigravityVersion,
} from "../constants";
import { createLogger } from "./logger";

export const ANTIGRAVITY_HUB_MANIFEST_URL =
  "https://antigravity-hub-auto-updater-974169037036.us-central1.run.app/manifest/latest-arm64-mac.yml";

const MANIFEST_HEADERS = {
  "User-Agent": "electron-builder",
  "Cache-Control": "no-cache",
} as const;
const FETCH_TIMEOUT_MS = 5000;
const MAX_MANIFEST_BYTES = 4096;
const STRICT_VERSION_REGEX = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;
const VERSION_KEY = "version:";

/**
 * Returns true for plain `major.minor.patch` versions (no prefixes, suffixes, or pre-release tags).
 */
export function isStrictVersion(value: string): boolean {
  return STRICT_VERSION_REGEX.test(value);
}

/**
 * Compares two strict versions numerically. Returns a negative number, zero, or a positive number.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Returns true when the version is strict and at least the Cloud Code minimum.
 */
export function isSupportedAntigravityVersion(version: string): boolean {
  return isStrictVersion(version) && compareVersions(version, ANTIGRAVITY_MINIMUM_VERSION) >= 0;
}

/**
 * Extracts the top-level `version:` value from an electron-builder update manifest.
 * Indented keys (for example inside `files:`) are ignored. Returns null when the
 * value is missing or not a strict `major.minor.patch` version.
 */
export function parseHubManifestVersion(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(VERSION_KEY)) continue;

    let value = line.slice(VERSION_KEY.length).trim();
    const commentIndex = value.search(/\s#/);
    if (commentIndex >= 0) {
      value = value.slice(0, commentIndex).trim();
    }
    const quote = value[0];
    if ((quote === "'" || quote === "\"") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    return isStrictVersion(value) ? value : null;
  }
  return null;
}

/**
 * Reads at most maxBytes of the body. A truncated read drops its trailing partial line.
 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) {
    return (await response.text()).slice(0, maxBytes);
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - received;
      if (value.byteLength > remaining) {
        text += decoder.decode(value.subarray(0, remaining));
        truncated = true;
        break;
      }
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }

  if (!truncated) {
    return text + decoder.decode();
  }
  const lastNewline = text.lastIndexOf("\n");
  return lastNewline >= 0 ? text.slice(0, lastNewline + 1) : "";
}

/**
 * Fetches the latest Hub version from the auto-updater manifest.
 * Returns null on network errors, non-OK responses, or unparseable manifests.
 */
export async function fetchHubManifestVersion(url = ANTIGRAVITY_HUB_MANIFEST_URL): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: MANIFEST_HEADERS,
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseHubManifestVersion(await readBoundedText(response, MAX_MANIFEST_BYTES));
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch the latest Antigravity version and update the global constant.
 * Safe to call before logger is initialized (will silently skip logging).
 */
export async function initAntigravityVersion(): Promise<void> {
  const log = createLogger("version");
  const fallback = getAntigravityVersion();

  const version = await fetchHubManifestVersion();
  if (!version) {
    setAntigravityVersion(fallback);
    log.info("version-fetch-failed", { fallback });
    return;
  }

  if (!isSupportedAntigravityVersion(version)) {
    setAntigravityVersion(fallback);
    log.warn("version-below-minimum", { version, minimum: ANTIGRAVITY_MINIMUM_VERSION, fallback });
    return;
  }

  if (version !== fallback) {
    log.info("version-updated", { version, source: "manifest", previous: fallback });
  } else {
    log.debug("version-unchanged", { version, source: "manifest" });
  }
  setAntigravityVersion(version);
}

export const ANTIGRAVITY_VERSION_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000;
let lastVersionCheck = 0;
let pendingVersionCheck: Promise<void> | undefined;

/** Coalesce startup checks and refresh long-lived hosts every few hours. */
export async function refreshAntigravityVersion(): Promise<void> {
  if (pendingVersionCheck) return pendingVersionCheck;
  if (lastVersionCheck && Date.now() - lastVersionCheck < ANTIGRAVITY_VERSION_REFRESH_INTERVAL_MS) return;
  pendingVersionCheck = initAntigravityVersion().finally(() => {
    lastVersionCheck = Date.now();
    pendingVersionCheck = undefined;
  });
  return pendingVersionCheck;
}
