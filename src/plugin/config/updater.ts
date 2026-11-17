/**
 * OpenCode configuration file updater.
 *
 * Updates ~/.config/opencode/opencode.json(c) with plugin models.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, isAbsolute, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { OPENCODE_MODEL_DEFINITIONS } from "./models";

// =============================================================================
// Types
// =============================================================================

export interface UpdateConfigResult {
  success: boolean;
  configPath: string;
  error?: string;
}

type PluginEntry = string | { package: string; options?: Record<string, unknown> };
type LegacyPluginEntry = PluginEntry | [string, Record<string, unknown>];

function pluginPackage(entry: LegacyPluginEntry): string {
  return typeof entry === "string" ? entry : Array.isArray(entry) ? entry[0] : entry.package;
}

function isAntigravityEntry(entry: PluginEntry, configPath: string): boolean {
  const name = pluginPackage(entry).replace(/^-/, "");
  if (name === "opencode-antigravity-auth" || name.startsWith("opencode-antigravity-auth@")) return true;
  const path = name.startsWith("file:") ? fileURLToPath(name)
    : isAbsolute(name) || name.startsWith(".") ? resolve(dirname(configPath), name) : undefined;
  if (!path) return false;
  const manifest = join(path, "package.json");
  if (existsSync(manifest)) {
    try {
      return (JSON.parse(readFileSync(manifest, "utf8")) as { name?: string }).name === "opencode-antigravity-auth";
    } catch {
      // An unrelated checkout's malformed manifest must not block config writes.
      return false;
    }
  }
  return path.includes("opencode-antigravity-auth");
}

export interface OpencodeConfig {
  $schema?: string;
  plugin?: LegacyPluginEntry[];
  plugins?: PluginEntry[];
  providers?: Record<string, Record<string, unknown> & { models?: Record<string, unknown> }>;
  provider?: {
    google?: {
      models?: Record<string, unknown>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface UpdateConfigOptions {
  /** Override the config file path (for testing) */
  configPath?: string;
  /** V1 remains available for callers using the legacy entrypoint. */
  version?: 1 | 2;
}

// =============================================================================
// Constants
// =============================================================================

const PLUGIN_NAME = "opencode-antigravity-auth@latest";
const SCHEMA_URL = "https://opencode.ai/config.json";
const OPENCODE_JSON_FILENAME = "opencode.json";
const OPENCODE_JSONC_FILENAME = "opencode.jsonc";

function stripJsonCommentsAndTrailingCommas(json: string): string {
  return json
    .replace(
      /\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g,
      (match: string, group: string | undefined) => (group ? "" : match)
    )
    .replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Get the opencode config directory path.
 */
export function getOpencodeConfigDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(xdgConfig, "opencode");
}

/**
 * Get the opencode config file path.
 *
 * Prefers opencode.jsonc when present so we update the active config file
 * instead of creating a new opencode.json.
 */
export function getOpencodeConfigPath(): string {
  const configDir = getOpencodeConfigDir();
  const jsoncPath = join(configDir, OPENCODE_JSONC_FILENAME);
  const jsonPath = join(configDir, OPENCODE_JSON_FILENAME);

  if (existsSync(jsoncPath)) {
    return jsoncPath;
  }
  if (existsSync(jsonPath)) {
    return jsonPath;
  }

  return jsonPath;
}

// =============================================================================
// Main Function
// =============================================================================

/**
 * Updates the opencode configuration file with plugin models.
 *
 * This function:
 * 1. Reads existing opencode.json/opencode.jsonc (or creates default structure)
 * 2. Ensures a plugin entry; V1 also writes its model definitions
 * 3. Writes back to disk with proper formatting
 *
 * Preserves:
 * - $schema and other top-level config keys
 * - Non-google provider sections
 * - Other settings within google provider (V1 replaces models)
 * - All provider objects in V2, whose catalog is registered at runtime
 *
 * @param options - Optional configuration (e.g., custom configPath for testing)
 * @returns UpdateConfigResult with success status and path
 */
export async function updateOpencodeConfig(
  options: UpdateConfigOptions = {}
): Promise<UpdateConfigResult> {
  const configPath = options.configPath ?? getOpencodeConfigPath();

  try {
    let config: OpencodeConfig;

    // Read existing config or create default
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, "utf-8");
      config = JSON.parse(stripJsonCommentsAndTrailingCommas(content)) as OpencodeConfig;
    } else {
      // Create default config structure
      config = options.version === 2
        ? { $schema: SCHEMA_URL, plugins: [] }
        : { $schema: SCHEMA_URL, plugin: [], provider: {} };
    }

    // Ensure $schema is set
    if (!config.$schema) {
      config.$schema = SCHEMA_URL;
    }

    if (options.version === 2) {
      const legacyPlugins = Array.isArray(config.plugin) ? config.plugin : [];
      // Ordered enable/disable entries can repeat intentionally in V2.
      config.plugins = [
        ...legacyPlugins.map((entry) => Array.isArray(entry) ? { package: entry[0], options: entry[1] } : entry),
        ...(config.plugins ?? []),
      ];
      delete config.plugin;
      const hasPlugin = config.plugins.some((entry) => isAntigravityEntry(entry, configPath));
      if (!hasPlugin) config.plugins.push(PLUGIN_NAME);
      // V2 contributes its catalog at runtime. Let Core migrate legacy provider
      // objects: creating providers.google here would take precedence over the
      // entire legacy Google provider and hide its settings and custom models.
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true, configPath };
    }

    // Ensure plugin array exists and contains our plugin
    if (!Array.isArray(config.plugin)) {
      config.plugin = [];
    }

    // Check if plugin is already in the list (any version)
    const hasPlugin = config.plugin.some((p) =>
      pluginPackage(p).includes("opencode-antigravity-auth")
    );
    if (!hasPlugin) {
      config.plugin.push(PLUGIN_NAME);
    }

    // Ensure provider.google structure exists
    if (!config.provider) {
      config.provider = {};
    }
    if (!config.provider.google) {
      config.provider.google = {};
    }

    // Replace google models with plugin models
    config.provider.google.models = { ...OPENCODE_MODEL_DEFINITIONS };

    // Ensure config directory exists
    const configDir = dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }

    // Write config with proper formatting (2-space indent)
    writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

    return {
      success: true,
      configPath,
    };
  } catch (error) {
    return {
      success: false,
      configPath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
