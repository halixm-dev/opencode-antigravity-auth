export {
  AntigravityCLIOAuthPlugin,
  GoogleOAuthPlugin,
} from "./src/plugin.js";

// OpenCode loads plugins via default export.
import { AntigravityCLIOAuthPlugin as _AntigravityPlugin } from "./src/plugin.js";
export default _AntigravityPlugin;

export {
  authorizeAntigravity,
  exchangeAntigravity,
} from "./src/antigravity/oauth.js";

export type {
  AntigravityAuthorization,
  AntigravityTokenExchangeResult,
} from "./src/antigravity/oauth.js";
