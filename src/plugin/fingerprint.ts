/**
 * Device Fingerprint Generator for Rate Limit Mitigation
 *
 * Ported from antigravity-claude-proxy PR #170
 * https://github.com/badrisnarayanan/antigravity-claude-proxy/pull/170
 *
 * Generates randomized device fingerprints to help distribute API usage
 * across different apparent device identities.
 */

import * as crypto from "node:crypto";
import * as os from "node:os";
import { getAntigravityUserAgent } from "../constants";

const SDK_CLIENTS = [
  "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "google-cloud-sdk vscode/1.86.0",
  "google-cloud-sdk vscode/1.87.0",
  "google-cloud-sdk vscode/1.96.0",
];

/** Matches the Hub User-Agent, which always reports the darwin/arm64 manifest build. */
const HUB_METADATA_PLATFORM = "MACOS";

export interface ClientMetadata {
  ideType: string;
  platform: string;
  pluginType: string;
}

export interface Fingerprint {
  deviceId: string;
  sessionToken: string;
  userAgent: string;
  apiClient: string;
  clientMetadata: ClientMetadata;
  createdAt: number;
  /** @deprecated Kept for backward compat with stored fingerprints */
  quotaUser?: string;
}

/**
 * Fingerprint version for history tracking.
 * Stores a snapshot of a fingerprint with metadata about when/why it was saved.
 */
export interface FingerprintVersion {
  fingerprint: Fingerprint;
  timestamp: number;
  reason: 'initial' | 'regenerated' | 'restored';
}

/** Maximum number of fingerprint versions to keep per account */
export const MAX_FINGERPRINT_HISTORY = 5;

export interface FingerprintHeaders {
  "User-Agent": string;
}

function randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function platformToDisplayName(platform: string): "WINDOWS" | "MACOS" {
  return platform === "win32" ? "WINDOWS" : "MACOS";
}

function generateDeviceId(): string {
  return crypto.randomUUID();
}

function generateSessionToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Generate a randomized device fingerprint.
 * Each fingerprint represents a unique "device" identity. The userAgent is the
 * shared Hub User-Agent because Cloud Code ties it to the release and build CL.
 */
export function generateFingerprint(): Fingerprint {
  return {
    deviceId: generateDeviceId(),
    sessionToken: generateSessionToken(),
    userAgent: getAntigravityUserAgent(),
    apiClient: randomFrom(SDK_CLIENTS),
    clientMetadata: {
      ideType: "ANTIGRAVITY",
      platform: HUB_METADATA_PLATFORM,
      pluginType: "GEMINI",
    },
    createdAt: Date.now(),
  };
}

/**
 * Collect fingerprint based on actual current system.
 * Uses real OS info for stored metadata; the userAgent is still the Hub User-Agent.
 */
export function collectCurrentFingerprint(): Fingerprint {
  return {
    deviceId: generateDeviceId(),
    sessionToken: generateSessionToken(),
    userAgent: getAntigravityUserAgent(),
    apiClient: "google-cloud-sdk vscode_cloudshelleditor/0.1",
    clientMetadata: {
      ideType: "ANTIGRAVITY",
      platform: platformToDisplayName(os.platform()),
      pluginType: "GEMINI",
    },
    createdAt: Date.now(),
  };
}

/**
 * Migrate a fingerprint's userAgent to the current Hub User-Agent.
 * Saved fingerprints may carry a legacy `antigravity/<version> <os>/<arch>` agent or
 * an older Hub release. Requests never send the stored value; this keeps storage in sync.
 * Returns true if the userAgent was changed.
 */
export function updateFingerprintVersion(fingerprint: Fingerprint): boolean {
  const currentUserAgent = getAntigravityUserAgent();
  if (fingerprint.userAgent === currentUserAgent) {
    return false;
  }

  fingerprint.userAgent = currentUserAgent;
  return true;
}

/**
 * Build HTTP headers from a fingerprint object.
 * The User-Agent is resolved at call time from the current Hub version, so a stale
 * stored fingerprint userAgent is never sent.
 */
export function buildFingerprintHeaders(fingerprint: Fingerprint | null): Partial<FingerprintHeaders> {
  if (!fingerprint) {
    return {};
  }

  return {
    "User-Agent": getAntigravityUserAgent(),
  };
}

/**
 * Session-level fingerprint instance.
 * Generated once at module load, persists for the lifetime of the process.
 */
let sessionFingerprint: Fingerprint | null = null;

/**
 * Get or create the session fingerprint.
 * Returns the same fingerprint for all calls within a session.
 */
export function getSessionFingerprint(): Fingerprint {
  if (!sessionFingerprint) {
    sessionFingerprint = generateFingerprint();
  }
  return sessionFingerprint;
}

/**
 * Regenerate the session fingerprint.
 * Call this to get a fresh identity (e.g., after rate limiting).
 */
export function regenerateSessionFingerprint(): Fingerprint {
  sessionFingerprint = generateFingerprint();
  return sessionFingerprint;
}
