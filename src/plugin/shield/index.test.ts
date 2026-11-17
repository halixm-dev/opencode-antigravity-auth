import { describe, expect, it } from "vitest";

import { DEFAULT_SHIELD_CONFIG } from "../config";
import { applyShieldToRequestPayload } from "./index";

describe("applyShieldToRequestPayload", () => {
  it("applies signature and reasoning normalization when enabled", () => {
    const payload: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: "You are opencode." }] },
      reasoning_effort: "none",
    };

    const result = applyShieldToRequestPayload(payload, DEFAULT_SHIELD_CONFIG);

    expect(result.changed).toBe(true);
    expect(
      ((payload.systemInstruction as Record<string, unknown>).parts as Array<{ text: string }>)[0]
        ?.text,
    ).toBe("You are the agent.");
    expect(payload.reasoning_effort).toBeUndefined();
  });

  it("does nothing when the shield is disabled", () => {
    const payload: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: "You are opencode." }] },
      reasoning_effort: "none",
    };

    const result = applyShieldToRequestPayload(payload, {
      ...DEFAULT_SHIELD_CONFIG,
      enabled: false,
    });

    expect(result.changed).toBe(false);
    expect(payload.reasoning_effort).toBe("none");
  });

  it("can disable individual features", () => {
    const payload: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: "You are opencode." }] },
      reasoning_effort: "none",
    };

    const result = applyShieldToRequestPayload(payload, {
      ...DEFAULT_SHIELD_CONFIG,
      strip_signatures: false,
    });

    expect(result.changed).toBe(true);
    expect(
      ((payload.systemInstruction as Record<string, unknown>).parts as Array<{ text: string }>)[0]
        ?.text,
    ).toBe("You are opencode.");
    expect(payload.reasoning_effort).toBeUndefined();
  });
});
