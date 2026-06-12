#!/usr/bin/env bun

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { useAppStore as UseAppStoreHook } from "../src/stores/useAppStore";

let useAppStore: typeof UseAppStoreHook;

// The partial `window` stub must not leak into later test files (e.g. code
// guarded by `typeof window !== "undefined"` expecting addEventListener).
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterAll(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
});

function installBrowserStubs() {
  const storage = new Map<string, string>();
  const localStorageStub = {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageStub,
  });

  if (typeof globalThis.CustomEvent === "undefined") {
    class TestCustomEvent<T = unknown> extends Event {
      detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    }
    Object.defineProperty(globalThis, "CustomEvent", {
      configurable: true,
      value: TestCustomEvent,
    });
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      dispatchEvent: () => true,
      innerWidth: 1024,
    },
  });
}

beforeAll(async () => {
  installBrowserStubs();
  ({ useAppStore } = await import("../src/stores/useAppStore"));
});

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    instances: {},
    instanceOrder: [],
    foregroundInstanceId: null,
    nextInstanceId: 0,
    recentApps: [],
    recentDocuments: [],
  });
});

describe("useAppStore foreground state", () => {
  test("focus changes preserve instance object identity", () => {
    const store = useAppStore.getState();
    const firstId = store.createAppInstance("textedit");
    const secondId = useAppStore.getState().createAppInstance("finder");

    useAppStore.getState().markInstanceAsLoaded(firstId);
    useAppStore.getState().markInstanceAsLoaded(secondId);

    const beforeFocusState = useAppStore.getState();
    const beforeInstances = beforeFocusState.instances;
    const beforeFirst = beforeInstances[firstId];
    const beforeSecond = beforeInstances[secondId];

    useAppStore.getState().bringInstanceToForeground(firstId);

    const afterFocusState = useAppStore.getState();
    expect(afterFocusState.foregroundInstanceId).toBe(firstId);
    expect(afterFocusState.instanceOrder.at(-1)).toBe(firstId);
    expect(afterFocusState.instances).toBe(beforeInstances);
    expect(afterFocusState.instances[firstId]).toBe(beforeFirst);
    expect(afterFocusState.instances[secondId]).toBe(beforeSecond);
    expect("isForeground" in afterFocusState.instances[firstId]).toBe(false);
    expect("isForeground" in afterFocusState.instances[secondId]).toBe(false);
  });

  test("foreground helpers derive isForeground from foregroundInstanceId", () => {
    const id = useAppStore.getState().createAppInstance("textedit");
    useAppStore.getState().markInstanceAsLoaded(id);

    const foreground = useAppStore.getState().getForegroundInstance();
    const instances = useAppStore.getState().getInstancesByAppId("textedit");

    expect(foreground?.instanceId).toBe(id);
    expect(foreground?.isForeground).toBe(true);
    expect(instances).toHaveLength(1);
    expect(instances[0].isForeground).toBe(true);
  });
});
