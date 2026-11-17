import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Run after npm ci. Build, install, cache, logs, and synthetic runtime state all
// live outside the checkout; the installed consumer cannot resolve source files.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const temporary = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), "antigravity-package-"))
const stage = join(temporary, "build")
const consumer = join(temporary, "consumer")
const cli = join(temporary, "cli")
const require = createRequire(import.meta.url)
const env = {
  ...process.env,
  TMPDIR: temporary,
  XDG_CONFIG_HOME: join(temporary, "config"),
  XDG_DATA_HOME: join(temporary, "data"),
  XDG_CACHE_HOME: join(temporary, "cache"),
  XDG_STATE_HOME: join(temporary, "state"),
  OPENCODE_CONFIG_DIR: join(temporary, "config", "opencode"),
  npm_config_cache: join(temporary, "npm-cache"),
  npm_config_update_notifier: "false",
}

function run(command, args, cwd = temporary, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...env, ...extraEnv },
    encoding: "utf8",
    timeout: 5 * 60_000,
    maxBuffer: 10 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.signal}):\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`)
  }
  return result.stdout
}

try {
  mkdirSync(stage)
  mkdirSync(consumer)
  mkdirSync(cli)
  for (const entry of ["src", "script", "index.ts", "index.js", "tui.js", "package.json", "tsconfig.json", "tsconfig.build.json", "README.md", "LICENSE"]) {
    cpSync(join(root, entry), join(stage, entry), { recursive: true })
  }
  symlinkSync(realpathSync(join(root, "node_modules")), join(stage, "node_modules"), "dir")
  console.log(run("npm", ["run", "build"], stage).trim())

  const [packed] = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary], stage))
  const files = new Set(packed.files.map((file) => file.path))
  for (const entry of ["index.js", "tui.js", "dist/src/tui.js", "dist/index.js", "dist/index.d.ts"]) {
    assert(files.has(entry), `npm archive is missing ${entry}`)
  }
  assert(![...files].some((file) => file.startsWith("node_modules/") || file.startsWith("src/")), "npm archive contains development files")
  console.log(`PASS npm archive: ${packed.filename} (${packed.entryCount} files)`)

  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "antigravity-package-consumer", private: true, type: "module" }))
  const nodeTypesVersion = require("@types/node/package.json").version
  console.log(run("npm", ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", join(temporary, packed.filename), `@types/node@${nodeTypesVersion}`], consumer).trim())
  const installed = join(consumer, "node_modules", packed.name)
  const manifest = JSON.parse(readFileSync(join(installed, "package.json"), "utf8"))
  assert(!manifest.peerDependencies?.typescript, "Published plugin must not require consumers to install TypeScript")
  assert(!existsSync(join(consumer, "node_modules", "typescript")), "Runtime consumer unexpectedly installed TypeScript")

  writeFileSync(join(consumer, "runtime.mjs"), `
import assert from "node:assert/strict"
import plugin, { AntigravityCLIOAuthPlugin, GoogleOAuthPlugin } from ${JSON.stringify(packed.name)}
import directoryPlugin from "./node_modules/${packed.name}/index.js"
import tui from "${packed.name}/tui"
assert.equal(typeof tui.setup, "function")
assert.equal(typeof plugin.setup, "function")
assert.equal(typeof plugin.server, "function")
assert.equal(plugin.server, AntigravityCLIOAuthPlugin)
assert.equal(typeof GoogleOAuthPlugin, "function")
assert.equal(directoryPlugin, plugin)
console.log("PASS Node ESM import: default.setup, default.server, legacy exports, and root loader shim")
`)
  console.log(run(process.execPath, ["runtime.mjs"], consumer).trim())

  writeFileSync(join(consumer, "consumer.mts"), `
import plugin, { AntigravityCLIOAuthPlugin } from ${JSON.stringify(packed.name)}
import type { Plugin } from "@opencode/plugin"
type Assert<T extends true> = T
type IsAny<T> = 0 extends (1 & T) ? true : false
type SetupContextIsTyped = Assert<IsAny<Parameters<typeof plugin.setup>[0]> extends false ? true : false>
type ServerContextIsTyped = Assert<IsAny<Parameters<typeof plugin.server>[0]> extends false ? true : false>
type ServerResultIsTyped = Assert<IsAny<Awaited<ReturnType<typeof plugin.server>>> extends false ? true : false>
const setup: Plugin.Plugin["setup"] = plugin.setup
const server: typeof AntigravityCLIOAuthPlugin = plugin.server
void setup
void server
`)
  writeFileSync(join(consumer, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: ["node"],
    },
    files: ["consumer.mts"],
  }))
  // Release the compiler's memory before starting the CLI runtime cases.
  const declarationCheck = join(temporary, "check-declarations.cjs")
  const declarations = packed.files.filter((file) => file.path.endsWith(".d.ts")).map((file) => join(installed, file.path))
  writeFileSync(declarationCheck, `
const ts = require(${JSON.stringify(require.resolve("typescript"))})
const { join } = require("node:path")
const consumer = ${JSON.stringify(consumer)}
const declarations = ${JSON.stringify(declarations)}
const config = ts.readConfigFile(join(consumer, "tsconfig.json"), ts.sys.readFile)
if (config.error) throw new Error("Consumer tsconfig must be readable")
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, consumer)
const program = ts.createProgram([...parsed.fileNames, ...declarations], parsed.options)
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
// Only these known upstream issues are exempt: extensionless imports in the
// legacy SDK entrypoint and V2's AI provider missing json-schema declarations.
const knownUpstreamIssue = (diagnostic) => {
  const file = diagnostic.file?.fileName
  return (diagnostic.code === 2835 && file === join(consumer, "node_modules", "@opencode-ai", "plugin", "dist", "index.d.ts"))
    || (diagnostic.code === 7016 && file === join(consumer, "node_modules", "@opencode", "plugin", "node_modules", "@ai-sdk", "provider", "dist", "index.d.ts")
      && ts.flattenDiagnosticMessageText(diagnostic.messageText, "\\n").includes("module 'json-schema'"))
}
const failures = diagnostics.filter((diagnostic) => !knownUpstreamIssue(diagnostic))
if (failures.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(failures, {
  getCanonicalFileName: (file) => file,
  getCurrentDirectory: () => consumer,
  getNewLine: () => "\\n",
}))
console.log("PASS NodeNext package declarations and consumer: " + declarations.length + " declarations; typed default.setup and default.server (" + diagnostics.length + " known upstream diagnostics excluded)")
`)
  console.log(run(process.execPath, [declarationCheck], consumer).trim())

  let binary = process.env.OPENCODE_BIN
  if (!binary) {
    writeFileSync(join(cli, "package.json"), JSON.stringify({ name: "antigravity-cli-runtime", private: true }))
    console.log(run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--save-exact", "@opencode/cli@2.1.2"], cli).trim())
    // The package postinstall creates this executable even when npm did not
    // create a .bin link before the executable existed.
    const cliPackage = join(cli, "node_modules", "@opencode", "cli")
    const cliManifest = JSON.parse(readFileSync(join(cliPackage, "package.json"), "utf8"))
    assert.equal(cliManifest.version, "2.1.2")
    run(process.execPath, [join(cliPackage, "postinstall.mjs")], cli)
    const entry = typeof cliManifest.bin === "string" ? cliManifest.bin : cliManifest.bin?.opencode
    assert(entry, "@opencode/cli is missing its opencode executable")
    binary = resolve(cliPackage, entry)
  } else {
    binary = resolve(binary)
  }
  assert.match(run(binary, ["--version"]).trim(), /^(?:opencode\s+)?v?2\.1\.2$/, "Packaging coverage requires the actual OpenCode 2.1.2 runtime")
  // Capture each CLI invocation so prompt echoes cannot satisfy the existing
  // harness's marker check: require actual assistant text and no error events.
  const eventsPath = join(temporary, "cli-events.jsonl")
  const capture = join(temporary, "capture-opencode.mjs")
  writeFileSync(capture, `#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
const result = spawnSync(${JSON.stringify(binary)}, args, { encoding: "utf8", timeout: 55_000, maxBuffer: 10 * 1024 * 1024 })
if (args[0] === "run") appendFileSync(${JSON.stringify(eventsPath)}, JSON.stringify({ args, output: result.stdout, status: result.status }) + "\\n")
process.stdout.write(result.stdout ?? "")
process.stderr.write(result.stderr ?? result.error?.message ?? "")
process.exit(result.status ?? 1)
`)
  chmodSync(capture, 0o755)
  for (const authMode of ["legacy", "pool", "v2"]) {
    writeFileSync(eventsPath, "")
    const runtime = run(process.execPath, [join(root, "script", "test-opencode-v2.mjs"), installed], consumer, {
      OPENCODE_BIN: capture,
      KEEP_OPENCODE_V2_FIXTURE: "1",
      OPENCODE_V2_TEST_AUTH: authMode,
    })
    console.log(runtime.trim())
    const evidence = runtime.match(/^Runtime evidence: (.+)$/m)?.[1]
    assert(evidence, "Runtime fixture did not provide its transport evidence")
    const records = readFileSync(join(evidence, "requests.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line))
    const cases = []
    for (const record of records) {
      if (record.kind === "fixture-setup") cases.push([])
      else {
        assert(cases.length, "Transport records arrived before fixture setup")
        cases.at(-1).push(record)
      }
    }
    const invocations = readFileSync(eventsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line))
    assert.equal(invocations.length, 4, "Expected streaming and tool cases for both model families")
    assert.equal(cases.length, invocations.length, "Each CLI invocation must load the packaged plugin")
    for (const [index, invocation] of invocations.entries()) {
      assert.equal(invocation.status, 0)
      const events = invocation.output.trim().split("\n").map((line) => JSON.parse(line))
      assert(!events.some((event) => event.type === "error"), "OpenCode emitted an error event")
      const tool = invocation.args.at(-1).includes("fixture-tool")
      const marker = tool ? "TOOL_ROUND_TRIP_OK" : "PLUGIN_V2_OK"
      assert(events.some((event) => event.type === "text" && event.part?.text?.includes(marker)), `No assistant text containing ${marker}`)
      const gemini = invocation.args[invocation.args.indexOf("--model") + 1].includes("gemini")
      const requests = cases[index].filter((record) => record.kind === "request")
      assert(requests.length > 0, "Case did not reach the fixture transport")
      for (const request of requests) {
        assert.equal(request.model, gemini ? "gemini-3-flash" : "claude-opus-4-6-thinking")
        const thinking = request.generationConfig?.thinkingConfig
        if (gemini) assert.equal(thinking?.thinkingLevel?.toLowerCase(), "high")
        else assert.equal(thinking?.thinking_budget, 32768)
      }
      if (tool) {
        assert(events.some((event) => event.type === "tool_use" && event.part?.tool === "fixture_echo"
          && event.part.state?.status === "completed" && event.part.state.input?.value === "tool-round-trip"
          && event.part.state.output === "fixture-tool-result:tool-round-trip"), "Fixture tool did not return the expected result")
        assert(cases[index].some((record) => record.kind === "tool" && record.value === "tool-round-trip"))
        assert(requests.some((request) => request.toolRequested && !request.toolReturned))
        assert(requests.some((request) => request.toolRequested && request.toolReturned))
      }
    }
    console.log("PASS per-case model, variant, assistant text, and exact tool result; no CLI error events")
  }
  console.log("PASS packaged plugin on OpenCode 2.1.2")
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  if (process.env.KEEP_OPENCODE_V2_FIXTURE) console.log(`Packaging evidence: ${temporary}`)
  else rmSync(temporary, { recursive: true, force: true })
}
