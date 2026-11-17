import type { PluginInput } from "@opencode-ai/plugin";
import type { AntigravityTokenExchangeResult } from "../antigravity/oauth";

export interface OAuthAuthDetails {
  type: "oauth";
  refresh: string;
  access?: string;
  expires?: number;
}

export interface ApiKeyAuthDetails {
  type: "api_key";
  key: string;
}

export interface NonOAuthAuthDetails {
  type: string;
  [key: string]: unknown;
}

export type AuthDetails = OAuthAuthDetails | ApiKeyAuthDetails | NonOAuthAuthDetails;

export type GetAuth = () => Promise<AuthDetails>;

export interface ProviderModel {
  cost?: {
    input: number;
    output: number;
  };
  [key: string]: unknown;
}

export interface Provider {
  models?: Record<string, ProviderModel>;
}

export interface LoaderResult {
  apiKey: string;
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

type ClientMethod<T extends (...args: never[]) => unknown> =
  (...args: Parameters<T>) => Promise<unknown>;

/** The transport only needs this small, version-independent client surface. */
export interface PluginClient {
  app: { log: ClientMethod<PluginInput["client"]["app"]["log"]> };
  auth: { set: ClientMethod<PluginInput["client"]["auth"]["set"]> };
  tui: { showToast: ClientMethod<PluginInput["client"]["tui"]["showToast"]> };
  session: {
    prompt: ClientMethod<PluginInput["client"]["session"]["prompt"]>;
    abort: ClientMethod<PluginInput["client"]["session"]["abort"]>;
    messages: ClientMethod<PluginInput["client"]["session"]["messages"]>;
  };
}

export interface PluginContext {
  client: PluginClient;
  directory: string;
  /** V2 owns session recovery and plugin/config updates itself. */
  runtimeVersion?: 1 | 2;
  /** Scoped outbound transport supplied by the V2 host wrapper. */
  fetch?: LoaderResult["fetch"];
  /** V2's discovered per-account model eligibility; absent on legacy hosts. */
  canUseAccount?: (account: { id?: string; refreshToken: string }, model: string) => boolean;
}

export type AuthPrompt =
  | {
      type: "text";
      key: string;
      message: string;
      placeholder?: string;
      validate?: (value: string) => string | undefined;
      condition?: (inputs: Record<string, string>) => boolean;
    }
  | {
      type: "select";
      key: string;
      message: string;
      options: Array<{ label: string; value: string; hint?: string }>;
      condition?: (inputs: Record<string, string>) => boolean;
    };

export type OAuthAuthorizationResult = { url: string; instructions: string } & (
  | {
      method: "auto";
      callback: () => Promise<AntigravityTokenExchangeResult>;
    }
  | {
      method: "code";
      callback: (code: string) => Promise<AntigravityTokenExchangeResult>;
    }
);

export interface AuthMethod {
  provider?: string;
  label: string;
  type: "oauth" | "api";
  prompts?: AuthPrompt[];
  authorize?: (inputs?: Record<string, string>) => Promise<OAuthAuthorizationResult>;
}

export interface PluginEventPayload {
  event: {
    type: string;
    properties?: unknown;
  };
}

export interface PluginResult {
  dispose?: () => Promise<void>;
  flush?: () => Promise<void>;
  auth: {
    provider: string;
    loader: (getAuth: GetAuth, provider: Provider) => Promise<LoaderResult | Record<string, unknown>>;
    methods: AuthMethod[];
  };
  event?: (payload: PluginEventPayload) => void;
  tool?: Record<string, unknown>;
}

export interface RefreshParts {
  refreshToken: string;
  projectId?: string;
  managedProjectId?: string;
}

export interface ProjectContextResult {
  auth: OAuthAuthDetails;
  effectiveProjectId: string;
}

