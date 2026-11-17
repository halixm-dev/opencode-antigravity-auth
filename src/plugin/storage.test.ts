import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  deduplicateAccountsByEmail,
  migrateV2ToV3,
  loadAccounts,
  saveAccounts,
  matchesAccountToken,
  updateAccountCredentials,
  type AccountMetadataV3,
  type AccountMetadata,
  type AccountStorage,
  type AccountStorageV4,
} from "./storage";
import { AccountManager } from "./accounts";
import { promises as fs } from "node:fs";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";

vi.mock("proper-lockfile", () => ({
  default: {
    lock: vi.fn().mockResolvedValue(vi.fn().mockResolvedValue(undefined)),
  },
}));

describe("native connection identity", () => {
  it("recognizes original and intermediate native credentials after repeated rotation without email", () => {
    const account: AccountMetadataV3 = { id: "persistent-id", refreshToken: "first-token", addedAt: 1, lastUsed: 1, enabled: false };
    updateAccountCredentials(account, { refreshToken: "second-token" });
    updateAccountCredentials(account, { refreshToken: "third-token", managedProjectId: "resolved-project" });
    for (const token of ["first-token", "second-token", "third-token"]) expect(matchesAccountToken(account, token)).toBe(true);
    expect(matchesAccountToken(account, "unrelated-token")).toBe(false);
    expect(account).toMatchObject({ id: "persistent-id", enabled: false, refreshToken: "third-token", managedProjectId: "resolved-project" });
    expect(JSON.stringify(account.refreshTokenHashes)).not.toContain("token");
  });
});

describe("deduplicateAccountsByEmail", () => {
  it("returns empty array for empty input", () => {
    const result = deduplicateAccountsByEmail([]);
    expect(result).toEqual([]);
  });

  it("returns single account unchanged", () => {
    const accounts: AccountMetadata[] = [
      {
        email: "test@example.com",
        refreshToken: "r1",
        addedAt: 1000,
        lastUsed: 2000,
      },
    ];
    const result = deduplicateAccountsByEmail(accounts);
    expect(result).toEqual(accounts);
  });

  it("keeps accounts without email (cannot deduplicate)", () => {
    const accounts: AccountMetadata[] = [
      { refreshToken: "r1", addedAt: 1000, lastUsed: 2000 },
      { refreshToken: "r2", addedAt: 1100, lastUsed: 2100 },
    ];
    const result = deduplicateAccountsByEmail(accounts);
    expect(result).toHaveLength(2);
    expect(result[0]?.refreshToken).toBe("r1");
    expect(result[1]?.refreshToken).toBe("r2");
  });

  it("deduplicates accounts with same email, keeping newest by lastUsed", () => {
    const accounts: AccountMetadata[] = [
      {
        email: "test@example.com",
        refreshToken: "old-token",
        addedAt: 1000,
        lastUsed: 1000,
      },
      {
        email: "test@example.com",
        refreshToken: "new-token",
        addedAt: 2000,
        lastUsed: 3000,
      },
    ];
    const result = deduplicateAccountsByEmail(accounts);
    expect(result).toHaveLength(1);
    expect(result[0]?.refreshToken).toBe("new-token");
    expect(result[0]?.email).toBe("test@example.com");
  });

  it("deduplicates accounts with same email, keeping newest by addedAt when lastUsed is equal", () => {
    const accounts: AccountMetadata[] = [
      {
        email: "test@example.com",
        refreshToken: "old-token",
        addedAt: 1000,
        lastUsed: 0,
      },
      {
        email: "test@example.com",
        refreshToken: "new-token",
        addedAt: 2000,
        lastUsed: 0,
      },
    ];
    const result = deduplicateAccountsByEmail(accounts);
    expect(result).toHaveLength(1);
    expect(result[0]?.refreshToken).toBe("new-token");
  });

  it("handles multiple duplicate emails correctly", () => {
    const accounts: AccountMetadata[] = [
      {
        email: "alice@example.com",
        refreshToken: "alice-old",
        addedAt: 1000,
        lastUsed: 1000,
      },
      {
        email: "bob@example.com",
        refreshToken: "bob-old",
        addedAt: 1000,
        lastUsed: 1000,
      },
      {
        email: "alice@example.com",
        refreshToken: "alice-new",
        addedAt: 2000,
        lastUsed: 3000,
      },
      {
        email: "bob@example.com",
        refreshToken: "bob-new",
        addedAt: 2000,
        lastUsed: 3000,
      },
      {
        email: "alice@example.com",
        refreshToken: "alice-mid",
        addedAt: 1500,
        lastUsed: 2000,
      },
    ];
    const result = deduplicateAccountsByEmail(accounts);
    expect(result).toHaveLength(2);

    const alice = result.find((a) => a.email === "alice@example.com");
    const bob = result.find((a) => a.email === "bob@example.com");

    expect(alice?.refreshToken).toBe("alice-new");
    expect(bob?.refreshToken).toBe("bob-new");
  });

  it("preserves order of kept accounts based on newest entry index", () => {
    const accounts: AccountMetadata[] = [
      {
        email: "first@example.com",
        refreshToken: "first-old",
        addedAt: 1000,
        lastUsed: 1000,
      },
      {
        email: "second@example.com",
        refreshToken: "second-new",
        addedAt: 3000,
        lastUsed: 3000,
      },
      {
        email: "first@example.com",
        refreshToken: "first-new",
        addedAt: 2000,
        lastUsed: 2000,
      },
    ];
    const result = deduplicateAccountsByEmail(accounts);
    expect(result).toHaveLength(2);
    // Kept entries are at indices 1 (second@) and 2 (first@), so order is second, first
    expect(result[0]?.email).toBe("second@example.com");
    expect(result[1]?.email).toBe("first@example.com");
  });

  it("mixes accounts with and without email correctly", () => {
    const accounts: AccountMetadata[] = [
      {
        email: "test@example.com",
        refreshToken: "r1",
        addedAt: 1000,
        lastUsed: 1000,
      },
      { refreshToken: "no-email-1", addedAt: 1500, lastUsed: 1500 },
      {
        email: "test@example.com",
        refreshToken: "r2",
        addedAt: 2000,
        lastUsed: 2000,
      },
      { refreshToken: "no-email-2", addedAt: 2500, lastUsed: 2500 },
    ];
    const result = deduplicateAccountsByEmail(accounts);
    expect(result).toHaveLength(3);

    // no-email-1 at index 1
    // r2 (newest for test@example.com) at index 2
    // no-email-2 at index 3
    expect(result[0]?.refreshToken).toBe("no-email-1");
    expect(result[1]?.refreshToken).toBe("r2");
    expect(result[2]?.refreshToken).toBe("no-email-2");
  });

  it("handles exact scenario from issue #24 (11 duplicate accounts)", () => {
    // Simulate user logging in 11 times with the same account
    const accounts: AccountMetadata[] = [];
    for (let i = 0; i < 11; i++) {
      accounts.push({
        email: "user@example.com",
        refreshToken: `token-${i}`,
        addedAt: 1000 + i * 100,
        lastUsed: 1000 + i * 100,
      });
    }

    const result = deduplicateAccountsByEmail(accounts);
    expect(result).toHaveLength(1);
    expect(result[0]?.refreshToken).toBe("token-10"); // The newest one
    expect(result[0]?.email).toBe("user@example.com");
  });
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn().mockResolvedValue(undefined),
      access: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn(),
      rename: vi.fn().mockResolvedValue(undefined),
      appendFile: vi.fn(),
      chmod: vi.fn().mockResolvedValue(undefined),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  };
});

describe("Account selection normalization", () => {
  const account = (refreshToken: string, email?: string) => ({
    refreshToken,
    email,
    addedAt: 1,
    lastUsed: 1,
  });

  function mockStorage(storage: unknown): void {
    vi.mocked(fs.readFile).mockImplementation((path) =>
      Promise.resolve(
        String(path).endsWith(".gitignore") ? "" : JSON.stringify(storage),
      ),
    );
  }

  function savedStorage(): AccountStorageV4 {
    const saveCall = vi.mocked(fs.writeFile).mock.calls.find(
      (call) => String(call[0]).endsWith(".tmp"),
    );
    if (!saveCall) throw new Error("Storage was not saved");
    return JSON.parse(String(saveCall[1]));
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the fresh login selected for both families after 14 accounts become 13", async () => {
    const accounts = Array.from({ length: 13 }, (_, i) =>
      account(`revoked-${i}`, `user-${i}@example.com`),
    );
    accounts.push({
      ...account("fresh-token", "user-4@example.com"),
      addedAt: 2,
      lastUsed: 2,
    });
    mockStorage({
      version: 4,
      accounts,
      activeIndex: 13,
      activeIndexByFamily: { claude: 13, gemini: 13 },
    });

    const loaded = await loadAccounts();

    expect(loaded?.accounts.map((a) => a.refreshToken)).toEqual(
      accounts.filter((a) => a.refreshToken !== "revoked-4").map((a) => a.refreshToken),
    );
    expect(loaded?.activeIndex).toBe(12);
    expect(loaded?.activeIndexByFamily).toEqual({ claude: 12, gemini: 12 });
    const manager = new AccountManager(undefined, loaded);
    expect(manager.getCurrentOrNextForFamily("claude")?.parts.refreshToken).toBe("fresh-token");
    expect(manager.getCurrentOrNextForFamily("gemini")?.parts.refreshToken).toBe("fresh-token");
  });

  it("follows the email winner when the selected token is deduplicated", async () => {
    mockStorage({
      version: 4,
      accounts: [
        account("old-token", "same@example.com"),
        account("other-token", "other@example.com"),
        { ...account("new-token", "same@example.com"), lastUsed: 2 },
        account("last-token"),
      ],
      activeIndex: 0,
      activeIndexByFamily: { claude: 1, gemini: 3 },
    });

    const loaded = await loadAccounts();

    expect(loaded?.activeIndex).toBe(1);
    expect(loaded?.accounts[loaded.activeIndex]?.refreshToken).toBe("new-token");
    expect(loaded?.activeIndexByFamily).toEqual({ claude: 0, gemini: 2 });
  });

  it("preserves token identity before considering a matching email", async () => {
    mockStorage({
      version: 4,
      accounts: [
        account("selected-token", "old@example.com"),
        account("selected-token", "updated@example.com"),
        { ...account("replacement-token", "old@example.com"), lastUsed: 2 },
      ],
      activeIndex: 0,
      activeIndexByFamily: { claude: 0 },
    });

    const loaded = await loadAccounts();

    expect(loaded?.activeIndex).toBe(0);
    expect(loaded?.activeIndexByFamily).toEqual({ claude: 0 });
    expect(loaded?.accounts[0]?.refreshToken).toBe("selected-token");
  });

  it("remaps independent selections after filtering invalid rows", async () => {
    mockStorage({
      version: 4,
      accounts: [
        null,
        { refreshToken: 123, email: "invalid@example.com" },
        account("selected-token"),
        account("other-token"),
      ],
      activeIndex: 2,
      activeIndexByFamily: { claude: 3, gemini: 2 },
    });

    const loaded = await loadAccounts();

    expect(loaded?.accounts.map((a) => a.refreshToken)).toEqual(["selected-token", "other-token"]);
    expect(loaded?.activeIndex).toBe(0);
    expect(loaded?.activeIndexByFamily).toEqual({ claude: 1, gemini: 0 });
  });

  it.each([undefined, null, "1", -1, 1.5, 99, NaN, Infinity])(
    "falls back from invalid global index %s to zero",
    async (activeIndex) => {
      mockStorage({
        version: 4,
        accounts: [account("first-token"), account("second-token")],
        activeIndex,
      });

      const loaded = await loadAccounts();

      expect(loaded?.activeIndex).toBe(0);
      expect(loaded?.activeIndexByFamily).toBeUndefined();
    },
  );

  it.each([null, "0", -1, 0.5, 99, NaN, Infinity])(
    "falls back from invalid family index %s to the remapped global selection",
    async (invalidIndex) => {
      mockStorage({
        version: 4,
        accounts: [
          account("old-token", "same@example.com"),
          account("other-token"),
          { ...account("new-token", "same@example.com"), lastUsed: 2 },
        ],
        activeIndex: 2,
        activeIndexByFamily: { claude: invalidIndex, gemini: invalidIndex },
      });

      const loaded = await loadAccounts();

      expect(loaded?.activeIndex).toBe(1);
      expect(loaded?.activeIndexByFamily).toEqual({ claude: 1, gemini: 1 });
    },
  );

  it("uses the global selection when a selected row was filtered out", async () => {
    mockStorage({
      version: 4,
      accounts: [account("first-token"), null, account("selected-token")],
      activeIndex: 2,
      activeIndexByFamily: { gemini: 1 },
    });

    const loaded = await loadAccounts();

    expect(loaded?.activeIndex).toBe(1);
    expect(loaded?.activeIndexByFamily).toEqual({ gemini: 1 });
  });

  it("normalizes empty results to zero without adding missing family fields", async () => {
    mockStorage({
      version: 4,
      accounts: [null, {}],
      activeIndex: 1,
      activeIndexByFamily: { claude: 1 },
    });

    expect(await loadAccounts()).toEqual({
      version: 4,
      accounts: [],
      activeIndex: 0,
      activeIndexByFamily: { claude: 0 },
    });
  });

  it("preserves incoming selected identities through merge reordering and append", async () => {
    mockStorage({
      version: 4,
      accounts: [account("a"), account("b")],
      activeIndex: 0,
    });

    await saveAccounts({
      version: 4,
      accounts: [account("b"), account("a"), account("c")],
      activeIndex: 0,
      activeIndexByFamily: { claude: 1, gemini: 2 },
    });

    const saved = savedStorage();
    expect(saved.accounts.map((a) => a.refreshToken)).toEqual(["a", "b", "c"]);
    expect(saved.activeIndex).toBe(1);
    expect(saved.activeIndexByFamily).toEqual({ claude: 0, gemini: 2 });
  });

  it("replaces a rotated token by stable identity even when usage timestamps are equal", async () => {
    const original = { ...account("old-token", "same@example.com"), id: "stable-id" };
    mockStorage({ version: 4, accounts: [original], activeIndex: 0 });
    await saveAccounts({ version: 4, accounts: [{ ...original, refreshToken: "rotated-token" }], activeIndex: 0 });
    expect(savedStorage().accounts).toHaveLength(1);
    expect(savedStorage().accounts[0]).toMatchObject({ ...original, refreshToken: "rotated-token" });
  });

  it("remaps to the retained email winner when merge removes the selected token", async () => {
    mockStorage({
      version: 4,
      accounts: [
        { ...account("new-token", "same@example.com"), lastUsed: 3 },
        account("other-token"),
      ],
      activeIndex: 0,
    });

    await saveAccounts({
      version: 4,
      accounts: [account("old-token", "same@example.com"), account("other-token")],
      activeIndex: 0,
      activeIndexByFamily: { claude: 0, gemini: 1 },
    });

    const saved = savedStorage();
    expect(saved.accounts.map((a) => a.refreshToken)).toEqual(["new-token", "other-token"]);
    expect(saved.activeIndex).toBe(0);
    expect(saved.activeIndexByFamily).toEqual({ claude: 0, gemini: 1 });
  });

  it.each([1, 2, 3, 4])("normalizes version %s storage on load and save", async (version) => {
    const accounts = [
      account("old-token", "same@example.com"),
      account("other-token"),
      { ...account("new-token", "same@example.com"), lastUsed: 2 },
    ];
    mockStorage({
      version,
      accounts,
      activeIndex: 2,
      ...(version >= 3 ? { activeIndexByFamily: { claude: 0, gemini: 1 } } : {}),
    });

    const loaded = await loadAccounts();
    expect(loaded?.accounts.map((a) => a.refreshToken)).toEqual(["other-token", "new-token"]);
    expect(loaded?.activeIndex).toBe(1);
    expect(loaded?.activeIndexByFamily).toEqual(version >= 3 ? { claude: 1, gemini: 0 } : undefined);
    if (!loaded) throw new Error("Storage was not loaded");
    if (version === 4) await saveAccounts(loaded);

    const saved = savedStorage();
    expect(saved.accounts.map((a) => a.refreshToken)).toEqual(["other-token", "new-token"]);
    expect(saved.activeIndex).toBe(1);
    expect(saved.activeIndexByFamily).toEqual(loaded.activeIndexByFamily);
  });
});

describe("Storage Migration", () => {
  const now = Date.now();
  const future = now + 100000;
  const past = now - 100000;

  describe("migrateV2ToV3", () => {
    it("converts gemini rate limits to gemini-antigravity", () => {
      const v2: AccountStorage = {
        version: 2,
        accounts: [
          {
            refreshToken: "r1",
            addedAt: now,
            lastUsed: now,
            rateLimitResetTimes: {
              gemini: future,
            },
          },
        ],
        activeIndex: 0,
      };

      const v3 = migrateV2ToV3(v2);

      expect(v3.version).toBe(3);
      const account = v3.accounts[0];
      if (!account) throw new Error("Account not found");

      expect(account.rateLimitResetTimes).toEqual({
        "gemini-antigravity": future,
      });
      expect(account.rateLimitResetTimes?.["gemini-cli"]).toBeUndefined();
    });

    it("preserves claude rate limits", () => {
      const v2: AccountStorage = {
        version: 2,
        accounts: [
          {
            refreshToken: "r1",
            addedAt: now,
            lastUsed: now,
            rateLimitResetTimes: {
              claude: future,
            },
          },
        ],
        activeIndex: 0,
      };

      const v3 = migrateV2ToV3(v2);
      const account = v3.accounts[0];
      if (!account) throw new Error("Account not found");

      expect(account.rateLimitResetTimes).toEqual({
        claude: future,
      });
    });

    it("handles mixed rate limits correctly", () => {
      const v2: AccountStorage = {
        version: 2,
        accounts: [
          {
            refreshToken: "r1",
            addedAt: now,
            lastUsed: now,
            rateLimitResetTimes: {
              claude: future,
              gemini: future,
            },
          },
        ],
        activeIndex: 0,
      };

      const v3 = migrateV2ToV3(v2);
      const account = v3.accounts[0];
      if (!account) throw new Error("Account not found");

      expect(account.rateLimitResetTimes).toEqual({
        claude: future,
        "gemini-antigravity": future,
      });
    });

    it("filters out expired rate limits", () => {
      const v2: AccountStorage = {
        version: 2,
        accounts: [
          {
            refreshToken: "r1",
            addedAt: now,
            lastUsed: now,
            rateLimitResetTimes: {
              claude: past,
              gemini: future,
            },
          },
        ],
        activeIndex: 0,
      };

      const v3 = migrateV2ToV3(v2);
      const account = v3.accounts[0];
      if (!account) throw new Error("Account not found");

      expect(account.rateLimitResetTimes).toEqual({
        "gemini-antigravity": future,
      });
      expect(account.rateLimitResetTimes?.claude).toBeUndefined();
    });

    it("removes rateLimitResetTimes object if all keys are expired", () => {
      const v2: AccountStorage = {
        version: 2,
        accounts: [
          {
            refreshToken: "r1",
            addedAt: now,
            lastUsed: now,
            rateLimitResetTimes: {
              claude: past,
              gemini: past,
            },
          },
        ],
        activeIndex: 0,
      };

      const v3 = migrateV2ToV3(v2);
      const account = v3.accounts[0];
      if (!account) throw new Error("Account not found");

      expect(account.rateLimitResetTimes).toBeUndefined();
    });
  });

  describe("loadAccounts migration integration", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("migrates V2 storage on load and persists V4", async () => {
      const v2Data = {
        version: 2,
        accounts: [
          {
            refreshToken: "r1",
            addedAt: now,
            lastUsed: now,
            rateLimitResetTimes: {
              gemini: future,
            },
          },
        ],
        activeIndex: 0,
      };

      // Mock readFile to return different values based on path
      vi.mocked(fs.readFile).mockImplementation((path) => {
        if ((path as string).endsWith(".gitignore")) {
          const error = new Error("ENOENT") as NodeJS.ErrnoException;
          error.code = "ENOENT";
          return Promise.reject(error);
        }
        return Promise.resolve(JSON.stringify(v2Data));
      });

      const result = await loadAccounts();

      expect(result).not.toBeNull();
      expect(result?.version).toBe(4);

      const account = result?.accounts[0];
      if (!account) throw new Error("Account not found");

      expect(account.rateLimitResetTimes).toEqual({
        "gemini-antigravity": future,
      });

      expect(fs.writeFile).toHaveBeenCalled();
      
      const saveCall = vi.mocked(fs.writeFile).mock.calls.find(
        (call) => (call[0] as string).includes(".tmp")
      );
      if (!saveCall) throw new Error("saveAccounts was not called (tmp file not found)");

      const savedContent = JSON.parse(saveCall[1] as string);
      expect(savedContent.version).toBe(4);
      expect(savedContent.accounts[0].rateLimitResetTimes).toEqual({
        "gemini-antigravity": future,
      });

      const gitignoreCall = vi.mocked(fs.writeFile).mock.calls.find(
        (call) => (call[0] as string).includes(".gitignore")
      );
      expect(gitignoreCall).toBeDefined();
    });
  });

  describe("ensureGitignore", () => {
    const configDir = "/tmp/opencode-test";

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("creates .gitignore when file does not exist", async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });

      const { ensureGitignore } = await import("./storage");
      await ensureGitignore(configDir);

      expect(fs.writeFile).toHaveBeenCalled();
      const [path, content] = vi.mocked(fs.writeFile).mock.calls[0]!;
      expect(path).toContain(".gitignore");
      expect(content).toContain("antigravity-accounts.json");
      expect(content).toContain("antigravity-signature-cache.json");
      expect(content).toContain("antigravity-logs/");
    });

    it("appends missing entries to existing .gitignore", async () => {
      vi.mocked(fs.readFile).mockResolvedValue("existing-entry");

      const { ensureGitignore } = await import("./storage");
      await ensureGitignore(configDir);

      expect(fs.appendFile).toHaveBeenCalled();
      const [path, content] = vi.mocked(fs.appendFile).mock.calls[0]!;
      expect(path).toContain(".gitignore");
      expect(content).toContain("antigravity-accounts.json");
      expect((content as string).startsWith("\n")).toBe(true);
    });

    it("does nothing when all entries already exist", async () => {
      const existing = [
        ".gitignore",
        "antigravity-accounts.json",
        "antigravity-accounts.json.*.tmp",
        "antigravity-signature-cache.json",
        "antigravity-logs/",
      ].join("\n");
      vi.mocked(fs.readFile).mockResolvedValue(existing);

      const { ensureGitignore } = await import("./storage");
      await ensureGitignore(configDir);

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.appendFile).not.toHaveBeenCalled();
    });

    it("handles permission errors gracefully", async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: "EACCES" });

      const { ensureGitignore } = await import("./storage");
      await expect(ensureGitignore(configDir)).resolves.not.toThrow();

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(fs.appendFile).not.toHaveBeenCalled();
    });
  });

  describe("ensureGitignoreSync", () => {
    const configDir = "/tmp/opencode-test-sync";

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("creates .gitignore when file does not exist", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const { ensureGitignoreSync } = await import("./storage");
      ensureGitignoreSync(configDir);

      expect(writeFileSync).toHaveBeenCalled();
      const [path, content] = vi.mocked(writeFileSync).mock.calls[0]!;
      expect(path).toContain(".gitignore");
      expect(content).toContain("antigravity-accounts.json");
      expect(content).toContain("antigravity-signature-cache.json");
      expect(content).toContain("antigravity-logs/");
    });

    it("appends missing entries to existing .gitignore", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("existing-entry");

      const { ensureGitignoreSync } = await import("./storage");
      ensureGitignoreSync(configDir);

      expect(appendFileSync).toHaveBeenCalled();
      const [path, content] = vi.mocked(appendFileSync).mock.calls[0]!;
      expect(path).toContain(".gitignore");
      expect(content).toContain("antigravity-accounts.json");
      expect((content as string).startsWith("\n")).toBe(true);
    });

    it("does nothing when all entries already exist", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      const existing = [
        ".gitignore",
        "antigravity-accounts.json",
        "antigravity-accounts.json.*.tmp",
        "antigravity-signature-cache.json",
        "antigravity-logs/",
      ].join("\n");
      vi.mocked(readFileSync).mockReturnValue(existing);

      const { ensureGitignoreSync } = await import("./storage");
      ensureGitignoreSync(configDir);

      expect(writeFileSync).not.toHaveBeenCalled();
      expect(appendFileSync).not.toHaveBeenCalled();
    });
  });
});
