import { afterEach, describe, expect, it } from "vitest"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { updateOpencodeConfig } from "./updater"

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function configFile(config: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "antigravity-v2-config-"))
  directories.push(directory)
  const path = join(directory, "opencode.json")
  writeFileSync(path, JSON.stringify(config))
  return path
}

describe("OpenCode V2 configuration", () => {
  it("writes plural plugin keys while retaining native provider settings", async () => {
    const configPath = configFile({
      plugins: ["other-plugin", { package: "opencode-antigravity-auth@beta", options: { enabled: true } }],
      providers: { google: { settings: { timeout: 42 }, models: { custom: { name: "Custom" } } }, custom: { name: "Keep me" } },
      model: "custom/default",
    })
    expect((await updateOpencodeConfig({ configPath, version: 2 })).success).toBe(true)
    const written = JSON.parse(readFileSync(configPath, "utf8"))
    expect(written.plugin).toBeUndefined()
    expect(written.plugins).toHaveLength(2)
    expect(written.plugins[1].options.enabled).toBe(true)
    expect(written.providers.google.settings).toEqual({ timeout: 42 })
    expect(written.providers.google.models.custom).toEqual({ name: "Custom" })
    expect(written.providers.custom).toEqual({ name: "Keep me" })
    expect(written.model).toBe("custom/default")
    expect(written.providers.google.models).toEqual({ custom: { name: "Custom" } })
  })

  it("migrates legacy plugin entries once and leaves unrelated legacy provider configuration intact", async () => {
    const configPath = configFile({ plugin: ["other-plugin", "opencode-antigravity-auth@latest"], provider: { custom: { npm: "custom-sdk" } } })
    for (let i = 0; i < 2; i++) expect((await updateOpencodeConfig({ configPath, version: 2 })).success).toBe(true)
    const written = JSON.parse(readFileSync(configPath, "utf8"))
    expect(written.plugins).toEqual(["other-plugin", "opencode-antigravity-auth@latest"])
    expect(written.plugin).toBeUndefined()
    expect(written.provider.custom).toEqual({ npm: "custom-sdk" })
    // Core migrates this provider without a competing native Google override.
    expect(written.providers).toBeUndefined()
  })

  it("converts option tuples and preserves ordered V2 enable and disable entries", async () => {
    const configPath = configFile({
      plugin: [["legacy-plugin", { strict: true }]],
      plugins: ["example", "-example", "example", "/local/opencode-antigravity-auth"],
    })
    expect((await updateOpencodeConfig({ configPath, version: 2 })).success).toBe(true)
    const written = JSON.parse(readFileSync(configPath, "utf8"))
    expect(written.plugins).toEqual([
      { package: "legacy-plugin", options: { strict: true } },
      "example", "-example", "example", "/local/opencode-antigravity-auth",
    ])
  })

  it("preserves both existing provider sections without changing model overrides", async () => {
    const legacy = { models: { custom: { modalities: { input: ["text"] }, variants: { max: { thinkingBudget: 1234 } } } } }
    const configPath = configFile({
      provider: { google: legacy },
      providers: { google: { models: { "antigravity-gemini-3-flash": { disabled: true, settings: { timeout: 123 }, limit: { output: 1024 } } } } },
    })
    expect((await updateOpencodeConfig({ configPath, version: 2 })).success).toBe(true)
    const written = JSON.parse(readFileSync(configPath, "utf8"))
    expect(written.provider.google).toEqual(legacy)
    expect(written.providers.google.models.custom).toBeUndefined()
    expect(written.providers.google.models["antigravity-gemini-3-flash"].disabled).toBe(true)
    expect(written.providers.google.models["antigravity-gemini-3-flash"].settings).toEqual({ timeout: 123 })
    expect(written.providers.google.models["antigravity-gemini-3-flash"].limit).toEqual({ output: 1024 })
  })

  it("recognizes a local package by its manifest and respects an explicit disable", async () => {
    const configPath = configFile({})
    const local = join(configPath, "..", "renamed-checkout")
    mkdirSync(local)
    writeFileSync(join(local, "package.json"), JSON.stringify({ name: "opencode-antigravity-auth" }))
    for (const entry of [local, "-opencode-antigravity-auth"]) {
      writeFileSync(configPath, JSON.stringify({ plugins: [entry] }))
      expect((await updateOpencodeConfig({ configPath, version: 2 })).success).toBe(true)
      expect(JSON.parse(readFileSync(configPath, "utf8")).plugins).toEqual([entry])
    }
  })
})
