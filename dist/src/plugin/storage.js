import { promises as fs } from "node:fs";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, renameSync, copyFileSync, unlinkSync, } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { createHash, randomBytes } from "node:crypto";
import lockfile from "proper-lockfile";
import { createLogger } from "./logger.js";
const log = createLogger("storage");
/**
 * Files/directories that should be gitignored in the config directory.
 * These contain sensitive data or machine-specific state.
 */
export const GITIGNORE_ENTRIES = [
    ".gitignore",
    "antigravity-accounts.json",
    "antigravity-accounts.json.*.tmp",
    "antigravity-signature-cache.json",
    "antigravity-logs/",
];
/**
 * Ensures a .gitignore file exists in the config directory with entries
 * for sensitive files. Creates the file if missing, or appends missing
 * entries if it already exists.
 */
export async function ensureGitignore(configDir) {
    const gitignorePath = join(configDir, ".gitignore");
    try {
        let content;
        let existingLines = [];
        try {
            content = await fs.readFile(gitignorePath, "utf-8");
            existingLines = content.split("\n").map((line) => line.trim());
        }
        catch (error) {
            if (error.code !== "ENOENT") {
                return;
            }
            content = "";
        }
        const missingEntries = GITIGNORE_ENTRIES.filter((entry) => !existingLines.includes(entry));
        if (missingEntries.length === 0) {
            return;
        }
        if (content === "") {
            await fs.writeFile(gitignorePath, missingEntries.join("\n") + "\n", "utf-8");
            log.info("Created .gitignore in config directory");
        }
        else {
            const suffix = content.endsWith("\n") ? "" : "\n";
            await fs.appendFile(gitignorePath, suffix + missingEntries.join("\n") + "\n", "utf-8");
            log.info("Updated .gitignore with missing entries", {
                added: missingEntries,
            });
        }
    }
    catch {
        // Non-critical feature
    }
}
/**
 * Synchronous version of ensureGitignore for use in sync code paths.
 */
export function ensureGitignoreSync(configDir) {
    const gitignorePath = join(configDir, ".gitignore");
    try {
        let content;
        let existingLines = [];
        if (existsSync(gitignorePath)) {
            content = readFileSync(gitignorePath, "utf-8");
            existingLines = content.split("\n").map((line) => line.trim());
        }
        else {
            content = "";
        }
        const missingEntries = GITIGNORE_ENTRIES.filter((entry) => !existingLines.includes(entry));
        if (missingEntries.length === 0) {
            return;
        }
        if (content === "") {
            writeFileSync(gitignorePath, missingEntries.join("\n") + "\n", "utf-8");
            log.info("Created .gitignore in config directory");
        }
        else {
            const suffix = content.endsWith("\n") ? "" : "\n";
            appendFileSync(gitignorePath, suffix + missingEntries.join("\n") + "\n", "utf-8");
            log.info("Updated .gitignore with missing entries", {
                added: missingEntries,
            });
        }
    }
    catch {
        // Non-critical feature
    }
}
export const accountTokenHash = (token) => createHash("sha256").update(token).digest("hex").slice(0, 24);
export function matchesAccountToken(account, token) {
    const hash = accountTokenHash(token);
    return account.refreshToken === token || account.id === hash || account.refreshTokenHashes?.includes(hash) === true;
}
/** Update credentials without losing the identity of older native connections. */
export function updateAccountCredentials(account, parts) {
    account.id ??= accountTokenHash(account.refreshToken);
    if (parts.refreshToken && parts.refreshToken !== account.refreshToken) {
        account.refreshTokenHashes = [...new Set([...(account.refreshTokenHashes ?? []), accountTokenHash(account.refreshToken)])];
        account.refreshToken = parts.refreshToken;
    }
    if (parts.projectId !== undefined)
        account.projectId = parts.projectId;
    if (parts.managedProjectId !== undefined)
        account.managedProjectId = parts.managedProjectId;
}
export async function saveAccountCredentials(original, updated) {
    return updateAccounts(storage => {
        const current = storage.accounts.find(account => original.id ? account.id === original.id : account.refreshToken === original.refreshToken);
        if (current?.refreshToken === original.refreshToken)
            updateAccountCredentials(current, updated);
    });
}
/**
 * Gets the legacy Windows config directory (%APPDATA%\opencode).
 * Used for migration from older plugin versions.
 */
function getLegacyWindowsConfigDir() {
    return join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "opencode");
}
/**
 * Gets the config directory path, with the following precedence:
 * 1. OPENCODE_CONFIG_DIR env var (if set)
 * 2. ~/.config/opencode (all platforms, including Windows)
 *
 * On Windows, also checks for legacy %APPDATA%\opencode path for migration.
 */
function getConfigDir() {
    // 1. Check for explicit override via env var
    if (process.env.OPENCODE_CONFIG_DIR) {
        return process.env.OPENCODE_CONFIG_DIR;
    }
    // 2. Use ~/.config/opencode on all platforms (including Windows)
    const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
    return join(xdgConfig, "opencode");
}
/**
 * Migrates config from legacy Windows location to the new path.
 * Moves the file if legacy exists and new doesn't.
 * Returns true if migration was performed.
 */
function migrateLegacyWindowsConfig() {
    if (process.platform !== "win32") {
        return false;
    }
    const newPath = join(getConfigDir(), "antigravity-accounts.json");
    const legacyPath = join(getLegacyWindowsConfigDir(), "antigravity-accounts.json");
    // Only migrate if legacy exists and new doesn't
    if (!existsSync(legacyPath) || existsSync(newPath)) {
        return false;
    }
    try {
        // Ensure new config directory exists
        const newConfigDir = getConfigDir();
        mkdirSync(newConfigDir, { recursive: true });
        // Try rename first (atomic, but fails across filesystems)
        try {
            renameSync(legacyPath, newPath);
            log.info("Migrated Windows config via rename", { from: legacyPath, to: newPath });
        }
        catch {
            // Fallback: copy then delete (for cross-filesystem moves)
            copyFileSync(legacyPath, newPath);
            unlinkSync(legacyPath);
            log.info("Migrated Windows config via copy+delete", { from: legacyPath, to: newPath });
        }
        return true;
    }
    catch (error) {
        log.warn("Failed to migrate legacy Windows config, will use legacy path", {
            legacyPath,
            newPath,
            error: String(error),
        });
        return false;
    }
}
/**
 * Gets the storage path, migrating from legacy Windows location if needed.
 * On Windows, attempts to move legacy config to new path for alignment.
 */
function getStoragePathWithMigration() {
    const newPath = join(getConfigDir(), "antigravity-accounts.json");
    // On Windows, attempt to migrate legacy config to new location
    if (process.platform === "win32") {
        migrateLegacyWindowsConfig();
        // If migration failed and legacy still exists, fall back to it
        if (!existsSync(newPath)) {
            const legacyPath = join(getLegacyWindowsConfigDir(), "antigravity-accounts.json");
            if (existsSync(legacyPath)) {
                log.info("Using legacy Windows config path (migration failed)", {
                    legacyPath,
                    newPath,
                });
                return legacyPath;
            }
        }
    }
    return newPath;
}
export function getStoragePath() {
    return getStoragePathWithMigration();
}
/**
 * Gets the config directory path. Exported for use by other modules.
 */
export { getConfigDir };
const LOCK_OPTIONS = {
    stale: 10000,
    retries: {
        retries: 5,
        minTimeout: 100,
        maxTimeout: 1000,
        factor: 2,
    },
};
/**
 * Ensures the file has secure permissions (0600) on POSIX systems.
 * This is a best-effort operation and ignores errors on Windows/unsupported FS.
 */
async function ensureSecurePermissions(path) {
    try {
        await fs.chmod(path, 0o600);
    }
    catch {
        // Ignore errors (e.g. Windows, file doesn't exist, FS doesn't support chmod)
    }
}
async function ensureFileExists(path) {
    try {
        await fs.access(path);
    }
    catch {
        await fs.mkdir(dirname(path), { recursive: true });
        await fs.writeFile(path, JSON.stringify({ version: 4, accounts: [], activeIndex: 0 }, null, 2), { encoding: "utf-8", mode: 0o600 });
    }
}
async function withFileLock(path, fn) {
    await ensureFileExists(path);
    let release = null;
    try {
        release = await lockfile.lock(path, LOCK_OPTIONS);
        return await fn();
    }
    finally {
        if (release) {
            try {
                await release();
            }
            catch (unlockError) {
                log.warn("Failed to release lock", { error: String(unlockError) });
            }
        }
    }
}
function mergeAccountStorage(existing, incoming) {
    const accountMap = new Map();
    for (const acc of existing.accounts) {
        if (acc.refreshToken) {
            accountMap.set(acc.refreshToken, acc);
        }
    }
    for (const acc of incoming.accounts) {
        if (acc.refreshToken) {
            let existingAcc = accountMap.get(acc.refreshToken);
            if (!existingAcc && acc.id) {
                for (const [token, previous] of accountMap) {
                    if (previous.id === acc.id) {
                        existingAcc = previous;
                        accountMap.delete(token);
                        break;
                    }
                }
            }
            if (existingAcc) {
                accountMap.set(acc.refreshToken, {
                    ...existingAcc,
                    ...acc,
                    id: existingAcc.id ?? acc.id,
                    // Preserve manually configured projectId/managedProjectId if not in incoming
                    projectId: acc.projectId ?? existingAcc.projectId,
                    managedProjectId: acc.managedProjectId ?? existingAcc.managedProjectId,
                    rateLimitResetTimes: {
                        ...existingAcc.rateLimitResetTimes,
                        ...acc.rateLimitResetTimes,
                    },
                    lastUsed: Math.max(existingAcc.lastUsed || 0, acc.lastUsed || 0),
                });
            }
            else {
                accountMap.set(acc.refreshToken, acc);
            }
        }
    }
    return normalizeAccountStorage(incoming, Array.from(accountMap.values()));
}
export function deduplicateAccountsByEmail(accounts) {
    const emailToNewestIndex = new Map();
    const indicesToKeep = new Set();
    // First pass: find the newest account for each email (by lastUsed, then addedAt)
    for (let i = 0; i < accounts.length; i++) {
        const acc = accounts[i];
        if (!acc)
            continue;
        if (!acc.email) {
            // No email - keep this account (can't deduplicate without email)
            indicesToKeep.add(i);
            continue;
        }
        const existingIndex = emailToNewestIndex.get(acc.email);
        if (existingIndex === undefined) {
            emailToNewestIndex.set(acc.email, i);
            continue;
        }
        // Compare to find which is newer
        const existing = accounts[existingIndex];
        if (!existing) {
            emailToNewestIndex.set(acc.email, i);
            continue;
        }
        // Prefer higher lastUsed, then higher addedAt
        // Compare fields separately to avoid integer overflow with large timestamps
        const currLastUsed = acc.lastUsed || 0;
        const existLastUsed = existing.lastUsed || 0;
        const currAddedAt = acc.addedAt || 0;
        const existAddedAt = existing.addedAt || 0;
        const isNewer = currLastUsed > existLastUsed ||
            (currLastUsed === existLastUsed && currAddedAt > existAddedAt);
        if (isNewer) {
            emailToNewestIndex.set(acc.email, i);
        }
    }
    // Add all the newest email-based indices to the keep set
    for (const idx of emailToNewestIndex.values()) {
        indicesToKeep.add(idx);
    }
    // Build the deduplicated list, preserving original order for kept items
    const result = [];
    for (let i = 0; i < accounts.length; i++) {
        if (indicesToKeep.has(i)) {
            const acc = accounts[i];
            if (acc) {
                result.push(acc);
            }
        }
    }
    return result;
}
/** Preserve selected account identities when filtering, deduplicating, or merging. */
function normalizeAccountStorage(storage, candidateAccounts = storage.accounts) {
    const accounts = deduplicateAccountsByEmail(candidateAccounts.filter((account) => !!account &&
        typeof account === "object" &&
        typeof account.refreshToken === "string"));
    const remapIndex = (index, fallback) => {
        const selected = typeof index === "number" && Number.isInteger(index) && index >= 0
            ? storage.accounts[index]
            : undefined;
        if (selected && typeof selected.refreshToken === "string") {
            const tokenIndex = accounts.findIndex((account) => account.refreshToken === selected.refreshToken);
            if (tokenIndex >= 0)
                return tokenIndex;
            // A newer login for the same email may have replaced the selected token.
            const emailIndex = selected.email
                ? accounts.findIndex((account) => account.email === selected.email)
                : -1;
            if (emailIndex >= 0)
                return emailIndex;
        }
        return fallback;
    };
    const activeIndex = remapIndex(storage.activeIndex, 0);
    const activeIndexByFamily = storage.activeIndexByFamily
        ? { ...storage.activeIndexByFamily }
        : undefined;
    for (const family of ["claude", "gemini"]) {
        if (activeIndexByFamily?.[family] !== undefined) {
            activeIndexByFamily[family] = remapIndex(activeIndexByFamily[family], activeIndex);
        }
    }
    return { version: 4, accounts, activeIndex, activeIndexByFamily };
}
function migrateV1ToV2(v1) {
    return {
        version: 2,
        accounts: v1.accounts.map((acc) => {
            const rateLimitResetTimes = {};
            if (acc.isRateLimited &&
                acc.rateLimitResetTime &&
                acc.rateLimitResetTime > Date.now()) {
                rateLimitResetTimes.claude = acc.rateLimitResetTime;
                rateLimitResetTimes.gemini = acc.rateLimitResetTime;
            }
            return {
                email: acc.email,
                refreshToken: acc.refreshToken,
                projectId: acc.projectId,
                managedProjectId: acc.managedProjectId,
                addedAt: acc.addedAt,
                lastUsed: acc.lastUsed,
                lastSwitchReason: acc.lastSwitchReason,
                rateLimitResetTimes: Object.keys(rateLimitResetTimes).length > 0
                    ? rateLimitResetTimes
                    : undefined,
            };
        }),
        activeIndex: v1.activeIndex,
    };
}
export function migrateV2ToV3(v2) {
    return {
        version: 3,
        accounts: v2.accounts.map((acc) => {
            const rateLimitResetTimes = {};
            if (acc.rateLimitResetTimes?.claude &&
                acc.rateLimitResetTimes.claude > Date.now()) {
                rateLimitResetTimes.claude = acc.rateLimitResetTimes.claude;
            }
            if (acc.rateLimitResetTimes?.gemini &&
                acc.rateLimitResetTimes.gemini > Date.now()) {
                rateLimitResetTimes["gemini-antigravity"] =
                    acc.rateLimitResetTimes.gemini;
            }
            return {
                email: acc.email,
                refreshToken: acc.refreshToken,
                projectId: acc.projectId,
                managedProjectId: acc.managedProjectId,
                addedAt: acc.addedAt,
                lastUsed: acc.lastUsed,
                lastSwitchReason: acc.lastSwitchReason,
                rateLimitResetTimes: Object.keys(rateLimitResetTimes).length > 0
                    ? rateLimitResetTimes
                    : undefined,
            };
        }),
        activeIndex: v2.activeIndex,
    };
}
export function migrateV3ToV4(v3) {
    return {
        version: 4,
        accounts: v3.accounts.map((acc) => ({
            ...acc,
            fingerprint: undefined,
            fingerprintHistory: undefined,
        })),
        activeIndex: v3.activeIndex,
        activeIndexByFamily: v3.activeIndexByFamily,
    };
}
export async function loadAccounts() {
    try {
        const path = getStoragePath();
        // Ensure permissions are correct on load (fixes existing files)
        await ensureSecurePermissions(path);
        const content = await fs.readFile(path, "utf-8");
        const data = JSON.parse(content);
        if (!Array.isArray(data.accounts)) {
            log.warn("Invalid storage format, ignoring");
            return null;
        }
        let storage;
        if (data.version === 1) {
            log.info("Migrating account storage from v1 to v4");
            const v2 = migrateV1ToV2(data);
            const v3 = migrateV2ToV3(v2);
            storage = migrateV3ToV4(v3);
        }
        else if (data.version === 2) {
            log.info("Migrating account storage from v2 to v4");
            const v3 = migrateV2ToV3(data);
            storage = migrateV3ToV4(v3);
        }
        else if (data.version === 3) {
            log.info("Migrating account storage from v3 to v4");
            storage = migrateV3ToV4(data);
        }
        else if (data.version === 4) {
            storage = data;
        }
        else {
            log.warn("Unknown storage version, ignoring", {
                version: data.version,
            });
            return null;
        }
        storage = normalizeAccountStorage(storage);
        if (data.version !== 4) {
            try {
                await saveAccounts(storage);
                log.info("Migration to v4 complete");
            }
            catch (saveError) {
                log.warn("Failed to persist migrated storage", {
                    error: String(saveError),
                });
            }
        }
        return storage;
    }
    catch (error) {
        const code = error.code;
        if (code === "ENOENT") {
            return null;
        }
        log.error("Failed to load account storage", { error: String(error) });
        return null;
    }
}
export async function saveAccounts(storage) {
    const path = getStoragePath();
    const configDir = dirname(path);
    await fs.mkdir(configDir, { recursive: true });
    await ensureGitignore(configDir);
    await withFileLock(path, async () => {
        const existing = await loadAccountsUnsafe();
        const merged = existing
            ? mergeAccountStorage(existing, storage)
            : normalizeAccountStorage(storage);
        const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
        const content = JSON.stringify(merged, null, 2);
        try {
            await fs.writeFile(tempPath, content, { encoding: "utf-8", mode: 0o600 });
            await fs.rename(tempPath, path);
        }
        catch (error) {
            // Clean up temp file on failure to prevent accumulation
            try {
                await fs.unlink(tempPath);
            }
            catch {
                // Ignore cleanup errors (file may not exist)
            }
            throw error;
        }
    });
}
/** Apply a targeted change to the latest pool while holding its file lock. */
export async function updateAccounts(update) {
    const path = getStoragePath();
    await fs.mkdir(dirname(path), { recursive: true });
    await ensureGitignore(dirname(path));
    return withFileLock(path, async () => {
        const storage = await loadAccountsUnsafe();
        if (!storage)
            return null;
        update(storage);
        const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
        try {
            await fs.writeFile(tempPath, JSON.stringify(storage, null, 2), { encoding: "utf-8", mode: 0o600 });
            await fs.rename(tempPath, path);
        }
        catch (error) {
            try {
                await fs.unlink(tempPath);
            }
            catch { /* The temporary file may not exist. */ }
            throw error;
        }
        return storage;
    });
}
/**
 * Save accounts storage by replacing the entire file (no merge).
 * Use this for destructive operations like delete where we need to
 * remove accounts that would otherwise be merged back from existing storage.
 */
export async function saveAccountsReplace(storage) {
    const path = getStoragePath();
    const configDir = dirname(path);
    await fs.mkdir(configDir, { recursive: true });
    await ensureGitignore(configDir);
    await withFileLock(path, async () => {
        const tempPath = `${path}.${randomBytes(6).toString("hex")}.tmp`;
        const content = JSON.stringify(storage, null, 2);
        try {
            await fs.writeFile(tempPath, content, { encoding: "utf-8", mode: 0o600 });
            await fs.rename(tempPath, path);
        }
        catch (error) {
            try {
                await fs.unlink(tempPath);
            }
            catch {
                // Ignore cleanup errors
            }
            throw error;
        }
    });
}
async function loadAccountsUnsafe() {
    try {
        const path = getStoragePath();
        // Ensure permissions are correct on load (fixes existing files)
        await ensureSecurePermissions(path);
        const content = await fs.readFile(path, "utf-8");
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed.accounts))
            return null;
        if (parsed.version === 1) {
            return normalizeAccountStorage(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(parsed))));
        }
        if (parsed.version === 2) {
            return normalizeAccountStorage(migrateV3ToV4(migrateV2ToV3(parsed)));
        }
        if (parsed.version === 3) {
            return normalizeAccountStorage(migrateV3ToV4(parsed));
        }
        return parsed.version === 4 ? normalizeAccountStorage(parsed) : null;
    }
    catch (error) {
        const code = error.code;
        if (code === "ENOENT") {
            return null;
        }
        return null;
    }
}
export async function clearAccounts() {
    try {
        const path = getStoragePath();
        await fs.unlink(path);
    }
    catch (error) {
        const code = error.code;
        if (code !== "ENOENT") {
            log.error("Failed to clear account storage", { error: String(error) });
        }
    }
}
//# sourceMappingURL=storage.js.map