#!/usr/bin/env bun

import { afterAll, describe, expect, test } from "bun:test";
import { createJSONStorage } from "zustand/middleware";
import type { useAppStore as UseAppStoreHook } from "../../../src/stores/useAppStore";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const originalGetComputedStyle = Object.getOwnPropertyDescriptor(
  globalThis,
  "getComputedStyle",
);

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

function installViewport(width = 390, height = 800) {
  const documentElement = {
    style: {} as Record<string, string>,
    appendChild(child: { style: Record<string, string> }) {
      return child;
    },
  };
  const documentStub = {
    documentElement,
    createElement() {
      return {
        style: {} as Record<string, string>,
        setAttribute() {},
        getBoundingClientRect() {
          return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
        },
      };
    },
  };
  const windowStub = {
    innerWidth: width,
    innerHeight: height,
    document: documentStub,
    dispatchEvent() {
      return true;
    },
    addEventListener() {},
    removeEventListener() {},
    matchMedia() {
      return {
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      };
    },
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    value: () => ({
      getPropertyValue: () => "0",
      borderRightWidth: "0px",
    }),
  });
}

function restoreGlobals() {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    delete (globalThis as { window?: unknown }).window;
  }
  if (originalDocument) {
    Object.defineProperty(globalThis, "document", originalDocument);
  } else {
    delete (globalThis as { document?: unknown }).document;
  }
  if (originalGetComputedStyle) {
    Object.defineProperty(globalThis, "getComputedStyle", originalGetComputedStyle);
  }
}

afterAll(() => {
  restoreGlobals();
});

const savedInstances = {
  "3": {
    instanceId: "3",
    appId: "finder",
    isOpen: true,
    isMinimized: false,
    position: { x: 900, y: 120 },
    size: { width: 640, height: 480 },
    createdAt: 3,
    title: "Finder",
  },
  "4": {
    instanceId: "4",
    appId: "textedit",
    isOpen: true,
    isMinimized: true,
    position: { x: 40, y: 80 },
    size: { width: 500, height: 360 },
    createdAt: 4,
  },
  "5": {
    instanceId: "5",
    appId: "retired-app",
    isOpen: true,
    isMinimized: false,
    position: { x: 10, y: 30 },
    size: { width: 200, height: 200 },
    createdAt: 5,
  },
};

describe("app store hydration", () => {
  test("rehydrate keeps open windows and only adjusts rects", async () => {
    installViewport();
    const storage = new MemoryStorage();
    storage.setItem(
      "ryos:app-store",
      JSON.stringify({
        state: {
          version: 6,
          instances: savedInstances,
          instanceOrder: ["3", "4", "5"],
          foregroundInstanceId: "3",
          nextInstanceId: 6,
        },
        version: 6,
      }),
    );

    const { useAppStore } = (await import(
      "../../../src/stores/useAppStore"
    )) as { useAppStore: typeof UseAppStoreHook };
    useAppStore.persist.setOptions({
      storage: createJSONStorage(() => storage),
    });
    await useAppStore.persist.rehydrate();

    const state = useAppStore.getState();
    expect(useAppStore.persist.hasHydrated()).toBe(true);
    expect(state.instanceOrder).toEqual(["3", "4", "5"]);
    expect(state.foregroundInstanceId).toBe("3");
    expect(state.nextInstanceId).toBeGreaterThanOrEqual(6);
    expect(typeof state.launchApp).toBe("function");

    for (const id of ["3", "4", "5"] as const) {
      const saved = savedInstances[id];
      const restored = state.instances[id];
      expect(restored).toBeDefined();
      expect(restored.isOpen).toBe(true);
      expect(restored.appId).toBe(saved.appId);
      expect(restored.isMinimized).toBe(saved.isMinimized);
      expect(restored.instanceId).toBe(saved.instanceId);
      expect(restored.createdAt).toBe(saved.createdAt);
    }

    const finder = state.instances["3"];
    expect(finder.position.x).toBe(0);
    expect(finder.position.y).toBe(120);
    expect(finder.size.width).toBe(390);
    expect(finder.size.height).toBe(480);
    expect(finder.desktopRect).toEqual({
      position: { x: 900, y: 120 },
      size: { width: 640, height: 480 },
    });
    expect(state.instances["4"].position).toEqual({ x: 0, y: 80 });
    expect(state.instances["4"].desktopRect).toEqual({
      position: { x: 40, y: 80 },
      size: { width: 500, height: 360 },
    });
    expect(state.instances["5"].isOpen).toBe(true);

    useAppStore.setState({
      instances: {},
      instanceOrder: [],
      foregroundInstanceId: null,
      nextInstanceId: 0,
    });
  });

  test("refresh on a desktop viewport restores the saved desktop rect after a mobile session", async () => {
    installViewport(1440, 900);
    const desktopRect = {
      position: { x: 220, y: 64 },
      size: { width: 680, height: 400 },
    };
    const storage = new MemoryStorage();
    storage.setItem(
      "ryos:app-store",
      JSON.stringify({
        state: {
          version: 6,
          instances: {
            "7": {
              instanceId: "7",
              appId: "finder",
              isOpen: true,
              isMinimized: false,
              position: { x: 0, y: 240 },
              size: { width: 390, height: 400 },
              desktopRect,
              createdAt: 7,
            },
          },
          instanceOrder: ["7"],
          foregroundInstanceId: "7",
          nextInstanceId: 8,
        },
        version: 6,
      }),
    );

    const { useAppStore } = (await import(
      "../../../src/stores/useAppStore"
    )) as { useAppStore: typeof UseAppStoreHook };
    useAppStore.persist.setOptions({
      storage: createJSONStorage(() => storage),
    });
    await useAppStore.persist.rehydrate();

    const restored = useAppStore.getState().instances["7"];
    expect(restored.isOpen).toBe(true);
    expect(restored.position).toEqual(desktopRect.position);
    expect(restored.size).toEqual(desktopRect.size);
    expect(restored.desktopRect).toEqual(desktopRect);

    useAppStore.setState({
      instances: {},
      instanceOrder: [],
      foregroundInstanceId: null,
      nextInstanceId: 0,
    });
  });

  test("moving a window on mobile does not change its desktop rect", async () => {
    installViewport(390, 800);
    const desktopRect = {
      position: { x: 220, y: 64 },
      size: { width: 680, height: 400 },
    };
    const { useAppStore } = (await import(
      "../../../src/stores/useAppStore"
    )) as { useAppStore: typeof UseAppStoreHook };
    useAppStore.setState({
      instances: {
        "9": {
          instanceId: "9",
          appId: "finder",
          isOpen: true,
          isMinimized: false,
          position: { x: 0, y: 64 },
          size: { width: 390, height: 400 },
          desktopRect,
          createdAt: 9,
        },
      },
      instanceOrder: ["9"],
      foregroundInstanceId: "9",
    });

    useAppStore
      .getState()
      .updateInstanceWindowState("9", { x: 0, y: 300 }, { width: 390, height: 400 });

    const moved = useAppStore.getState().instances["9"];
    expect(moved.position).toEqual({ x: 0, y: 300 });
    expect(moved.desktopRect).toEqual(desktopRect);

    useAppStore.setState({
      instances: {},
      instanceOrder: [],
      foregroundInstanceId: null,
      nextInstanceId: 0,
    });
  });
});
