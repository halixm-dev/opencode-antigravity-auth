import { describe, it, expect } from "vitest"
import { getAntigravityUserAgent } from "../constants.ts"
import {
  buildFingerprintHeaders,
  collectCurrentFingerprint,
  generateFingerprint,
  updateFingerprintVersion,
  type Fingerprint,
} from "./fingerprint.ts"

function storedFingerprint(userAgent: string): Fingerprint {
  return {
    deviceId: "device-1",
    sessionToken: "session-1",
    userAgent,
    apiClient: "google-cloud-sdk vscode/1.96.0",
    clientMetadata: { ideType: "ANTIGRAVITY", platform: "WINDOWS", pluginType: "GEMINI" },
    createdAt: 0,
  }
}

describe("generateFingerprint", () => {
  it("uses the current Hub User-Agent", () => {
    expect(generateFingerprint().userAgent).toBe(getAntigravityUserAgent())
    expect(collectCurrentFingerprint().userAgent).toBe(getAntigravityUserAgent())
  })

  it("still generates a unique device identity per fingerprint", () => {
    const first = generateFingerprint()
    const second = generateFingerprint()
    expect(first.deviceId).not.toBe(second.deviceId)
    expect(first.sessionToken).not.toBe(second.sessionToken)
  })
})

describe("updateFingerprintVersion", () => {
  it("migrates a legacy antigravity/<version> agent to the Hub agent", () => {
    const fingerprint = storedFingerprint("antigravity/1.18.3 windows/amd64")
    expect(updateFingerprintVersion(fingerprint)).toBe(true)
    expect(fingerprint.userAgent).toBe(getAntigravityUserAgent())
    expect(updateFingerprintVersion(fingerprint)).toBe(false)
  })

  it("migrates an older Hub release and Electron-style agents", () => {
    const olderHub = storedFingerprint("antigravity/hub/2.23.0 (aidev_client; os_type=darwin; arch=arm64; cl=998057262)")
    expect(updateFingerprintVersion(olderHub)).toBe(true)
    expect(olderHub.userAgent).toBe(getAntigravityUserAgent())

    const electron = storedFingerprint("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Antigravity/1.18.3 Electron/37.3.1")
    expect(updateFingerprintVersion(electron)).toBe(true)
    expect(electron.userAgent).toBe(getAntigravityUserAgent())
  })
})

describe("buildFingerprintHeaders", () => {
  it("returns no headers without a fingerprint", () => {
    expect(buildFingerprintHeaders(null)).toEqual({})
  })

  it("sends the current Hub agent instead of a stale stored agent", () => {
    const headers = buildFingerprintHeaders(storedFingerprint("antigravity/1.18.3 darwin/arm64"))
    expect(headers).toEqual({ "User-Agent": getAntigravityUserAgent() })
  })
})
