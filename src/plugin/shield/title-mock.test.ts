import { describe, expect, it } from "vitest";

import {
  buildTitleResponse,
  deriveTitle,
  detectTitleRequest,
  maybeBuildTitleResponse,
} from "./title-mock";

const OPENCODE_TITLE_PROMPT =
  'You will receive the first message of a conversation, or for an ongoing conversation its original request and recent messages. Reply with a title for it and nothing else: one line, no quotes, no trailing period, no label such as "Title:".';

function nativeTitleRequest(userText: string): Record<string, unknown> {
  return {
    contents: [{ role: "user", parts: [{ text: userText }] }],
    systemInstruction: { parts: [{ text: OPENCODE_TITLE_PROMPT }] },
  };
}

describe("deriveTitle", () => {
  it("uses the first meaningful line", () => {
    expect(deriveTitle("Fix the login bug\n\nMore detail here")).toBe("Fix the login bug");
  });

  it("strips role labels and markdown", () => {
    expect(deriveTitle("user: ## Update the README")).toBe("Update the README");
  });

  it("removes fenced code blocks", () => {
    expect(deriveTitle("```ts\nconst x = 1\n```\nRefactor parser")).toBe("Refactor parser");
  });

  it("truncates long lines at a word boundary", () => {
    const title = deriveTitle(
      "This is a very long request about refactoring the authentication pipeline in detail",
    );
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith(" ")).toBe(false);
  });

  it("falls back to New Chat for empty input", () => {
    expect(deriveTitle("")).toBe("New Chat");
    expect(deriveTitle("```\ncode only\n```")).toBe("New Chat");
  });

  it("skips 'Here is the first message of the conversation:' boilerplate", () => {
    const title = deriveTitle(
      "Here is the first message of the conversation:\n\nFix the login bug",
    );
    expect(title).toBe("Fix the login bug");
  });
});

describe("detectTitleRequest", () => {
  it("detects the OpenCode title prompt", () => {
    const result = detectTitleRequest(nativeTitleRequest("Fix the login bug"));

    expect(result.isTitleRequest).toBe(true);
    expect(result.title).toBe("Fix the login bug");
  });

  it("detects the Hermes title prompt", () => {
    const result = detectTitleRequest({
      messages: [
        { role: "system", content: "You name chat sessions." },
        { role: "user", content: "Plan a trip to Japan" },
      ],
    });

    expect(result.isTitleRequest).toBe(true);
    expect(result.title).toBe("Plan a trip to Japan");
  });

  it("detects the OpenCode title prompt sent as a user message", () => {
    const result = detectTitleRequest({
      contents: [{ role: "user", parts: [{ text: OPENCODE_TITLE_PROMPT }] }],
    });

    expect(result.isTitleRequest).toBe(true);
    expect(result.title).toBe("New Chat");
  });

  it("derives the title from the conversation, not the title instruction", () => {
    const result = detectTitleRequest({
      contents: [
        { role: "user", parts: [{ text: `${OPENCODE_TITLE_PROMPT}\n\nRefactor the parser` }] },
      ],
    });

    expect(result.isTitleRequest).toBe(true);
    expect(result.title).toBe("Refactor the parser");
  });

  it("ignores requests that carry tools", () => {
    const payload = nativeTitleRequest("Generate a title for this");
    payload.tools = [{ functionDeclarations: [] }];

    expect(detectTitleRequest(payload).isTitleRequest).toBe(false);
  });

  it("detects a short title request by output budget", () => {
    const result = detectTitleRequest({
      messages: [{ role: "user", content: "Generate a short title for this conversation" }],
      max_tokens: 25,
    });

    expect(result.isTitleRequest).toBe(true);
  });

  it("does not intercept ordinary requests that merely mention titles", () => {
    const result = detectTitleRequest({
      systemInstruction: { parts: [{ text: "You are a helpful writing assistant." }] },
      contents: [
        { role: "user", parts: [{ text: "Write a title for this blog post about caching" }] },
      ],
    });

    expect(result.isTitleRequest).toBe(false);
  });

  it("does not intercept ordinary requests", () => {
    const result = detectTitleRequest({
      contents: [{ role: "user", parts: [{ text: "Refactor the login flow" }] }],
    });

    expect(result.isTitleRequest).toBe(false);
  });
});

describe("buildTitleResponse", () => {
  it("returns a native Gemini JSON response", async () => {
    const response = buildTitleResponse("Fix login");
    const body = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(body.candidates[0]?.content.parts[0]?.text).toBe("Fix login");
  });

  it("returns SSE for streaming requests", async () => {
    const response = buildTitleResponse("Fix login", { streaming: true });
    const text = await response.text();

    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(text.startsWith("data: ")).toBe(true);

    const payload = JSON.parse(text.slice("data: ".length).trim()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    expect(payload.candidates[0]?.content.parts[0]?.text).toBe("Fix login");
  });
});

describe("maybeBuildTitleResponse", () => {
  it.each([
    "<message>\nFix the login bug\n</message>",
    "<message>Fix the login bug</message>",
    '<message role="user">\nFix the login bug\n</message>',
  ])("uses message content rather than its wrapper: %s", async (message) => {
    const response = maybeBuildTitleResponse(JSON.stringify(nativeTitleRequest(
      `Here is the first message of the conversation:\n\n${message}`,
    )));
    expect(response).not.toBeNull();
    const body = await response!.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    expect(body.candidates[0]?.content.parts[0]?.text).toBe("Fix the login bug");
  });

  it("returns a response for a detected title request", () => {
    const response = maybeBuildTitleResponse(JSON.stringify(nativeTitleRequest("Add dark mode")));
    expect(response).not.toBeNull();
  });

  it("returns null for non-title requests", () => {
    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Refactor the parser" }] }],
    });
    expect(maybeBuildTitleResponse(body)).toBeNull();
  });

  it("returns null for invalid or non-string bodies", () => {
    expect(maybeBuildTitleResponse("not json")).toBeNull();
    expect(maybeBuildTitleResponse(undefined)).toBeNull();
    expect(maybeBuildTitleResponse({})).toBeNull();
  });
});
