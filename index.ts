export {
  AntigravityCLIOAuthPlugin,
  GoogleOAuthPlugin,
} from "./src/plugin";

// OpenCode loads plugins via default export.
import { AntigravityCLIOAuthPlugin as _AntigravityPlugin } from "./src/plugin";
export default _AntigravityPlugin;

export {
  authorizeAntigravity,
  exchangeAntigravity,
} from "./src/antigravity/oauth";

export type {
  AntigravityAuthorization,
  AntigravityTokenExchangeResult,
} from "./src/antigravity/oauth";

