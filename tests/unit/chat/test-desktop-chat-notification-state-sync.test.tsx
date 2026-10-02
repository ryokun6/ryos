/**
 * `useBackgroundChatNotifications` ↔ `window.ryosDesktop` state contract.
 *
 * The iOS shell answers `configureChatNotifications` with
 * `{ managed: true, ready: false }` (it never takes over notifications, but
 * registers the chat rooms for APNs push), so later room/state changes must
 * still reach `updateChatNotificationState`.
 */
import "fake-indexeddb/auto";
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ensureTestLocalStorage } from "../../setup";

let registeredDomHere = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomHere = true;
}
ensureTestLocalStorage();

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});

const { useBackgroundChatNotifications } = await import(
  "../../../src/hooks/useBackgroundChatNotifications"
);
const { useChatsStore } = await import("../../../src/stores/useChatsStore");
const { useAppStore } = await import("../../../src/stores/useAppStore");

const originalChats = useChatsStore.getState();
const originalInstances = useAppStore.getState().instances;

type Call = { method: string; args: unknown[] };
let calls: Call[] = [];
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function installShell(manageResult: unknown) {
  const record =
    (method: string, value: unknown = undefined) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve(value);
    };
  const noopSubscribe = () => () => {};
  (window as unknown as Record<string, unknown>).ryosDesktop = {
    platform: "ios",
    configureChatNotifications: record("configureChatNotifications", manageResult),
    updateChatNotificationState: record("updateChatNotificationState", manageResult),
    stopChatNotifications: record("stopChatNotifications"),
    onChatNotificationEvent: noopSubscribe,
    onChatNotificationStatus: noopSubscribe,
    onOpenChatRoomFromNotification: noopSubscribe,
  };
}

function statesSentBy(method: string) {
  return calls
    .filter((call) => call.method === method)
    .map((call) =>
      method === "configureChatNotifications" ? call.args[1] : call.args[0]
    ) as Array<{ rooms: unknown[]; currentRoomId: string | null }>;
}

function Probe() {
  useBackgroundChatNotifications();
  return null;
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(React.createElement(Probe));
  });
}

async function settle(update?: () => void) {
  await act(async () => {
    update?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  calls = [];
  // Chats open keeps the hook out of renderer background mode (no fetches or
  // realtime subscriptions); the shell still receives the state.
  useAppStore.setState({
    instances: {
      chats: { instanceId: "chats", appId: "chats", isOpen: true, createdAt: 0 },
    } as never,
  });
  useChatsStore.setState({
    username: "alice",
    isAuthenticated: true,
    rooms: [],
    currentRoomId: null,
  });
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  delete (window as unknown as Record<string, unknown>).ryosDesktop;
});

afterAll(() => {
  useChatsStore.setState(originalChats);
  useAppStore.setState({ instances: originalInstances });
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("desktop chat notification state sync", () => {
  test("a shell that accepts but never manages still receives room updates", async () => {
    installShell({ managed: true, ready: false });
    await mount();
    await settle();

    expect(statesSentBy("configureChatNotifications")).toHaveLength(1);
    expect(statesSentBy("configureChatNotifications")[0].rooms).toEqual([]);
    // No redundant echo of the state configure already carried.
    expect(statesSentBy("updateChatNotificationState")).toEqual([]);

    await settle(() =>
      useChatsStore.setState({
        rooms: [{ id: "room-1", name: "general", type: "public" }] as never,
      })
    );
    await settle(() => useChatsStore.setState({ currentRoomId: "room-1" }));

    const updates = statesSentBy("updateChatNotificationState");
    expect(updates.map((state) => state.rooms)).toEqual([
      [{ id: "room-1", type: "public" }],
      [{ id: "room-1", type: "public" }],
    ]);
    expect(updates.at(-1)?.currentRoomId).toBe("room-1");
  });

  test("a shell that rejects the config gets no state updates", async () => {
    installShell({ managed: false, reason: "missing-pusher-config" });
    await mount();
    await settle();

    await settle(() =>
      useChatsStore.setState({
        rooms: [{ id: "room-1", name: "general", type: "public" }] as never,
      })
    );

    expect(statesSentBy("configureChatNotifications")).toHaveLength(1);
    expect(statesSentBy("updateChatNotificationState")).toEqual([]);
  });

  test("debug mode logs the configure + room sync trail without the username", async () => {
    const { readStoredDebugFlagEnabled, refreshRuntimeDebugFlag, setRuntimeDebugEnabled } =
      await import("../../../src/utils/debug");
    const storedDebug = readStoredDebugFlagEnabled();
    const originalLog = console.log;
    const logged: string[] = [];
    console.log = (...args: unknown[]) => {
      logged.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
    };
    setRuntimeDebugEnabled(true);
    try {
      installShell({ managed: true, ready: false });
      await mount();
      await settle();
      await settle(() =>
        useChatsStore.setState({
          rooms: [{ id: "room-1", name: "general", type: "public" }] as never,
        })
      );
    } finally {
      console.log = originalLog;
      setRuntimeDebugEnabled(storedDebug);
      refreshRuntimeDebugFlag();
    }

    const push = logged.filter((line) => line.startsWith("[push]"));
    expect(push.some((line) => line.startsWith("[push] Configuring shell chat notifications"))).toBe(true);
    expect(
      push.find((line) => line.startsWith("[push] Shell chat notification config result"))
    ).toContain('"result":{"managed":true,"ready":false}');
    expect(
      push.find((line) => line.startsWith("[push] Syncing chat state to shell"))
    ).toContain('"roomCount":1');
    expect(push.join("\n")).not.toContain("alice");
  });

  test("signing out stops the shell and halts state updates", async () => {
    installShell({ managed: true, ready: false });
    await mount();
    await settle();

    await settle(() =>
      useChatsStore.setState({ isAuthenticated: false, username: null })
    );
    await settle(() =>
      useChatsStore.setState({
        rooms: [{ id: "room-2", name: "other", type: "public" }] as never,
      })
    );

    expect(calls.some((call) => call.method === "stopChatNotifications")).toBe(true);
    expect(statesSentBy("updateChatNotificationState")).toEqual([]);
  });
});
