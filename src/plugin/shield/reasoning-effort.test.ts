import { describe, expect, it } from "vitest";

import { normalizeReasoningEffort } from "./reasoning-effort";

describe("normalizeReasoningEffort", () => {
  it("removes top-level reasoning_effort by default", () => {
    const payload: Record<string, unknown> = { reasoning_effort: "none" };
    const result = normalizeReasoningEffort(payload);

    expect(result.changed).toBe(true);
    expect(payload.reasoning_effort).toBeUndefined();
  });

  it("removes reasoningEffort camelCase aliases", () => {
    const payload: Record<string, unknown> = { reasoningEffort: "none" };
    normalizeReasoningEffort(payload);
    expect(payload.reasoningEffort).toBeUndefined();
  });

  it("removes reasoning effort from extra_body", () => {
    const payload: Record<string, unknown> = {
      extra_body: { reasoning_effort: "none", keep: true },
    };
    normalizeReasoningEffort(payload);

    const extraBody = payload.extra_body as Record<string, unknown>;
    expect(extraBody.reasoning_effort).toBeUndefined();
    expect(extraBody.keep).toBe(true);
  });

  it("removes reasoning effort from providerOptions.google", () => {
    const payload: Record<string, unknown> = {
      providerOptions: { google: { reasoningEffort: "none", includeThoughts: true } },
    };
    normalizeReasoningEffort(payload);

    const google = (payload.providerOptions as Record<string, unknown>).google as Record<
      string,
      unknown
    >;
    expect(google.reasoningEffort).toBeUndefined();
    expect(google.includeThoughts).toBe(true);
  });

  it("maps to a target level when configured", () => {
    const payload: Record<string, unknown> = { reasoning_effort: "none" };
    normalizeReasoningEffort(payload, { target: "low" });
    expect(payload.reasoning_effort).toBe("low");
  });

  it("only acts when the source matches", () => {
    const payload: Record<string, unknown> = { reasoning_effort: "high" };
    const result = normalizeReasoningEffort(payload, { source: "none" });

    expect(result.changed).toBe(false);
    expect(payload.reasoning_effort).toBe("high");
  });

  it("removes unsupported thinkingLevel values", () => {
    const payload: Record<string, unknown> = {
      generationConfig: { thinkingConfig: { thinkingLevel: "none" } },
    };

    normalizeReasoningEffort(payload);

    const thinkingConfig = (payload.generationConfig as Record<string, unknown>)
      .thinkingConfig as Record<string, unknown>;
    expect(thinkingConfig.thinkingLevel).toBeUndefined();
  });

  it("maps unsupported thinkingLevel values to the target", () => {
    const payload: Record<string, unknown> = {
      generationConfig: { thinkingConfig: { thinkingLevel: "off" } },
    };

    normalizeReasoningEffort(payload, { target: "medium" });

    const thinkingConfig = (payload.generationConfig as Record<string, unknown>)
      .thinkingConfig as Record<string, unknown>;
    expect(thinkingConfig.thinkingLevel).toBe("medium");
  });

  it("leaves valid thinkingLevel values alone", () => {
    const payload: Record<string, unknown> = {
      generationConfig: { thinkingConfig: { thinkingLevel: "high" } },
    };

    const result = normalizeReasoningEffort(payload);

    expect(result.changed).toBe(false);
    expect(
      ((payload.generationConfig as Record<string, unknown>).thinkingConfig as Record<string, unknown>)
        .thinkingLevel,
    ).toBe("high");
  });
});
