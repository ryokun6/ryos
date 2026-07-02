import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");

describe("deferred authenticated background services", () => {
  test("keeps realtime notifications out of the App static graph", () => {
    const appSource = readFileSync(path.join(ROOT, "src/App.tsx"), "utf8");
    expect(appSource).toContain("<DeferredBackgroundChatNotifications />");
    expect(appSource).not.toContain("useBackgroundChatNotifications()");

    const wrapper = readFileSync(
      path.join(ROOT, "src/hooks/DeferredBackgroundChatNotifications.tsx"),
      "utf8"
    );
    expect(wrapper).toContain("username && isAuthenticated");
    expect(wrapper).toContain(
      'import("./BackgroundChatNotificationsRunner")'
    );
    expect(wrapper).not.toContain("requestIdleCallback");
    expect(wrapper).not.toContain("setTimeout");
  });

  test("does not download the AirDrop listener for anonymous sessions", () => {
    const wrapper = readFileSync(
      path.join(ROOT, "src/components/DeferredAirDropListener.tsx"),
      "utf8"
    );
    expect(wrapper).toContain("username && isAuthenticated");
    expect(wrapper).toContain('import("./AirDropListener")');
    expect(wrapper.indexOf("if (!shouldLoad)")).toBeLessThan(
      wrapper.indexOf('import("./AirDropListener")')
    );
    expect(wrapper).not.toContain("requestIdleCallback");
    expect(wrapper).not.toContain("setTimeout");
  });

  test("loads idle-only warmers through dynamic imports", () => {
    const mainSource = readFileSync(
      path.join(ROOT, "src/main.tsx"),
      "utf8"
    );
    expect(mainSource).toContain('import("./stores/ipodPreload")');
    expect(mainSource).toContain('import("./utils/prefetch")');
    expect(mainSource).not.toMatch(
      /^import .* from ["'].+(?:ipodPreload|utils\/prefetch)["'];?$/m
    );
  });
});
