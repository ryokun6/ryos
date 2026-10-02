/**
 * Client `[push]` notification trail: gated by the shared debug mode
 * (`ryos:debug`), covers permission + shell notification paths, and never
 * logs plain (non-chat) toasts.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { ensureTestLocalStorage } from "../../setup";

let registeredDomHere = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomHere = true;
}
ensureTestLocalStorage();

const { readStoredDebugFlagEnabled, refreshRuntimeDebugFlag, setRuntimeDebugEnabled } =
  await import("../../../src/utils/debug");
const { pushLog } = await import("../../../src/utils/pushNotificationLog");
const { requestNotificationPermission } = await import(
  "../../../src/utils/browserNotifications"
);
const { showNativeToastNotification } = await import(
  "../../../src/utils/nativeToastNotifications"
);

const storedDebugBefore = readStoredDebugFlagEnabled();
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
};
const hadNotification = "Notification" in globalThis;
const originalNotification = (globalThis as Record<string, unknown>).Notification;

let lines: string[] = [];
function captureConsole() {
  lines = [];
  const capture = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
  };
  console.log = capture;
  console.info = capture;
  console.warn = capture;
}
const pushLines = () => lines.filter((line) => line.startsWith("[push]"));

beforeEach(() => {
  setRuntimeDebugEnabled(true);
  captureConsole();
});

afterEach(() => {
  Object.assign(console, originalConsole);
  if (hadNotification) {
    (globalThis as Record<string, unknown>).Notification = originalNotification;
  } else {
    Reflect.deleteProperty(globalThis, "Notification");
  }
});

afterAll(() => {
  setRuntimeDebugEnabled(storedDebugBefore);
  refreshRuntimeDebugFlag();
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("client push notification logging", () => {
  test("debug lines follow the shared ryos:debug mode; warnings always print", () => {
    setRuntimeDebugEnabled(false);
    pushLog.debug("hidden");
    pushLog.warn("shown");
    expect(pushLines()).toEqual(["[push] shown"]);

    setRuntimeDebugEnabled(true);
    pushLog.debug("now visible", { roomId: "r1" });
    expect(pushLines().at(-1)).toBe('[push] now visible {"roomId":"r1"}');
  });

  test("logs the notification permission request and result", async () => {
    (globalThis as Record<string, unknown>).Notification = {
      permission: "default",
      requestPermission: () => Promise.resolve("granted"),
    };
    expect(await requestNotificationPermission()).toBe("granted");
    expect(pushLines()).toEqual([
      "[push] Requesting notification permission",
      '[push] Notification permission result {"permission":"granted"}',
    ]);
  });

  test("logs whether the shell showed a chat notification", async () => {
    const shell = {
      shouldShowNativeNotification: () => Promise.resolve(true),
      showNotification: () => Promise.resolve({ shown: true }),
    };
    await showNativeToastNotification(
      "basic",
      "@alice",
      { description: "secret message body", chatRoomId: "room-a" },
      shell
    );
    expect(pushLines()).toEqual([
      '[push] Shell notification requested {"chatRoomId":"room-a","shown":true}',
    ]);
    expect(lines.join("\n")).not.toContain("secret message body");
  });

  test("logs why the shell skipped a chat notification", async () => {
    await showNativeToastNotification(
      "basic",
      "@alice",
      { description: "hi", chatRoomId: "room-a" },
      { shouldShowNativeNotification: () => Promise.resolve(false), showNotification: () => Promise.resolve({ shown: false }) }
    );
    await showNativeToastNotification("basic", "@alice", { description: "hi", chatRoomId: "room-b" }, null);
    expect(pushLines()).toEqual([
      '[push] Shell notification skipped {"chatRoomId":"room-a","reason":"shell_declined"}',
      '[push] Shell notification skipped {"chatRoomId":"room-b","reason":"no_shell"}',
    ]);
  });

  test("plain toasts stay out of the push trail", async () => {
    await showNativeToastNotification(
      "success",
      "Saved",
      { description: "Your file was saved." },
      {
        shouldShowNativeNotification: () => Promise.resolve(true),
        showNotification: () => Promise.resolve({ shown: true }),
      }
    );
    expect(pushLines()).toEqual([]);
  });
});
