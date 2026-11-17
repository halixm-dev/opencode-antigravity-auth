import { AntigravityV2Plugin } from "./src/v2.js";
import { AntigravityCLIOAuthPlugin as legacyServer } from "./src/plugin.js";
export { AntigravityCLIOAuthPlugin, GoogleOAuthPlugin, } from "./src/plugin.js";
export { authorizeAntigravity, exchangeAntigravity, } from "./src/antigravity/oauth.js";
/** One package entrypoint for OpenCode V2 and V1.18.29+ server plugins. */
export default { ...AntigravityV2Plugin, server: legacyServer };
//# sourceMappingURL=index.js.map