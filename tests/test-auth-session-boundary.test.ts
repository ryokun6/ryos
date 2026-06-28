import { beforeEach, describe, expect, mock, test } from "bun:test";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: new MemoryStorage(),
  writable: true,
});

const logoutMock = mock(async () => {});
const registerMock = mock(async ({ username }: { username: string }) => ({
  user: { username },
}));
let loginImpl = async ({ username }: { username: string }) => ({ username });
let sessionImpl = async () => ({
  ok: true as const,
  data: { authenticated: true, username: "restored-user" },
});

mock.module("@/api/auth", () => ({
  checkUserPassword: mock(async () => ({ hasPassword: true })),
  deleteAccount: mock(async () => ({ success: true })),
  getAuthSession: mock(() => sessionImpl()),
  loginWithPassword: mock((params: { username: string }) => loginImpl(params)),
  logoutUserSafe: logoutMock,
  registerUser: registerMock,
  setUserPassword: mock(async () => ({ success: true })),
  verifyAuthToken: mock(async ({ username }: { username: string }) => ({
    valid: true,
    username,
  })),
}));

const destroyEngineMock = mock(() => {});
mock.module("@/sync/engine", () => ({
  destroyCloudSyncEngine: destroyEngineMock,
}));

const { registerSessionTeardown } = await import(
  "../src/auth/sessionBoundary"
);
const { useAuthStore } = await import("../src/stores/useAuthStore");

describe("auth session boundary", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      username: null,
      isAuthenticated: false,
      hasPassword: null,
      isRestoringSession: false,
    });
    logoutMock.mockClear();
    registerMock.mockClear();
    destroyEngineMock.mockClear();
    sessionImpl = async () => ({
      ok: true,
      data: { authenticated: true, username: "restored-user" },
    });
    loginImpl = async ({ username }) => ({ username });
  });

  test("owns registration state and the recovery identity", async () => {
    const result = await useAuthStore.getState().register({
      username: "new-user",
      password: "password123",
    });

    expect(result).toEqual({ ok: true });
    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      username: "new-user",
      isAuthenticated: true,
      hasPassword: true,
    });
    expect(localStorage.getItem("_usr_recovery_key_")).toBe("new-user");
  });

  test("tears down user state before publishing logged-out state", async () => {
    const observed: string[] = [];
    const unregister = registerSessionTeardown(({ username, reason }) => {
      observed.push(`${username}:${reason}`);
      expect(useAuthStore.getState().username).toBe("signed-in-user");
    });
    useAuthStore.setState({
      username: "signed-in-user",
      isAuthenticated: true,
      hasPassword: true,
    });
    localStorage.setItem("_usr_recovery_key_", "signed-in-user");

    await useAuthStore.getState().logout();
    unregister();

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(destroyEngineMock).toHaveBeenCalledTimes(1);
    expect(observed).toEqual(["signed-in-user:logout"]);
    expect(useAuthStore.getState()).toMatchObject({
      username: null,
      isAuthenticated: false,
      hasPassword: null,
    });
    expect(localStorage.getItem("_usr_recovery_key_")).toBeNull();
  });

  test("does not let a stale restore replace an explicit login", async () => {
    let resolveSession:
      | ((value: {
          ok: true;
          data: { authenticated: true; username: string };
        }) => void)
      | undefined;
    sessionImpl = () =>
      new Promise((resolve) => {
        resolveSession = resolve;
      });

    const restore = useAuthStore.getState().restoreSession();
    await useAuthStore.getState().login({
      username: "explicit-user",
      password: "password123",
    });
    resolveSession?.({
      ok: true,
      data: { authenticated: true, username: "stale-cookie-user" },
    });

    await expect(restore).resolves.toEqual({
      ok: false,
      error: "Session restore superseded",
    });
    expect(useAuthStore.getState().username).toBe("explicit-user");
  });

  test("does not let a login response publish after logout", async () => {
    let resolveLogin: ((value: { username: string }) => void) | undefined;
    loginImpl =
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        });

    const login = useAuthStore.getState().login({
      username: "late-user",
      password: "password123",
    });
    await useAuthStore.getState().logout();
    resolveLogin?.({ username: "late-user" });

    await expect(login).resolves.toEqual({
      ok: false,
      error: "Login superseded",
    });
    expect(useAuthStore.getState()).toMatchObject({
      username: null,
      isAuthenticated: false,
    });
  });

  test("checks the auth generation again after session teardown", async () => {
    let releaseLoginTeardown: (() => void) | undefined;
    const unregister = registerSessionTeardown(({ reason }) => {
      if (reason !== "logout") return;
      return new Promise<void>((resolve) => {
        releaseLoginTeardown = resolve;
      });
    });
    useAuthStore.setState({
      username: "old-user",
      isAuthenticated: true,
      hasPassword: true,
    });

    const login = useAuthStore.getState().login({
      username: "new-user",
      password: "password123",
    });
    while (!releaseLoginTeardown) {
      await Promise.resolve();
    }
    await useAuthStore.getState().handleUnauthorized();
    releaseLoginTeardown();

    await expect(login).resolves.toEqual({
      ok: false,
      error: "Login superseded",
    });
    expect(useAuthStore.getState()).toMatchObject({
      username: null,
      isAuthenticated: false,
    });
    unregister();
  });
});
