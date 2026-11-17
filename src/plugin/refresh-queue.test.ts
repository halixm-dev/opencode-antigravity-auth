import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProactiveRefreshQueue } from "./refresh-queue";
import { AccountManager } from "./accounts";
import type { AccountStorageV4 } from "./storage";
import type { OAuthAuthDetails, PluginClient } from "./types";
import { refreshAccessToken } from "./token";

vi.mock("./token", () => ({ refreshAccessToken: vi.fn() }));

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

// Mock PluginClient
const mockClient: PluginClient = {
  toast: vi.fn(),
  auth: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
} as unknown as PluginClient;

describe("ProactiveRefreshQueue", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("waits for an in-flight refresh and its save before stopping", async () => {
    vi.useFakeTimers();
    const manager = new AccountManager(undefined, { version: 4, activeIndex: 0, accounts: [{ refreshToken: "old", addedAt: 1, lastUsed: 1 }] });
    manager.getAccounts()[0]!.expires = Date.now() + 600000;
    const save = vi.spyOn(manager, "saveToDisk").mockResolvedValue(undefined);
    let finish: (value: OAuthAuthDetails) => void = () => { throw new Error("Refresh did not start"); };
    vi.mocked(refreshAccessToken).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const queue = new ProactiveRefreshQueue(mockClient, "google");
    queue.setAccountManager(manager);
    queue.start();
    await vi.advanceTimersByTimeAsync(5000);
    let stopped = false;
    const stopping = queue.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish({ type: "oauth", refresh: "rotated", access: "fresh", expires: Date.now() + 3600000 });
    await stopping;
    expect(save).toHaveBeenCalledOnce();
    expect(manager.getAccounts()[0]?.parts.refreshToken).toBe("rotated");
    await vi.advanceTimersByTimeAsync(300000);
    expect(save).toHaveBeenCalledOnce();
  });

  describe("getAccountsNeedingRefresh", () => {
    it("skips disabled accounts", () => {
      const now = Date.now();
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          {
            refreshToken: "r1",
            projectId: "p1",
            addedAt: now,
            lastUsed: 0,
            enabled: true,
          },
          {
            refreshToken: "r2",
            projectId: "p2",
            addedAt: now,
            lastUsed: 0,
            enabled: false, // disabled account
          },
          {
            refreshToken: "r3",
            projectId: "p3",
            addedAt: now,
            lastUsed: 0,
            enabled: true,
          },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const queue = new ProactiveRefreshQueue(mockClient, "test-provider", {
        enabled: true,
        bufferSeconds: 1800,
        checkIntervalSeconds: 300,
      });
      queue.setAccountManager(manager);

      // Set all accounts to expire soon (within buffer)
      const accounts = manager.getAccounts();
      const expiringSoon = now + 1000 * 60 * 10; // 10 minutes from now
      accounts.forEach((acc) => {
        acc.expires = expiringSoon;
      });

      const needsRefresh = queue.getAccountsNeedingRefresh();

      // Should only include enabled accounts (indices 0 and 2)
      expect(needsRefresh.length).toBe(2);
      expect(needsRefresh.map((a) => a.index)).toEqual([0, 2]);
      expect(needsRefresh.every((a) => a.enabled !== false)).toBe(true);
    });

    it("includes accounts with undefined enabled (default to enabled)", () => {
      const now = Date.now();
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          {
            refreshToken: "r1",
            projectId: "p1",
            addedAt: now,
            lastUsed: 0,
            // enabled is undefined - should be treated as enabled
          },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const queue = new ProactiveRefreshQueue(mockClient, "test-provider", {
        enabled: true,
        bufferSeconds: 1800,
        checkIntervalSeconds: 300,
      });
      queue.setAccountManager(manager);

      // Set account to expire soon
      const accounts = manager.getAccounts();
      accounts[0]!.expires = now + 1000 * 60 * 10; // 10 minutes from now

      const needsRefresh = queue.getAccountsNeedingRefresh();

      expect(needsRefresh.length).toBe(1);
      expect(needsRefresh[0]!.index).toBe(0);
    });

    it("skips expired accounts", () => {
      const now = Date.now();
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          {
            refreshToken: "r1",
            projectId: "p1",
            addedAt: now,
            lastUsed: 0,
            enabled: true,
          },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const queue = new ProactiveRefreshQueue(mockClient, "test-provider", {
        enabled: true,
        bufferSeconds: 1800,
        checkIntervalSeconds: 300,
      });
      queue.setAccountManager(manager);

      // Set account to already expired
      const accounts = manager.getAccounts();
      accounts[0]!.expires = now - 1000; // 1 second ago

      const needsRefresh = queue.getAccountsNeedingRefresh();

      expect(needsRefresh.length).toBe(0);
    });

    it("skips accounts that don't need refresh yet", () => {
      const now = Date.now();
      const stored: AccountStorageV4 = {
        version: 4,
        accounts: [
          {
            refreshToken: "r1",
            projectId: "p1",
            addedAt: now,
            lastUsed: 0,
            enabled: true,
          },
        ],
        activeIndex: 0,
      };

      const manager = new AccountManager(undefined, stored);
      const queue = new ProactiveRefreshQueue(mockClient, "test-provider", {
        enabled: true,
        bufferSeconds: 1800, // 30 minutes
        checkIntervalSeconds: 300,
      });
      queue.setAccountManager(manager);

      // Set account to expire in 1 hour (outside 30 min buffer)
      const accounts = manager.getAccounts();
      accounts[0]!.expires = now + 1000 * 60 * 60; // 1 hour from now

      const needsRefresh = queue.getAccountsNeedingRefresh();

      expect(needsRefresh.length).toBe(0);
    });
  });
});
