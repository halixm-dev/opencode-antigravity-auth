/**
 * Local session-title responder (ported from ag-shield).
 *
 * OpenCode asks the model to name a session with a dedicated request:
 *
 * "Reply with a title for it and nothing else: one line, no quotes, ..."
 *
 * That request burns a real upstream call (and rate-limit quota) for a string
 * that can be produced locally. This module detects those requests and answers
 * them in-process with the native Gemini response shape, including SSE.
 */

export interface TitleDetection {
  isTitleRequest: boolean
  title: string
}

export interface TitleMockOptions {
  /** Force streaming SSE output regardless of the detected request */
  streaming?: boolean
  /** Model name echoed back in the response */
  model?: string
}

const TITLE_SYSTEM_PATTERNS = [
  /Reply with a title for it and nothing else/i,
  /You will receive the first message of a conversation/i,
  /You name chat sessions\./i,
  /Generate a (?:short |concise )?title for (?:this|the) (?:conversation|chat|session)/i,
  /Here is the (?:first message of the conversation|original request and recent messages|conversation|chat history|user's request)/i,
  /^here\s+is\s+(?:the\s+)?(?:first\s+message|conversation|chat|original\s+request|recent\s+messages|history)/i,
]

const TITLE_FALLBACK_PATTERN =
  /(?:session|chat|conversation)\s*title|generate\s+(?:a\s+)?(?:short\s+)?title|title\s+for\s+this|create\s+(?:a\s+)?(?:3-5\s+word\s+)?title|reply\s+with\s+a\s+title/i

const MAX_TITLE_LENGTH = 48

function extractText(value: unknown): string {
  if (typeof value === "string") {
    return value
  }
  if (!Array.isArray(value)) {
    return ""
  }
  const chunks: string[] = []
  for (const part of value) {
    if (!part || typeof part !== "object") {
      continue
    }
    const record = part as Record<string, unknown>
    if (typeof record.text === "string") {
      chunks.push(record.text)
    }
  }
  return chunks.join(" ")
}

function getMessageTexts(payload: Record<string, unknown>): string[] {
  const texts: string[] = []

  if (Array.isArray(payload.messages)) {
    for (const message of payload.messages as unknown[]) {
      if (!message || typeof message !== "object") {
        continue
      }
      const record = message as Record<string, unknown>
      const text = extractText(record.content)
      if (text.trim()) {
        texts.push(text)
      }
    }
  }

  if (Array.isArray(payload.contents)) {
    for (const content of payload.contents as unknown[]) {
      if (!content || typeof content !== "object") {
        continue
      }
      const record = content as Record<string, unknown>
      const text = extractText(record.parts)
      if (text.trim()) {
        texts.push(text)
      }
    }
  }

  return texts
}

function getSystemText(payload: Record<string, unknown>): string {
  const instruction = payload.systemInstruction ?? payload.system_instruction ?? payload.system
  if (typeof instruction === "string") {
    return instruction
  }
  if (instruction && typeof instruction === "object") {
    const record = instruction as Record<string, unknown>
    if (Array.isArray(record.parts)) {
      return extractText(record.parts)
    }
  }

  // System prompts can also arrive as messages[] entries.
  if (Array.isArray(payload.messages)) {
    const chunks: string[] = []
    for (const message of payload.messages as unknown[]) {
      if (!message || typeof message !== "object") {
        continue
      }
      const record = message as Record<string, unknown>
      if (record.role !== "system" && record.role !== "developer") {
        continue
      }
      const text = extractText(record.content)
      if (text) {
        chunks.push(text)
      }
    }
    return chunks.join("\n")
  }

  return ""
}

function getMaxOutputTokens(payload: Record<string, unknown>): number | undefined {
  const candidates = [
    (payload.generationConfig as Record<string, unknown> | undefined)?.maxOutputTokens,
    payload.max_tokens,
    payload.max_completion_tokens,
    payload.maxOutputTokens,
  ]
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
  }
  return undefined
}

function finalizeTitle(value: string): string {
  const trimmed = value.replace(/[\s.!?]+$/, "").trim()
  return trimmed.length > 0 ? trimmed : "New Chat"
}

/**
 * Derives a readable title from the first chunk of conversation text.
 */
export function deriveTitle(source: string): string {
  if (typeof source !== "string") {
    return "New Chat"
  }

  // OpenCode wraps the conversation text in <message> tags in title prompts.
  // Remove only that transport wrapper, preserving markup in the user's text.
  const withoutCode = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<\/?message(?:\s+[^<>]*)?>/gi, "")
  const lines = withoutCode
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const rawLine of lines) {
    if (TITLE_SYSTEM_PATTERNS.some((pattern) => pattern.test(rawLine))) {
      continue
    }
    let line = rawLine
      .replace(/^(?:user|assistant|human|system|###\s*\w+)\s*[:>]\s*/i, "")
      .replace(/^#+\s*/, "")
      .replace(/^[>*\-+]+\s*/, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .trim()

    if (line.length < 3) {
      continue
    }

    line = line.replace(/\s+/g, " ")
    if (line.length <= MAX_TITLE_LENGTH) {
      return finalizeTitle(line)
    }

    const clipped = line.slice(0, MAX_TITLE_LENGTH)
    const lastSpace = clipped.lastIndexOf(" ")
    return finalizeTitle(lastSpace > 16 ? clipped.slice(0, lastSpace) : clipped)
  }

  return "New Chat"
}

function stripTitleInstructions(text: string): string {
  if (typeof text !== "string" || text.length === 0) {
    return ""
  }
  // The instruction can be one long line; split it into sentences as well as
  // lines so "Reply with a title..." never becomes the title itself.
  const segments = text.split(/(?<=[.!?])\s+|\r?\n/)
  return segments
    .filter((segment) => !TITLE_SYSTEM_PATTERNS.some((pattern) => pattern.test(segment)))
    .join("\n")
}

function selectTitleSource(texts: string[]): string {
  for (let i = texts.length - 1; i >= 0; i--) {
    const stripped = stripTitleInstructions(texts[i] ?? "")
    if (stripped.trim().length > 0) {
      return stripped
    }
  }
  return ""
}

/**
 * Detects whether a payload is a session-title request and derives its title.
 */
export function detectTitleRequest(payload: Record<string, unknown>): TitleDetection {
  if (!payload || typeof payload !== "object") {
    return { isTitleRequest: false, title: "" }
  }

  // Title requests never carry tools; a tool-calling turn is real work.
  if (Array.isArray(payload.tools) && payload.tools.length > 0) {
    return { isTitleRequest: false, title: "" }
  }

  const systemText = getSystemText(payload)
  const texts = getMessageTexts(payload)
  const combined = `${systemText}\n${texts.join("\n")}`
  const titleSource = () => deriveTitle(selectTitleSource(texts))

  // The OpenCode title instruction can arrive as a system or user message,
  // so match the strong patterns against the whole prompt.
  const strongMatch = TITLE_SYSTEM_PATTERNS.some((pattern) => pattern.test(combined))
  if (strongMatch) {
    return { isTitleRequest: true, title: titleSource() }
  }

  const maxOutputTokens = getMaxOutputTokens(payload)
  const looksLikeTitle = TITLE_FALLBACK_PATTERN.test(combined)

  // Conservative fallback: a short output budget plus explicit title wording.
  if (looksLikeTitle && maxOutputTokens !== undefined && maxOutputTokens <= 64) {
    return { isTitleRequest: true, title: titleSource() }
  }

  // Very short requests are only treated as title requests when the title
  // instruction lives in the system prompt. A user asking "write a title for
  // this blog post" must still reach the model.
  if (looksLikeTitle && TITLE_FALLBACK_PATTERN.test(systemText) && texts.length <= 4) {
    return { isTitleRequest: true, title: titleSource() }
  }

  return { isTitleRequest: false, title: "" }
}

interface GeminiTitleResponse {
  candidates: Array<{
    content: { role: "model"; parts: Array<{ text: string }> }
    finishReason: "STOP"
  }>
  usageMetadata: {
    promptTokenCount: number
    candidatesTokenCount: number
    totalTokenCount: number
  }
}

function buildGeminiTitleResponse(title: string): GeminiTitleResponse {
  const promptTokens = 16
  const completionTokens = 4
  return {
    candidates: [
      {
        content: { role: "model", parts: [{ text: title }] },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: promptTokens,
      candidatesTokenCount: completionTokens,
      totalTokenCount: promptTokens + completionTokens,
    },
  }
}

/**
 * Builds the local response for a detected title request.
 */
export function buildTitleResponse(title: string, options: TitleMockOptions = {}): Response {
  const payload = buildGeminiTitleResponse(title || "New Chat")

  if (options.streaming) {
    const body = `data: ${JSON.stringify(payload)}\n\n`
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  })
}

/**
 * Parses a request body and produces a local title response when applicable.
 * Returns `null` when the request should be forwarded normally.
 */
export function maybeBuildTitleResponse(
  body: unknown,
  options: TitleMockOptions = {},
): Response | null {
  if (typeof body !== "string" || body.length === 0) {
    return null
  }

  let payload: Record<string, unknown>
  try {
    const parsed = JSON.parse(body) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null
    }
    payload = parsed as Record<string, unknown>
  } catch {
    return null
  }

  const detection = detectTitleRequest(payload)
  if (!detection.isTitleRequest) {
    return null
  }

  return buildTitleResponse(detection.title, options)
}
