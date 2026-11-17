export { AntigravityCLIOAuthPlugin, GoogleOAuthPlugin, } from "./src/plugin.js";
export { authorizeAntigravity, exchangeAntigravity, } from "./src/antigravity/oauth.js";
export type { AntigravityAuthorization, AntigravityTokenExchangeResult, } from "./src/antigravity/oauth.js";
/** One package entrypoint for OpenCode V2 and V1.18.29+ server plugins. */
declare const _default: {
    server: ({ client, directory, runtimeVersion, fetch: sendFetch, canUseAccount }: import("./src/plugin/types.ts").PluginContext) => Promise<import("./src/plugin/types.ts").PluginResult>;
    id: string;
    setup: (context: import("@opencode/plugin/promise/plugin").Context) => Promise<import("@opencode/plugin/promise/plugin").Cleanup | void> | import("@opencode/plugin/promise/plugin").Cleanup | void;
};
export default _default;
//# sourceMappingURL=index.d.ts.map