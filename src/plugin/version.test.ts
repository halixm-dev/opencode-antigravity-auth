import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Regression tests for the version fallback mechanism.
 *
 * Issue #468: On WSL2/AlmaLinux with strict firewall rules, the version
 * fetch fails. The plugin then uses the hardcoded fallback version in
 * User-Agent headers. If the fallback is too old, the backend rejects
 * requests for newer models with "not available on this version"
 * (Cloud Code requires Antigravity Hub 2.23.0 or newer).
 *
 * These tests verify the fallback is current and that the
 * network-failure path correctly uses it.
 */

// Reset module state between tests so versionLocked starts fresh
beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("ANTIGRAVITY_VERSION_FALLBACK", () => {
  it("defaults to the exported fallback constant", async () => {
    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityVersion } = await import("../constants.ts")
    expect(getAntigravityVersion()).toBe(ANTIGRAVITY_VERSION_FALLBACK)
  })

  it("is at least the 2.23.0 Cloud Code minimum", async () => {
    const { getAntigravityVersion, ANTIGRAVITY_MINIMUM_VERSION } = await import("../constants.ts")
    const { isSupportedAntigravityVersion } = await import("./version.ts")
    expect(ANTIGRAVITY_MINIMUM_VERSION).toBe("2.23.0")
    expect(isSupportedAntigravityVersion(getAntigravityVersion())).toBe(true)
  })

  it("is 2.24.0 with its verified build changelist", async () => {
    const { ANTIGRAVITY_VERSION_FALLBACK, ANTIGRAVITY_HUB_CHANGELISTS } = await import("../constants.ts")
    expect(ANTIGRAVITY_VERSION_FALLBACK).toBe("2.24.0")
    expect(ANTIGRAVITY_HUB_CHANGELISTS[ANTIGRAVITY_VERSION_FALLBACK]).toBe("1000335682")
  })
})

describe("setAntigravityVersion", () => {
  it("updates the version on first call", async () => {
    const { getAntigravityVersion, setAntigravityVersion } = await import("../constants.ts")
    setAntigravityVersion("2.0.0")
    expect(getAntigravityVersion()).toBe("2.0.0")
  })

  it("locks after first call — subsequent calls are ignored", async () => {
    const { getAntigravityVersion, setAntigravityVersion } = await import("../constants.ts")
    setAntigravityVersion("2.0.0")
    setAntigravityVersion("3.0.0")
    expect(getAntigravityVersion()).toBe("2.0.0")
  })
})

describe("initAntigravityVersion — network failure path", () => {
  it("falls back to hardcoded version when the manifest fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unreachable")))

    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityVersion } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    expect(getAntigravityVersion()).toBe(ANTIGRAVITY_VERSION_FALLBACK)
  })

  it("falls back to hardcoded version when the manifest returns non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "" }),
    )

    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityVersion } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    expect(getAntigravityVersion()).toBe(ANTIGRAVITY_VERSION_FALLBACK)
  })

  it("uses the Hub manifest version when the auto-updater responds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "version: 2.25.0\nfiles:\n  - url: Antigravity-2.25.0-arm64-mac.zip\npath: Antigravity-arm64-mac.zip\n",
    })
    vi.stubGlobal("fetch", fetchMock)

    const { getAntigravityVersion } = await import("../constants.ts")
    const { initAntigravityVersion, ANTIGRAVITY_HUB_MANIFEST_URL } = await import("./version.ts")
    await initAntigravityVersion()

    expect(getAntigravityVersion()).toBe("2.25.0")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe(ANTIGRAVITY_HUB_MANIFEST_URL)
    expect(ANTIGRAVITY_HUB_MANIFEST_URL).toBe(
      "https://antigravity-hub-auto-updater-974169037036.us-central1.run.app/manifest/latest-arm64-mac.yml",
    )
    expect(init.headers).toEqual({ "User-Agent": "electron-builder", "Cache-Control": "no-cache" })
  })

  it("rejects manifest versions below the 2.23.0 minimum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "version: 2.22.9\n" }),
    )

    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityVersion } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    expect(getAntigravityVersion()).toBe(ANTIGRAVITY_VERSION_FALLBACK)
  })

  it("ignores the legacy updater text format", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "Auto updater is running. Fixed Version: 2.30.0" }),
    )

    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityVersion } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    expect(getAntigravityVersion()).toBe(ANTIGRAVITY_VERSION_FALLBACK)
  })

  it("fallback version appears in User-Agent header", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

    const { ANTIGRAVITY_VERSION_FALLBACK, getAntigravityHeaders } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    const headers = getAntigravityHeaders()
    expect(headers["User-Agent"]).toBe(
      `antigravity/hub/${ANTIGRAVITY_VERSION_FALLBACK} (aidev_client; os_type=darwin; arch=arm64; cl=1000335682)`,
    )
  })

  it("fallback version appears in randomized antigravity headers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")))

    const { ANTIGRAVITY_VERSION_FALLBACK, getRandomizedHeaders } = await import("../constants.ts")
    const { initAntigravityVersion } = await import("./version.ts")
    await initAntigravityVersion()

    const headers = getRandomizedHeaders("antigravity")
    expect(headers["User-Agent"]).toContain(ANTIGRAVITY_VERSION_FALLBACK)
  })
})

describe("parseHubManifestVersion", () => {
  it("reads plain, quoted, and commented top-level versions", async () => {
    const { parseHubManifestVersion } = await import("./version.ts")
    expect(parseHubManifestVersion("version: 2.24.0\npath: a.zip\n")).toBe("2.24.0")
    expect(parseHubManifestVersion("version: '2.24.1'\n")).toBe("2.24.1")
    expect(parseHubManifestVersion('version: "2.24.2"\r\n')).toBe("2.24.2")
    expect(parseHubManifestVersion("version: 2.24.3 # latest\n")).toBe("2.24.3")
  })

  it("ignores indented keys and requires strict major.minor.patch", async () => {
    const { parseHubManifestVersion } = await import("./version.ts")
    expect(parseHubManifestVersion("files:\n  version: 2.24.0\n")).toBeNull()
    expect(parseHubManifestVersion("version: 2.24.0-beta.1\n")).toBeNull()
    expect(parseHubManifestVersion("version: v2.24.0\n")).toBeNull()
    expect(parseHubManifestVersion("version: 2.24\n")).toBeNull()
    expect(parseHubManifestVersion("version: 2.24.0\r\nX-Injected: 1\n")).toBe("2.24.0")
    expect(parseHubManifestVersion("")).toBeNull()
  })
})

describe("fetchHubManifestVersion — bounded read", () => {
  it("parses the version from a streamed manifest", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("version: 2.26.0\nsha512: abc\n")))
    const { fetchHubManifestVersion } = await import("./version.ts")
    expect(await fetchHubManifestVersion()).toBe("2.26.0")
  })

  it("does not read past 4 KiB of the manifest", async () => {
    const padding = `${"# padding\n".repeat(500)}`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`${padding}version: 2.26.0\n`)))
    const { fetchHubManifestVersion } = await import("./version.ts")
    expect(await fetchHubManifestVersion()).toBeNull()
  })

  it("keeps an early version line when the manifest is oversized", async () => {
    const body = `version: 2.26.0\n${"x".repeat(10_000)}`
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)))
    const { fetchHubManifestVersion } = await import("./version.ts")
    expect(await fetchHubManifestVersion()).toBe("2.26.0")
  })
})


describe("long-lived Hub version checks", () => {
  it("coalesces startup requests and checks again after the refresh interval", async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockImplementation(async () => new Response("version: 2.24.0\n"))
    vi.stubGlobal("fetch", fetch)
    try {
      const { refreshAntigravityVersion, ANTIGRAVITY_VERSION_REFRESH_INTERVAL_MS } = await import("./version.ts")
      await Promise.all([refreshAntigravityVersion(), refreshAntigravityVersion()])
      expect(fetch).toHaveBeenCalledOnce()
      vi.setSystemTime(Date.now() + ANTIGRAVITY_VERSION_REFRESH_INTERVAL_MS)
      await refreshAntigravityVersion()
      expect(fetch).toHaveBeenCalledTimes(2)
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})
