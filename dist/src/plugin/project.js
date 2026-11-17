import { ANTIGRAVITY_DEFAULT_PROJECT_ID, ANTIGRAVITY_ENDPOINT, ANTIGRAVITY_GOOG_API_CLIENT, getAntigravityOnboardUserAgent, getAntigravityUserAgent, getAntigravityVersion, } from "../constants.js";
import { formatRefreshParts, parseRefreshParts } from "./auth.js";
import { createLogger } from "./logger.js";
const log = createLogger("project");
const projectContextResultCache = new Map();
const projectContextPendingCache = new Map();
const LOAD_TIMEOUT_MS = 10000;
const ONBOARD_TIMEOUT_MS = 30000;
/** Tier used for onboarding when loadCodeAssist does not advertise one. */
const DEFAULT_TIER_ID = "free-tier";
/**
 * loadCodeAssist metadata sent by the Antigravity Hub. Platform and plugin type are
 * omitted: MACOS/WINDOWS are not valid Cloud Code platform values.
 */
const LOAD_CODE_ASSIST_METADATA = { ideType: "ANTIGRAVITY" };
/**
 * onboardUser metadata uses the snake_case control-plane fields and the Hub version.
 */
function buildOnboardMetadata() {
    return {
        ide_type: "ANTIGRAVITY",
        ide_version: getAntigravityVersion(),
        ide_name: "antigravity",
    };
}
/**
 * Selects the tier to onboard with: the default allowed tier, then the first allowed
 * tier, then the current tier, then free-tier.
 */
function getDefaultTierId(payload) {
    const allowedTiers = payload?.allowedTiers ?? [];
    for (const tier of allowedTiers) {
        if (tier?.isDefault && tier.id) {
            return tier.id;
        }
    }
    return allowedTiers[0]?.id || payload?.currentTier?.id || DEFAULT_TIER_ID;
}
/**
 * Promise-based delay utility.
 */
function wait(ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}
async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Extracts a cloudaicompanion project id from its string or `{ id }` form.
 */
function extractProjectId(value) {
    const id = typeof value === "string" ? value : value?.id;
    const trimmed = typeof id === "string" ? id.trim() : "";
    return trimmed || undefined;
}
/**
 * Extracts the cloudaicompanion project id from loadCodeAssist responses.
 */
function extractManagedProjectId(payload) {
    return payload ? extractProjectId(payload.cloudaicompanionProject) : undefined;
}
/**
 * Generates a cache key for project context based on refresh token.
 */
function getCacheKey(auth) {
    const refresh = auth.refresh?.trim();
    return refresh ? refresh : undefined;
}
/**
 * Clears cached project context results and pending promises, globally or for a refresh key.
 */
export function invalidateProjectContextCache(refresh) {
    if (!refresh) {
        projectContextPendingCache.clear();
        projectContextResultCache.clear();
        return;
    }
    projectContextPendingCache.delete(refresh);
    projectContextResultCache.delete(refresh);
}
/**
 * Loads managed project information for the given access token from the Antigravity host.
 */
export async function loadManagedProject(accessToken) {
    try {
        const response = await fetchWithTimeout(`${ANTIGRAVITY_ENDPOINT}/v1internal:loadCodeAssist`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
                "User-Agent": getAntigravityUserAgent(),
            },
            body: JSON.stringify({ metadata: LOAD_CODE_ASSIST_METADATA }),
        }, LOAD_TIMEOUT_MS);
        if (!response.ok) {
            log.debug("loadCodeAssist failed", { endpoint: ANTIGRAVITY_ENDPOINT, status: response.status });
            return null;
        }
        return (await response.json());
    }
    catch (error) {
        log.debug("Failed to load managed project", { endpoint: ANTIGRAVITY_ENDPOINT, error: String(error) });
        return null;
    }
}
/**
 * Onboards a managed project for the user, polling until the operation completes.
 */
export async function onboardManagedProject(accessToken, tierId, projectId, attempts = 10, delayMs = 5000) {
    const requestBody = {
        tier_id: tierId,
        metadata: buildOnboardMetadata(),
    };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const response = await fetchWithTimeout(`${ANTIGRAVITY_ENDPOINT}/v1internal:onboardUser`, {
                method: "POST",
                headers: {
                    Accept: "*/*",
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${accessToken}`,
                    "User-Agent": getAntigravityOnboardUserAgent(),
                    "X-Goog-Api-Client": ANTIGRAVITY_GOOG_API_CLIENT,
                },
                body: JSON.stringify(requestBody),
            }, ONBOARD_TIMEOUT_MS);
            if (!response.ok) {
                log.debug("onboardUser failed", { endpoint: ANTIGRAVITY_ENDPOINT, status: response.status });
                return undefined;
            }
            const payload = (await response.json());
            if (payload.done) {
                return extractProjectId(payload.response?.cloudaicompanionProject) ?? projectId;
            }
        }
        catch (error) {
            log.debug("Failed to onboard managed project", { endpoint: ANTIGRAVITY_ENDPOINT, error: String(error) });
            return undefined;
        }
        if (attempt < attempts - 1) {
            await wait(delayMs);
        }
    }
    return undefined;
}
/**
 * Resolves an effective project ID for the current auth state, caching results per refresh token.
 */
export async function ensureProjectContext(auth) {
    const accessToken = auth.access;
    if (!accessToken) {
        return { auth, effectiveProjectId: "" };
    }
    const cacheKey = getCacheKey(auth);
    if (cacheKey) {
        const cached = projectContextResultCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const pending = projectContextPendingCache.get(cacheKey);
        if (pending) {
            return pending;
        }
    }
    const resolveContext = async () => {
        const parts = parseRefreshParts(auth.refresh);
        if (parts.managedProjectId) {
            return { auth, effectiveProjectId: parts.managedProjectId };
        }
        const fallbackProjectId = ANTIGRAVITY_DEFAULT_PROJECT_ID;
        const persistManagedProject = async (managedProjectId) => {
            const updatedAuth = {
                ...auth,
                refresh: formatRefreshParts({
                    refreshToken: parts.refreshToken,
                    projectId: parts.projectId,
                    managedProjectId,
                }),
            };
            return { auth: updatedAuth, effectiveProjectId: managedProjectId };
        };
        // Try to resolve a managed project from Antigravity if possible.
        const loadPayload = await loadManagedProject(accessToken);
        const resolvedManagedProjectId = extractManagedProjectId(loadPayload);
        if (resolvedManagedProjectId) {
            return persistManagedProject(resolvedManagedProjectId);
        }
        // No managed project found - try to auto-provision one via onboarding.
        // This handles accounts that were added before managed project provisioning was required.
        const tierId = getDefaultTierId(loadPayload);
        log.debug("Auto-provisioning managed project", { tierId, projectId: parts.projectId });
        const provisionedProjectId = await onboardManagedProject(accessToken, tierId, parts.projectId);
        if (provisionedProjectId) {
            log.debug("Successfully provisioned managed project", { provisionedProjectId });
            return persistManagedProject(provisionedProjectId);
        }
        log.warn("Failed to provision managed project - account may not work correctly", {
            hasProjectId: !!parts.projectId,
        });
        if (parts.projectId) {
            return { auth, effectiveProjectId: parts.projectId };
        }
        // No project id present in auth; fall back to the hardcoded id for requests.
        return { auth, effectiveProjectId: fallbackProjectId };
    };
    if (!cacheKey) {
        return resolveContext();
    }
    const promise = resolveContext()
        .then((result) => {
        const nextKey = getCacheKey(result.auth) ?? cacheKey;
        projectContextPendingCache.delete(cacheKey);
        projectContextResultCache.set(nextKey, result);
        if (nextKey !== cacheKey) {
            projectContextResultCache.delete(cacheKey);
        }
        return result;
    })
        .catch((error) => {
        projectContextPendingCache.delete(cacheKey);
        throw error;
    });
    projectContextPendingCache.set(cacheKey, promise);
    return promise;
}
//# sourceMappingURL=project.js.map