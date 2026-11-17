import { beforeAll, describe, expect, it, vi } from "vitest";
import type { HeaderStyle, ModelFamily } from "./accounts";

type ResolveQuotaFallbackHeaderStyle = (input: {
  family: ModelFamily;
  headerStyle: HeaderStyle;
  alternateStyle: HeaderStyle | null;
}) => HeaderStyle | null;

type GetHeaderStyleFromUrl = (
  urlString: string,
  family: ModelFamily,
  cliFirst?: boolean,
) => HeaderStyle;

type ResolveHeaderRoutingDecision = (
  urlString: string,
  family: ModelFamily,
  config: unknown,
) => {
  cliFirst: boolean;
  preferredHeaderStyle: HeaderStyle;
  explicitQuota: boolean;
  allowQuotaFallback: boolean;
};

type IsMissingLicenseError = (bodyText: string) => boolean;

let resolveQuotaFallbackHeaderStyle: ResolveQuotaFallbackHeaderStyle | undefined;
let getHeaderStyleFromUrl: GetHeaderStyleFromUrl | undefined;
let resolveHeaderRoutingDecision: ResolveHeaderRoutingDecision | undefined;
let isMissingLicenseError: IsMissingLicenseError | undefined;

beforeAll(async () => {
  vi.mock("@opencode-ai/plugin", () => ({
    tool: vi.fn(),
  }));

  const { __testExports } = await import("../plugin");
  resolveQuotaFallbackHeaderStyle = (__testExports as {
    resolveQuotaFallbackHeaderStyle?: ResolveQuotaFallbackHeaderStyle;
  }).resolveQuotaFallbackHeaderStyle;
  getHeaderStyleFromUrl = (__testExports as {
    getHeaderStyleFromUrl?: GetHeaderStyleFromUrl;
  }).getHeaderStyleFromUrl;
  resolveHeaderRoutingDecision = (__testExports as {
    resolveHeaderRoutingDecision?: ResolveHeaderRoutingDecision;
  }).resolveHeaderRoutingDecision;
  isMissingLicenseError = (__testExports as {
    isMissingLicenseError?: IsMissingLicenseError;
  }).isMissingLicenseError;
});

describe("quota fallback direction", () => {
  it("falls back from gemini-cli to antigravity when alternate quota is available", () => {
    const result = resolveQuotaFallbackHeaderStyle?.({
      family: "gemini",
      headerStyle: "gemini-cli",
      alternateStyle: "antigravity",
    });

    expect(result).toBe("antigravity");
  });

  it("falls back from antigravity to gemini-cli when alternate quota is available", () => {
    const result = resolveQuotaFallbackHeaderStyle?.({
      family: "gemini",
      headerStyle: "antigravity",
      alternateStyle: "gemini-cli",
    });

    expect(result).toBe("gemini-cli");
  });

  it("returns null when no alternate quota is available", () => {
    const result = resolveQuotaFallbackHeaderStyle?.({
      family: "gemini",
      headerStyle: "antigravity",
      alternateStyle: null,
    });

    expect(result).toBeNull();
  });
});

describe("header style resolution", () => {
  it("uses gemini-cli for unsuffixed Gemini models when cli_first is enabled", () => {
    const headerStyle = getHeaderStyleFromUrl?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      true,
    );

    expect(headerStyle).toBe("gemini-cli");
  });

  it("keeps antigravity for unsuffixed Gemini models when cli_first is disabled", () => {
    const headerStyle = getHeaderStyleFromUrl?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      false,
    );

    expect(headerStyle).toBe("antigravity");
  });

  it("keeps antigravity for explicit antigravity prefix when cli_first is enabled", () => {
    const headerStyle = getHeaderStyleFromUrl?.(
      "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3-flash:streamGenerateContent",
      "gemini",
      true,
    );

    expect(headerStyle).toBe("antigravity");
  });

  it("keeps antigravity for Claude when cli_first is enabled", () => {
    const headerStyle = getHeaderStyleFromUrl?.(
      "https://generativelanguage.googleapis.com/v1beta/models/claude-opus-4-6-thinking:streamGenerateContent",
      "claude",
      true,
    );

    expect(headerStyle).toBe("antigravity");
  });
});

describe("header routing decision", () => {
  it("defaults to antigravity-first for unsuffixed Gemini when cli_first is disabled", () => {
    const decision = resolveHeaderRoutingDecision?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      {
        cli_first: false,
      },
    );

    expect(decision).toMatchObject({
      cliFirst: false,
      preferredHeaderStyle: "antigravity",
      explicitQuota: false,
      allowQuotaFallback: true,
    });
  });

  it("uses gemini-cli-first for unsuffixed Gemini when cli_first is enabled", () => {
    const decision = resolveHeaderRoutingDecision?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      {
        cli_first: true,
      },
    );

    expect(decision).toMatchObject({
      cliFirst: true,
      preferredHeaderStyle: "gemini-cli",
      explicitQuota: false,
      allowQuotaFallback: true,
    });
  });

  it("keeps explicit antigravity prefix as primary route while fallback remains available", () => {
    const decision = resolveHeaderRoutingDecision?.(
      "https://generativelanguage.googleapis.com/v1beta/models/antigravity-gemini-3-flash:streamGenerateContent",
      "gemini",
      {
        cli_first: true,
      },
    );

    expect(decision).toMatchObject({
      cliFirst: true,
      preferredHeaderStyle: "antigravity",
      explicitQuota: true,
      allowQuotaFallback: true,
    });
  });

  it("ignores legacy quota_fallback when deciding Gemini fallback availability", () => {
    const decision = resolveHeaderRoutingDecision?.(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:streamGenerateContent",
      "gemini",
      {
        cli_first: false,
        quota_fallback: false,
      },
    );

    expect(decision).toMatchObject({
      cliFirst: false,
      preferredHeaderStyle: "antigravity",
      explicitQuota: false,
      allowQuotaFallback: true,
    });
  });
});

describe("missing license detection", () => {
  const licenseBody = `[{
  "error": {
    "code": 403,
    "message": "You do not have a valid license of this product. Please contact your administrator to request a license. If you are not an enterprise user and believe you are receiving this message as an error, please try using the latest version and logging in again. (#3501)",
    "status": "PERMISSION_DENIED",
    "details": [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        "reason": "SUBSCRIPTION_REQUIRED",
        "domain": "cloudaicompanion.googleapis.com"
      }
    ]
  }
}]`;

  it("detects the Cloud Code #3501 subscription error", () => {
    expect(isMissingLicenseError?.(licenseBody)).toBe(true);
  });

  it("detects escaped and truncated license bodies", () => {
    expect(isMissingLicenseError?.("{\"error\":\"SUBSCRIPTION_REQUIRED\"}")).toBe(true);
    expect(isMissingLicenseError?.("data: {\\\"reason\\\":\\\"#3501\\\"}")).toBe(true);
  });

  it("ignores verification, quota, and unrelated 403 bodies", () => {
    expect(
      isMissingLicenseError?.('{"error":{"status":"PERMISSION_DENIED","reason":"validation_required"}}'),
    ).toBe(false);
    expect(
      isMissingLicenseError?.('{"error":{"status":"RESOURCE_EXHAUSTED","reason":"rateLimitExceeded"}}'),
    ).toBe(false);
    expect(isMissingLicenseError?.("")).toBe(false);
  });
});
