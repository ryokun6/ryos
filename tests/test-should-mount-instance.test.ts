import { describe, test, expect } from "bun:test";
import { shouldMountInstance } from "../src/apps/base/instanceMountPolicy";
import type { AppInstance } from "../src/stores/useAppStore";

function makeInstance(
  overrides: Partial<AppInstance> & Pick<AppInstance, "instanceId" | "appId">
): AppInstance {
  return {
    instanceId: overrides.instanceId,
    appId: overrides.appId,
    isOpen: true,
    isForeground: false,
    createdAt: Date.now(),
    position: { x: 0, y: 0 },
    size: { width: 400, height: 300 },
    ...overrides,
  } as AppInstance;
}

describe("shouldMountInstance", () => {
  test("mounts open non-minimized background windows", () => {
    const a = makeInstance({ instanceId: "1", appId: "textedit", isForeground: false });
    expect(shouldMountInstance(a, false)).toBe(true);
  });

  test("does not mount minimized windows", () => {
    const a = makeInstance({
      instanceId: "1",
      appId: "textedit",
      isMinimized: true,
    });
    expect(shouldMountInstance(a, false)).toBe(false);
  });

  test("mounts while lazy loading even if not foreground", () => {
    const loading = makeInstance({
      instanceId: "2",
      appId: "ipod",
      isLoading: true,
      isForeground: false,
    });
    expect(shouldMountInstance(loading, false)).toBe(true);
  });
});
