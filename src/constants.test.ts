import { describe, it, expect } from "vitest"
import {
  ANTIGRAVITY_ENDPOINT,
  ANTIGRAVITY_ENDPOINT_PROD,
  ANTIGRAVITY_HUB_CHANGELISTS,
  ANTIGRAVITY_MINIMUM_VERSION,
  ANTIGRAVITY_VERSION_FALLBACK,
  GEMINI_CLI_ENDPOINT,
  GEMINI_CLI_HEADERS,
  getAntigravityHeaders,
  getAntigravityOnboardUserAgent,
  getAntigravityUserAgent,
  getEndpointFallbacks,
  getRandomizedHeaders,
  type HeaderSet,
} from "./constants.ts"

const HUB_USER_AGENT_REGEX = /^antigravity\/hub\/\d+\.\d+\.\d+ \(aidev_client; os_type=darwin; arch=arm64(; cl=\d+)?\)$/

describe("GEMINI_CLI_HEADERS", () => {
  it("matches Code Assist headers from opencode-gemini-auth", () => {
    expect(GEMINI_CLI_HEADERS).toEqual({
      "User-Agent": "google-api-nodejs-client/9.15.1",
      "X-Goog-Api-Client": "gl-node/22.17.0",
      "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
    })
  })
})

describe("getRandomizedHeaders", () => {
  describe("gemini-cli style", () => {
    it("returns static Code Assist headers", () => {
      const headers = getRandomizedHeaders("gemini-cli", "gemini-2.5-pro")
      expect(headers).toEqual({
        "User-Agent": "google-api-nodejs-client/9.15.1",
        "X-Goog-Api-Client": "gl-node/22.17.0",
        "Client-Metadata": "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI",
      })
    })

    it("ignores requested model and keeps static User-Agent", () => {
      const headers = getRandomizedHeaders("gemini-cli", "gemini-3-pro-preview")
      expect(headers["User-Agent"]).toBe("google-api-nodejs-client/9.15.1")
    })
  })

  describe("antigravity style", () => {
    it("returns only the Hub User-Agent (no X-Goog-Api-Client or Client-Metadata)", () => {
      const headers = getRandomizedHeaders("antigravity")
      expect(headers).toEqual({ "User-Agent": getAntigravityUserAgent() })
      expect(headers["X-Goog-Api-Client"]).toBeUndefined()
      expect(headers["Client-Metadata"]).toBeUndefined()
    })

    it("returns User-Agent in Antigravity Hub format", () => {
      const headers = getRandomizedHeaders("antigravity")
      expect(headers["User-Agent"]).toMatch(HUB_USER_AGENT_REGEX)
    })

    it("does not randomize the Hub User-Agent", () => {
      const first = getRandomizedHeaders("antigravity")["User-Agent"]
      for (let i = 0; i < 20; i++) {
        expect(getRandomizedHeaders("antigravity")["User-Agent"]).toBe(first)
      }
    })

    it("never produces a linux User-Agent", () => {
      for (let i = 0; i < 50; i++) {
        const headers = getRandomizedHeaders("antigravity")
        expect(headers["User-Agent"]).not.toMatch(/linux\//)
      }
    })
  })
})

describe("HeaderSet type", () => {
  it("allows omitting X-Goog-Api-Client and Client-Metadata", () => {
    const headers: HeaderSet = {
      "User-Agent": "test",
    }
    expect(headers["User-Agent"]).toBe("test")
    expect(headers["X-Goog-Api-Client"]).toBeUndefined()
    expect(headers["Client-Metadata"]).toBeUndefined()
  })

  it("allows including all three headers", () => {
    const headers: HeaderSet = {
      "User-Agent": "test",
      "X-Goog-Api-Client": "test-client",
      "Client-Metadata": "test-metadata",
    }
    expect(headers["User-Agent"]).toBe("test")
    expect(headers["X-Goog-Api-Client"]).toBe("test-client")
    expect(headers["Client-Metadata"]).toBe("test-metadata")
  })
})

describe("Antigravity Hub User-Agent", () => {
  it("includes the verified changelist for known releases", () => {
    expect(getAntigravityUserAgent("2.23.0")).toBe(
      "antigravity/hub/2.23.0 (aidev_client; os_type=darwin; arch=arm64; cl=998057262)",
    )
    expect(getAntigravityUserAgent("2.24.0")).toBe(
      "antigravity/hub/2.24.0 (aidev_client; os_type=darwin; arch=arm64; cl=1000335682)",
    )
  })

  it("omits cl= for releases without a known changelist", () => {
    expect(getAntigravityUserAgent("2.25.0")).toBe(
      "antigravity/hub/2.25.0 (aidev_client; os_type=darwin; arch=arm64)",
    )
  })

  it("defaults to the runtime version", () => {
    expect(getAntigravityUserAgent()).toBe(getAntigravityUserAgent(ANTIGRAVITY_VERSION_FALLBACK))
  })

  it("appends the node API client for onboardUser requests", () => {
    expect(getAntigravityOnboardUserAgent("2.24.0")).toBe(
      "antigravity/hub/2.24.0 (aidev_client; os_type=darwin; arch=arm64; cl=1000335682) google-api-nodejs-client/10.3.0",
    )
  })

  it("keeps the fallback at or above the Cloud Code minimum with a matching changelist", () => {
    const [major = 0, minor = 0] = ANTIGRAVITY_VERSION_FALLBACK.split(".").map(Number)
    const [minMajor = 0, minMinor = 0] = ANTIGRAVITY_MINIMUM_VERSION.split(".").map(Number)
    expect(major > minMajor || (major === minMajor && minor >= minMinor)).toBe(true)
    expect(ANTIGRAVITY_HUB_CHANGELISTS[ANTIGRAVITY_VERSION_FALLBACK]).toMatch(/^\d+$/)
  })

  it("getAntigravityHeaders sends no Client-Metadata or X-Goog-Api-Client", () => {
    expect(getAntigravityHeaders()).toEqual({ "User-Agent": getAntigravityUserAgent() })
  })
})

describe("endpoints", () => {
  it("uses the non-sandbox daily host for Antigravity", () => {
    expect(ANTIGRAVITY_ENDPOINT).toBe("https://daily-cloudcode-pa.googleapis.com")
  })

  it("keeps Gemini CLI on production", () => {
    expect(GEMINI_CLI_ENDPOINT).toBe("https://cloudcode-pa.googleapis.com")
    expect(ANTIGRAVITY_ENDPOINT_PROD).toBe("https://cloudcode-pa.googleapis.com")
  })

  it("getEndpointFallbacks never mixes hosts across header styles", () => {
    expect(getEndpointFallbacks("antigravity")).toEqual(["https://daily-cloudcode-pa.googleapis.com"])
    expect(getEndpointFallbacks("gemini-cli")).toEqual(["https://cloudcode-pa.googleapis.com"])
  })

  it("never routes either style to a sandbox host", () => {
    for (const style of ["antigravity", "gemini-cli"] as const) {
      for (const endpoint of getEndpointFallbacks(style)) {
        expect(endpoint).not.toContain("sandbox")
      }
    }
  })
})
