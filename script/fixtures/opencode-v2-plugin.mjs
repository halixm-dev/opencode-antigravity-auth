import { appendFileSync, realpathSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// Only loaded by test-opencode-v2.mjs in an isolated config/data directory.
// The real OpenCode runtime, Google SDK, and plugin transport still execute.
export default {
  id: "antigravity.runtime-fixture",
  async setup(ctx) {
    const temporary = realpathSync(process.env.ANTIGRAVITY_FIXTURE_ROOT)
    if (realpathSync(join(dirname(fileURLToPath(import.meta.url)), "..")) !== temporary
      || process.env.XDG_DATA_HOME !== join(temporary, "data")
      || process.env.OPENCODE_CONFIG_DIR !== join(temporary, "config", "opencode")
      || process.env.ANTIGRAVITY_FIXTURE_LOG !== join(temporary, "requests.jsonl")) {
      throw new Error("Runtime fixture requires its isolated synthetic directories")
    }
    const mode = process.env.ANTIGRAVITY_FIXTURE_AUTH
    if (!["legacy", "pool", "v2"].includes(mode)) throw new Error("Runtime fixture requires an explicit synthetic auth mode")
    const methodID = mode === "legacy" ? "oauth" : "antigravity"
    const credentialID = "cred_antigravity_runtime_fixture"
    const refresh = "fixture-refresh-token|fixture-project|fixture-project"
    const { Database } = await import("bun:sqlite")
    // Core has already initialized/migrated this database before plugin setup.
    // Refuse to create a database or follow a path outside this fixture.
    const databasePath = join(temporary, "data", "opencode", "opencode.db")
    if (realpathSync(databasePath) !== databasePath) throw new Error("Runtime fixture database must be local")
    const database = new Database(databasePath, { readwrite: true, create: false })
    const originalFetch = globalThis.fetch
    const record = (value) => appendFileSync(process.env.ANTIGRAVITY_FIXTURE_LOG, `${JSON.stringify(value)}\n`)
    record({ kind: "fixture-setup" })
    const credentialProof = async (kind) => {
      const rows = database.query("SELECT id, integration_id, value, method_id, active FROM credential").all()
      if (rows.length !== (mode === "pool" ? 0 : 1)) throw new Error("Unexpected synthetic credential count")
      const row = rows[0]
      const stored = row ? JSON.parse(row.value) : undefined
      // Inspect persistence before resolve(), which can itself refresh OAuth.
      // An assertion must not supply the registered refresh being tested.
      if (kind === "credential-effective" && mode === "v2"
        && (stored.access !== "fixture-access-token" || stored.expires <= Date.now())) {
        throw new Error("Registered Antigravity OAuth method did not persist its refreshed credential")
      }
      const connection = await ctx.integration.connection.active("google")
      const value = connection ? await ctx.integration.connection.resolve(connection) : undefined
      if (mode === "pool") {
        if (connection || value) throw new Error("Account pool case unexpectedly has a V2 Google connection")
      } else {
        if (row.id !== credentialID || row.integration_id !== "google" || row.active !== 1 || row.method_id !== methodID
          || stored.type !== "oauth" || stored.methodID !== methodID || stored.refresh !== refresh
          || connection?.type !== "credential" || connection.id !== credentialID
          || value?.type !== "oauth" || value.methodID !== methodID || value.refresh !== refresh
          || !["expired-fixture-access", "fixture-access-token"].includes(value.access)) {
          throw new Error("V2 did not resolve the expected active synthetic OAuth credential")
        }
        if (kind === "credential-seeded" && (stored.expires !== 0 || stored.access !== "expired-fixture-access")) {
          throw new Error("Synthetic credential must start expired in every CLI case")
        }
      }
      // Only the credential's shape is recorded; no tokens or external values.
      record({ kind, mode, credentialCount: rows.length, methodID: value?.methodID ?? null, type: value?.type ?? null,
        connectionType: connection?.type ?? null, active: Boolean(row?.active), expired: (value?.expires ?? Infinity) <= Date.now(), synthetic: true })
    }
    let provedEffective = false
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
      if (url.hostname.includes("antigravity") && url.hostname.endsWith("run.app")) {
        return new Response("version: 2.24.0\n", { headers: { "content-type": "text/yaml" } })
      }
      if (url.hostname === "oauth2.googleapis.com") {
        const request = new Request(input, init)
        const form = new URLSearchParams(await request.text())
        if (form.get("grant_type") !== "refresh_token" || form.get("refresh_token") !== "fixture-refresh-token") {
          throw new Error("OAuth fixture received a non-synthetic refresh request")
        }
        record({ kind: "oauth-refresh", mode, synthetic: true })
        return Response.json({ access_token: "fixture-access-token", expires_in: 3600 })
      }
      if (!url.hostname.endsWith("googleapis.com")) return originalFetch(input, init)
      const request = new Request(input, init)
      const body = JSON.parse(await request.text())
      if (url.pathname.endsWith(":loadCodeAssist")) {
        return Response.json({ cloudaicompanionProject: "fixture-project", currentTier: { id: "standard-tier" } })
      }
      if (url.pathname.endsWith(":fetchAvailableModels")) return Response.json({ models: {} })
      if (url.pathname.endsWith(":retrieveUserQuota")) return Response.json({ buckets: [] })
      if (!url.pathname.endsWith(":streamGenerateContent")) throw new Error(`Unexpected Google request: ${url.pathname}`)
      if (!provedEffective) {
        await credentialProof("credential-effective")
        provedEffective = true
      }
      if (url.hostname !== "daily-cloudcode-pa.googleapis.com") throw new Error(`Wrong Antigravity endpoint: ${url.hostname}`)
      if (request.headers.has("x-goog-api-key")) throw new Error("OAuth request leaked the SDK API key sentinel")
      if (request.headers.get("authorization") !== "Bearer fixture-access-token") throw new Error("OAuth bearer token missing")
      if (!request.headers.get("user-agent")?.startsWith("antigravity/hub/")) throw new Error("Current Hub identity missing")
      const content = JSON.stringify(body.request?.contents ?? [])
      const toolRequested = content.includes("fixture-tool")
      const toolReturned = content.includes("functionResponse")
      const toolNames = (body.request?.tools ?? []).flatMap((tool) => (tool.functionDeclarations ?? []).map((declaration) => declaration.name))
      const toolName = toolNames.find((name) => name.endsWith("fixture_echo"))
      if (toolRequested && !toolReturned && !toolName) throw new Error("Fixture tool was not exposed to the model")
      const parts = toolRequested && !toolReturned
        ? [{ functionCall: { name: toolName, args: { value: "tool-round-trip" }, id: "fixture-call-1" } }]
        : [{ text: toolRequested ? "TOOL_ROUND_TRIP_OK" : "PLUGIN_V2_OK" }]
      record({ kind: "request", model: body.model, generationConfig: body.request?.generationConfig, toolRequested, toolReturned, toolNames })
      const payload = {
        response: {
          candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
      }
      return new Response(`data: ${JSON.stringify(payload)}\n\n`, { headers: { "content-type": "text/event-stream" } })
    }
    if (mode !== "pool") {
      const now = Date.now()
      const value = { type: "oauth", methodID, refresh, access: "expired-fixture-access", expires: 0 }
      // Reset expiry for every process, including subsequent tool cases. The
      // legacy mode matches V1 migration's methodID rather than our V2 method.
      database.query(`INSERT INTO credential (id, integration_id, label, value, connector_id, method_id, active, time_created, time_updated)
        VALUES (?, 'google', 'Synthetic Antigravity runtime fixture', ?, NULL, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = excluded.value, method_id = excluded.method_id, active = 1, time_updated = excluded.time_updated`)
        .run(credentialID, JSON.stringify(value), methodID, now, now)
    }
    await ctx.integration.reload()
    await credentialProof("credential-seeded")
    await ctx.tool.transform((editor) => editor.add({
      name: "fixture_echo",
      options: { codemode: false },
      description: "Runtime test tool that returns its value.",
      input: { type: "object", properties: { value: { type: "string" } }, required: ["value"], additionalProperties: false },
      async execute(input) {
        record({ kind: "tool", value: input.value })
        return { content: `fixture-tool-result:${input.value}` }
      },
    }))
    return () => { globalThis.fetch = originalFetch; database.close() }
  },
}
