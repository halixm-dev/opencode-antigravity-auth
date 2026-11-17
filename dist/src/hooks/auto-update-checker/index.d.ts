import type { AutoUpdateCheckerOptions } from "./types.js";
interface PluginClient {
    tui: {
        showToast(options: {
            body: {
                title?: string;
                message: string;
                variant: "info" | "warning" | "success" | "error";
                duration?: number;
            };
        }): Promise<unknown>;
    };
}
interface SessionCreatedEvent {
    type: "session.created";
    properties?: {
        info?: {
            parentID?: string;
        };
    };
}
type PluginEvent = SessionCreatedEvent | {
    type: string;
    properties?: unknown;
};
export declare function createAutoUpdateCheckerHook(client: PluginClient, directory: string, options?: AutoUpdateCheckerOptions): {
    event: ({ event }: {
        event: PluginEvent;
    }) => void;
};
export type { UpdateCheckResult, AutoUpdateCheckerOptions } from "./types.js";
export { checkForUpdate, getCachedVersion, getLatestVersion } from "./checker.js";
export { invalidatePackage, invalidateCache } from "./cache.js";
//# sourceMappingURL=index.d.ts.map