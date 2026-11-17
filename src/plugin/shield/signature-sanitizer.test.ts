import { describe, expect, it } from "vitest";

import { sanitizeRequestSignatures, sanitizeSignatureText } from "./signature-sanitizer";

describe("sanitizeSignatureText", () => {
  it("neutralizes Hermes fingerprints", () => {
    const input = "You are Hermes Agent, an intelligent AI assistant created by Nous Research.";
    const output = sanitizeSignatureText(input);
    expect(output).not.toContain("Hermes");
    expect(output).not.toContain("nousresearch.com");
  });

  it("neutralizes OpenCode fingerprints", () => {
    const input = "You are opencode. See https://opencode.ai/docs for help.";
    const output = sanitizeSignatureText(input);
    expect(output).not.toMatch(/opencode/i);
    expect(output).toContain("the official documentation");
  });

  it("leaves neutral text unchanged", () => {
    const input = "You are a helpful coding assistant.";
    expect(sanitizeSignatureText(input)).toBe(input);
  });

  it("applies custom literal replacements", () => {
    const output = sanitizeSignatureText("hello world", [
      { find: "world", replace: "there" },
    ]);
    expect(output).toBe("hello there");
  });

  it("applies custom regex replacements", () => {
    const output = sanitizeSignatureText("token-123 token-456", [
      { find: "token-\\d+", replace: "token-xxx", isRegex: true },
    ]);
    expect(output).toBe("token-xxx token-xxx");
  });

  it("ignores invalid custom regex rules", () => {
    const output = sanitizeSignatureText("safe text", [
      { find: "([", replace: "x", isRegex: true },
    ]);
    expect(output).toBe("safe text");
  });
});

describe("sanitizeRequestSignatures", () => {
  it("sanitizes system messages but not user messages by default", () => {
    const payload = {
      messages: [
        { role: "system", content: "You are opencode." },
        { role: "user", content: "What is opencode?" },
      ],
    };

    const result = sanitizeRequestSignatures(payload, { stripSignatures: true });

    expect(result.changed).toBe(true);
    expect(payload.messages[0]?.content).toBe("You are the agent.");
    expect(payload.messages[1]?.content).toBe("What is opencode?");
  });

  it("sanitizes user messages when enabled", () => {
    const payload = {
      messages: [{ role: "user", content: "Tell me about opencode." }],
    };

    const result = sanitizeRequestSignatures(payload, {
      stripSignatures: true,
      sanitizeUserMessages: true,
    });

    expect(result.changed).toBe(true);
    expect(payload.messages[0]?.content).toBe("Tell me about the agent.");
  });

  it("sanitizes multipart system content", () => {
    const payload = {
      messages: [
        {
          role: "system",
          content: [{ text: "You are opencode." }],
        },
      ],
    };

    sanitizeRequestSignatures(payload, { stripSignatures: true });

    expect((payload.messages[0]?.content as Array<{ text: string }>)[0]?.text).toBe(
      "You are the agent.",
    );
  });

  it("sanitizes systemInstruction parts", () => {
    const payload = {
      systemInstruction: {
        parts: [{ text: "You are opencode." }, { text: "Stay concise." }],
      },
    };

    const result = sanitizeRequestSignatures(payload, { stripSignatures: true });

    expect(result.changed).toBe(true);
    expect(payload.systemInstruction.parts[0]?.text).toBe("You are the agent.");
    expect(payload.systemInstruction.parts[1]?.text).toBe("Stay concise.");
  });

  it("sanitizes a string system prompt", () => {
    const payload = { system: "See opencode.ai for docs." };
    sanitizeRequestSignatures(payload, { stripSignatures: true });
    expect(payload.system).toBe("See docs.local for docs.");
  });

  it("does nothing when stripping is disabled", () => {
    const payload = { messages: [{ role: "system", content: "You are opencode." }] };
    const result = sanitizeRequestSignatures(payload, { stripSignatures: false });
    expect(result.changed).toBe(false);
    expect(payload.messages[0]?.content).toBe("You are opencode.");
  });

  it("ignores contents by default and sanitizes them when enabled", () => {
    const payload = {
      contents: [{ role: "user", parts: [{ text: "opencode rocks" }] }],
    };

    sanitizeRequestSignatures(payload, { stripSignatures: true });
    expect(payload.contents[0]?.parts[0]?.text).toBe("opencode rocks");

    sanitizeRequestSignatures(payload, {
      stripSignatures: true,
      sanitizeUserMessages: true,
    });
    expect(payload.contents[0]?.parts[0]?.text).toBe("the agent rocks");
  });
});
