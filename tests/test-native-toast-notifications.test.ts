import { describe, expect, test } from "bun:test";
import {
  getNativeToastNotification,
  shouldShowNativeToastNotification,
  type NativeToastDesktopApi,
} from "../src/utils/nativeToastNotifications";

describe("native toast notifications", () => {
  test("extracts plain text title and description", () => {
    expect(
      getNativeToastNotification("success", "Saved", {
        description: "Your file was saved.",
      })
    ).toEqual({
      title: "Saved",
      body: "Your file was saved.",
    });
  });

  test("skips action and persistent toasts", () => {
    expect(
      getNativeToastNotification("info", "Update available", {
        action: { label: "Download" },
      })
    ).toBeNull();

    expect(
      getNativeToastNotification("info", "Caching assets", {
        duration: Infinity,
      })
    ).toBeNull();
  });

  test("skips progress toasts by id", () => {
    expect(
      getNativeToastNotification("info", "Caching assets", {
        id: "prefetch-progress",
      })
    ).toBeNull();
  });

  test("skips non-text messages and descriptions", () => {
    expect(getNativeToastNotification("info", { label: "Saved" })).toBeNull();
    expect(
      getNativeToastNotification("error", "Failed", {
        description: { details: "Rendered node" },
      })
    ).toBeNull();
  });

  test("skips sensitive-looking text", () => {
    expect(
      getNativeToastNotification("error", "Request failed: token=abc123")
    ).toBeNull();
    expect(
      getNativeToastNotification("error", "Request failed", {
        description:
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature",
      })
    ).toBeNull();
  });

  test("caps long notification text", () => {
    const payload = getNativeToastNotification("info", "Long title ".repeat(16), {
      description: "Long body ".repeat(34),
    });

    expect(payload?.title).toHaveLength(120);
    expect(payload?.title.endsWith("...")).toBe(true);
    expect(payload?.body).toHaveLength(240);
    expect(payload?.body?.endsWith("...")).toBe(true);
  });

  test("only mirrors native toasts when desktop gate allows it", async () => {
    const backgroundApi: NativeToastDesktopApi = {
      shouldShowNativeNotification: async () => true,
      showNotification: async () => ({ shown: true }),
    };
    const foregroundApi: NativeToastDesktopApi = {
      shouldShowNativeNotification: async () => false,
      showNotification: async () => ({ shown: true }),
    };

    expect(await shouldShowNativeToastNotification(backgroundApi)).toBe(true);
    expect(await shouldShowNativeToastNotification(foregroundApi)).toBe(false);
    expect(await shouldShowNativeToastNotification(null)).toBe(false);
  });

  test("treats desktop gate failures as unsupported", async () => {
    const failingApi: NativeToastDesktopApi = {
      shouldShowNativeNotification: async () => {
        throw new Error("ipc failed");
      },
      showNotification: async () => ({ shown: true }),
    };

    expect(await shouldShowNativeToastNotification(failingApi)).toBe(false);
  });
});
