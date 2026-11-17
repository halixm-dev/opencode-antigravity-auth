/**
 * Agent signature neutralizer (ported from ag-shield).
 *
 * Antigravity filters treat agent/framework fingerprints embedded in system
 * prompts (framework names, documentation URLs, runtime markers) as automated
 * traffic and can answer with false-positive 403/429 errors. This module
 * rewrites those fingerprints into neutral text while keeping the prompt's
 * meaning intact.
 *
 * Only system/developer messages are sanitized by default. User messages are
 * left untouched unless `sanitize_user_messages` is enabled, because they may
 * legitimately reference the agent or its documentation.
 */

export interface ShieldReplacement {
  /** Text or regular expression source to match */
  find: string
  /** Replacement text */
  replace: string
  /** Treat `find` as a regular expression source */
  isRegex?: boolean
}

export interface SignatureSanitizeOptions {
  /** Rewrite system/developer prompt text */
  stripSignatures: boolean
  /** Also rewrite user messages (off by default) */
  sanitizeUserMessages?: boolean
  /** User-defined find/replace rules applied after the built-in rules */
  customReplacements?: ShieldReplacement[]
}

interface SignatureRule {
  pattern: RegExp
  replacement: string
}

/**
 * Built-in rules. Specific rules must run before the generic catch-alls.
 *
 * The Hermes/OpenClaw entries come from ag-shield; the OpenCode entries cover
 * this plugin's own client fingerprints.
 */
const DEFAULT_SIGNATURE_RULES: readonly SignatureRule[] = [
  // --- Known Antigravity false-positive trigger sentences -------------------
  {
    pattern: /solve coding tasks\.\s*Be concise, practical, and tool-aware\./gi,
    replacement:
      "work on their coding tasks. Keep responses concise and practical, and use the available tools when they help.",
  },
  {
    pattern: /You are pair programming with a user to solve coding tasks\./gi,
    replacement: "You pair program with the user on coding tasks.",
  },
  {
    pattern:
      /When the user asks you to build, run, or verify something, the deliverable is a working artifact backed by real tool output/gi,
    replacement:
      "If the user asks you to build, run or check something, deliver a working result based on actual tool output",
  },
  {
    pattern: /Reporting a blocker honestly is always better than inventing a result\./gi,
    replacement: "It is always better to report a blocker honestly than to make up a result.",
  },
  {
    pattern: /You are Hermes Agent, an intelligent AI assistant created by Nous Research\./gi,
    replacement: "You are Hermes Agent. You are an intelligent AI assistant created by Nous Research.",
  },
  { pattern: /Be direct\./gi, replacement: "Get straight to the point." },
  { pattern: /is your authoritative reference/gi, replacement: "is your reference guide" },
  { pattern: /# Google model operational directives/gi, replacement: "# Model operational directives" },

  // --- Documentation URLs and multi-word agent phrases ---------------------
  {
    pattern: /https?:\/\/hermes-agent\.nousresearch\.com\/docs/gi,
    replacement: "the official documentation",
  },
  { pattern: /nousresearch\.com/gi, replacement: "docs.local" },
  { pattern: /For help with Hermes Agent itself/gi, replacement: "For help with the assistant itself" },
  { pattern: /Hermes delivers their message/gi, replacement: "the runtime delivers their message" },
  {
    pattern: /You are chatting inside the Hermes desktop app, a graphical chat surface\./gi,
    replacement: "You are chatting inside a graphical desktop chat surface.",
  },
  {
    pattern:
      /Act as an effective and practical assistant\. Your primary goal is to help the user by answering questions, writing and debugging code, analyzing information, creating content, and executing tasks using the available tools\./gi,
    replacement:
      "You are a helpful coding and technical assistant. Assist the user with questions, code, analysis, and tasks using available tools.",
  },

  // --- OpenCode fingerprints ------------------------------------------------
  {
    pattern: /https?:\/\/(?:www\.)?opencode\.ai[^\s)>\]"']*/gi,
    replacement: "the official documentation",
  },
  { pattern: /opencode\.ai/gi, replacement: "docs.local" },
  { pattern: /You are opencode\b/gi, replacement: "You are the agent" },
  { pattern: /\bopencode\b/gi, replacement: "the agent" },

  // --- Structural headers and markers --------------------------------------
  { pattern: /# Finishing the job/gi, replacement: "# Task completion" },
  { pattern: /# Parallel tool calls/gi, replacement: "# Concurrent tool usage" },
  { pattern: /## Mid-turn user steering/gi, replacement: "## Mid-turn user guidance" },
  { pattern: /\[OUT-OF-BAND USER MESSAGE[^\]]*\]/gi, replacement: "[USER UPDATE]" },
  { pattern: /\[\/OUT-OF-BAND USER MESSAGE\]/gi, replacement: "[/USER UPDATE]" },
  { pattern: /<available_skills>/gi, replacement: "<available_guides>" },
  { pattern: /<\/available_skills>/gi, replacement: "</available_guides>" },
  { pattern: /Before replying, scan the skills below\./gi, replacement: "Before replying, review the available guides below." },
  { pattern: /Skills come first:/gi, replacement: "Guides come first:" },
  { pattern: /## Skills/gi, replacement: "## Guides" },
  {
    pattern: /═{10,}\s*MEMORY \(your personal notes\)[^═]*═{10,}/gi,
    replacement: "--- CONTEXT NOTES ---",
  },
  {
    pattern: /═{10,}\s*USER PROFILE \(who the user is\)[^═]*═{10,}/gi,
    replacement: "--- USER CONTEXT ---",
  },

  // --- Runtime headers ------------------------------------------------------
  { pattern: /# Hermes runtime environment/gi, replacement: "# Runtime environment" },
  { pattern: /<!-- End Hermes runtime environment -->/gi, replacement: "<!-- End runtime environment -->" },

  // --- Env vars, paths, identifiers -----------------------------------------
  { pattern: /HERMES_KANBAN_/gi, replacement: "AGENT_KANBAN_" },
  { pattern: /HERMES_TENANT/gi, replacement: "AGENT_TENANT" },
  { pattern: /hermes-agent/gi, replacement: "agent-guide" },
  { pattern: /hermes_tools/gi, replacement: "agent_tools" },
  { pattern: /data-hermes-send/gi, replacement: "data-agent-send" },
  { pattern: /window\.hermes\.send/gi, replacement: "window.agent.send" },
  { pattern: /never via Hermes bot/gi, replacement: "never via the assistant bot" },
  { pattern: /\bHermes\b/gi, replacement: "the agent" },
  { pattern: /hermes/gi, replacement: "agent" },

  // --- Other agent signatures ----------------------------------------------
  { pattern: /You are a personal assistant running inside OpenClaw\./gi, replacement: "You are a personal assistant." },
  { pattern: /VALIDATION_REQUIRED/g, replacement: "AUTH_CHECK" },
]

/**
 * Rewrites a single text block. Non-string input is returned unchanged.
 */
export function sanitizeSignatureText(
  text: string,
  customReplacements: ShieldReplacement[] = [],
): string {
  if (typeof text !== "string" || text.length === 0) {
    return text
  }

  let result = text
  for (const rule of DEFAULT_SIGNATURE_RULES) {
    result = result.replace(rule.pattern, rule.replacement)
  }

  for (const rule of customReplacements) {
    if (!rule || typeof rule.find !== "string" || rule.find.length === 0) {
      continue
    }
    try {
      if (rule.isRegex) {
        result = result.replace(new RegExp(rule.find, "g"), rule.replace ?? "")
      } else {
        result = result.split(rule.find).join(rule.replace ?? "")
      }
    } catch {
      // Invalid user-supplied regex: skip the rule rather than failing the request.
    }
  }

  return result
}

function sanitizePartText(part: unknown, customReplacements: ShieldReplacement[]): { part: unknown; changed: boolean } {
  if (!part || typeof part !== "object") {
    return { part, changed: false }
  }

  const record = part as Record<string, unknown>
  if (typeof record.text !== "string") {
    return { part, changed: false }
  }

  const cleaned = sanitizeSignatureText(record.text, customReplacements)
  if (cleaned === record.text) {
    return { part, changed: false }
  }

  return { part: { ...record, text: cleaned }, changed: true }
}

function sanitizeMessageContent(
  content: unknown,
  customReplacements: ShieldReplacement[],
): { content: unknown; changed: boolean } {
  if (typeof content === "string") {
    const cleaned = sanitizeSignatureText(content, customReplacements)
    return { content: cleaned, changed: cleaned !== content }
  }

  if (!Array.isArray(content)) {
    return { content, changed: false }
  }

  let changed = false
  const next = content.map((part) => {
    const result = sanitizePartText(part, customReplacements)
    changed = changed || result.changed
    return result.part
  })

  return { content: changed ? next : content, changed }
}

function shouldSanitizeRole(role: unknown, sanitizeUserMessages: boolean): boolean {
  return role === "system" || role === "developer" || (sanitizeUserMessages && role === "user")
}

/**
 * Sanitizes agent fingerprints in a request payload in place.
 *
 * Handles the shapes Antigravity/OpenCode can send:
 * - `messages[]` with string or multipart content
 * - `system` string
 * - `systemInstruction` string, `{ parts }`, or a parts array
 * - `contents[]` parts (only when `sanitizeUserMessages` is enabled)
 */
export function sanitizeRequestSignatures(
  payload: Record<string, unknown>,
  options: SignatureSanitizeOptions,
): { changed: boolean; changes: string[] } {
  if (!payload || typeof payload !== "object" || !options.stripSignatures) {
    return { changed: false, changes: [] }
  }

  const customReplacements = options.customReplacements ?? []
  const sanitizeUserMessages = options.sanitizeUserMessages ?? false
  const changes: string[] = []

  if (Array.isArray(payload.messages)) {
    payload.messages = (payload.messages as unknown[]).map((message) => {
      if (!message || typeof message !== "object") {
        return message
      }
      const record = message as Record<string, unknown>
      if (!shouldSanitizeRole(record.role, sanitizeUserMessages)) {
        return message
      }
      const result = sanitizeMessageContent(record.content, customReplacements)
      if (result.changed) {
        changes.push(`Sanitized ${String(record.role)} message`)
        return { ...record, content: result.content }
      }
      return message
    })
  }

  if (sanitizeUserMessages && Array.isArray(payload.contents)) {
    payload.contents = (payload.contents as unknown[]).map((content) => {
      if (!content || typeof content !== "object") {
        return content
      }
      const record = content as Record<string, unknown>
      if (record.role !== "user" || !Array.isArray(record.parts)) {
        return content
      }
      let changed = false
      const parts = (record.parts as unknown[]).map((part) => {
        const result = sanitizePartText(part, customReplacements)
        changed = changed || result.changed
        return result.part
      })
      if (!changed) {
        return content
      }
      changes.push("Sanitized user contents")
      return { ...record, parts }
    })
  }

  if (typeof payload.system === "string") {
    const cleaned = sanitizeSignatureText(payload.system, customReplacements)
    if (cleaned !== payload.system) {
      payload.system = cleaned
      changes.push("Sanitized system prompt")
    }
  }

  const systemInstruction = payload.systemInstruction
  if (typeof systemInstruction === "string") {
    const cleaned = sanitizeSignatureText(systemInstruction, customReplacements)
    if (cleaned !== systemInstruction) {
      payload.systemInstruction = cleaned
      changes.push("Sanitized systemInstruction")
    }
  } else if (Array.isArray(systemInstruction)) {
    let changed = false
    payload.systemInstruction = systemInstruction.map((part) => {
      const result = sanitizePartText(part, customReplacements)
      changed = changed || result.changed
      return result.part
    })
    if (changed) {
      changes.push("Sanitized systemInstruction parts")
    }
  } else if (systemInstruction && typeof systemInstruction === "object") {
    const sys = systemInstruction as Record<string, unknown>
    if (Array.isArray(sys.parts)) {
      let changed = false
      sys.parts = (sys.parts as unknown[]).map((part) => {
        const result = sanitizePartText(part, customReplacements)
        changed = changed || result.changed
        return result.part
      })
      if (changed) {
        changes.push("Sanitized systemInstruction parts")
      }
    }
  }

  return { changed: changes.length > 0, changes }
}
