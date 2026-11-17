import { afterEach, describe, expect, it, vi } from "vitest"
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_SCOPES,
  getAntigravityUserAgent,
} from "../constants.ts"
import { authorizeAntigravity, exchangeAntigravity } from "./oauth.ts"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function encodeState(projectId: string): string {
  return Buffer.from(JSON.stringify({ verifier: "verifier-1", projectId }), "utf8").toString("base64url")
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("authorizeAntigravity", () => {
  it("keeps the Antigravity OAuth client, scopes, and redirect", async () => {
    const { url } = await authorizeAntigravity("")
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth")
    expect(parsed.searchParams.get("client_id")).toBe(ANTIGRAVITY_CLIENT_ID)
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:51121/oauth-callback")
    expect(parsed.searchParams.get("scope")).toBe(ANTIGRAVITY_SCOPES.join(" "))
  })
})

describe("exchangeAntigravity project lookup", () => {
  it("loads the project from the daily host with ideType-only metadata", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input)
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "access-1", expires_in: 3600, refresh_token: "refresh-1" })
      }
      if (url.startsWith("https://www.googleapis.com/oauth2/v1/userinfo")) {
        return jsonResponse({ email: "user@example.com" })
      }
      if (url.endsWith("/v1internal:loadCodeAssist")) {
        return jsonResponse({ cloudaicompanionProject: "project-1" })
      }
      return jsonResponse({ error: "unexpected" }, 404)
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await exchangeAntigravity("auth-code", encodeState(""))

    expect(result).toMatchObject({
      type: "success",
      refresh: "refresh-1|project-1",
      projectId: "project-1",
      email: "user@example.com",
    })
    const loadCalls = fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/v1internal:loadCodeAssist"))
    expect(loadCalls).toHaveLength(1)
    const [input, init] = loadCalls[0]!
    expect(String(input)).toBe("https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist")
    expect(JSON.parse(String(init?.body))).toEqual({ metadata: { ideType: "ANTIGRAVITY" } })
    expect(init?.headers).toEqual({
      Authorization: "Bearer access-1",
      "Content-Type": "application/json",
      "User-Agent": getAntigravityUserAgent(),
    })
  })

  it("skips the lookup when the state already carries a project", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === "https://oauth2.googleapis.com/token") {
        return jsonResponse({ access_token: "access-2", expires_in: 3600, refresh_token: "refresh-2" })
      }
      return jsonResponse({})
    })
    vi.stubGlobal("fetch", fetchMock)

    const result = await exchangeAntigravity("auth-code", encodeState("my-project"))

    expect(result).toMatchObject({ type: "success", refresh: "refresh-2|my-project", projectId: "my-project" })
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("loadCodeAssist"))).toBe(false)
  })
})
