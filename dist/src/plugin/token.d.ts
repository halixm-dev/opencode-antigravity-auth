import type { OAuthAuthDetails, PluginClient } from "./types.js";
export declare class AntigravityTokenRefreshError extends Error {
    code?: string;
    description?: string;
    status: number;
    statusText: string;
    constructor(options: {
        message: string;
        code?: string;
        description?: string;
        status: number;
        statusText: string;
    });
}
/** Share rotations across native auth, transport, discovery, and quota checks. */
export declare function refreshAccessToken(auth: OAuthAuthDetails, client: PluginClient, providerId: string): Promise<OAuthAuthDetails | undefined>;
//# sourceMappingURL=token.d.ts.map