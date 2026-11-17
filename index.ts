import { AntigravityV2Plugin } from "./src/v2.ts";
import { AntigravityCLIOAuthPlugin as legacyServer } from "./src/plugin";

export {
  AntigravityCLIOAuthPlugin,
  GoogleOAuthPlugin,
} from "./src/plugin";

export {
  authorizeAntigravity,
  exchangeAntigravity,
} from "./src/antigravity/oauth";

export type {
  AntigravityAuthorization,
  AntigravityTokenExchangeResult,
} from "./src/antigravity/oauth";
/** One package entrypoint for OpenCode V2 and V1.18.29+ server plugins. */
export default { ...AntigravityV2Plugin, server: legacyServer };
