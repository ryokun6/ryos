import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getDesktopChatNotificationRendererMode,
  getMainChatNotificationDecision,
  sanitizeDesktopChatNotificationManageResult,
  sanitizeDesktopChatNotificationConfig,
  sanitizeDesktopChatNotificationState,
  shouldSubscribeRoomInMain,
  shouldUseRendererChatNotificationFallback,
  shouldUseMainChatNotificationService,
} from "../src/utils/desktopChatNotificationPolicy";
import {
  buildLocalRealtimeClientMessage,
  buildLocalRealtimeTicketWebSocketUrl,
  sanitizeDesktopChatNotificationWebSocketUrl,
} from "../src/utils/desktopChatNotificationRealtime";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("desktop chat notification policy", () => {
  test("sanitizes public realtime config without accepting invalid origins", () => {
    expect(
      sanitizeDesktopChatNotificationConfig({
        appPublicOrigin: "https://os.ryo.lu/some/path",
        realtimeProvider: "pusher",
        websocketUrl: "wss://evil.example/ws",
        pusher: {
          key: "public-key",
          cluster: "us3",
        },
      })
    ).toEqual({
      appPublicOrigin: "https://os.ryo.lu",
      realtimeProvider: "pusher",
      websocketUrl: null,
      pusher: {
        key: "public-key",
        cluster: "us3",
        forceTLS: true,
      },
    });

    expect(
      sanitizeDesktopChatNotificationConfig({
        appPublicOrigin: "file:///tmp/app",
        realtimeProvider: "pusher",
        pusher: { key: "public-key", cluster: "us3" },
      })
    ).toBeNull();
  });

  test("manages supported providers and falls back without auth", () => {
    const state = sanitizeDesktopChatNotificationState({
      username: "Ryo",
      isAuthenticated: true,
      rooms: [{ id: "room-a", type: "public" }],
    });

    expect(
      shouldUseMainChatNotificationService(
        sanitizeDesktopChatNotificationConfig({
          appPublicOrigin: "https://os.ryo.lu",
          realtimeProvider: "local",
          websocketUrl: "wss://os.ryo.lu/ws",
        }),
        state
      )
    ).toEqual({ managed: true, ready: false });

    expect(
      shouldUseMainChatNotificationService(
        sanitizeDesktopChatNotificationConfig({
          appPublicOrigin: "https://os.ryo.lu",
          realtimeProvider: "pusher",
          websocketUrl: null,
          pusher: { key: "public-key", cluster: "us3" },
        }),
        { ...state, isAuthenticated: false }
      )
    ).toEqual({ managed: false, reason: "missing-auth" });
  });

  test("sanitizes async main-service fallback statuses", () => {
    expect(
      sanitizeDesktopChatNotificationManageResult({
        managed: false,
        reason: "channel-auth-failed",
      })
    ).toEqual({ managed: false, reason: "channel-auth-failed" });

    expect(
      getDesktopChatNotificationRendererMode({
        managed: false,
        reason: "service-start-failed",
      })
    ).toBe("renderer");
    expect(getDesktopChatNotificationRendererMode({ managed: true })).toBe(
      "renderer"
    );
    expect(
      getDesktopChatNotificationRendererMode({ managed: true, ready: true })
    ).toBe("managed");
    expect(
      sanitizeDesktopChatNotificationManageResult({
        managed: false,
        reason: "cookie-leaked",
      })
    ).toBeNull();
  });

  test("main service includes trusted origin and emits fallback status", () => {
    const source = readSource("electron/chat-notifications.ts");
    expect(source).toContain("Origin: appPublicOrigin");
    expect(source).toContain("/api/realtime/ticket");
    expect(source).toContain("subscription_error");
    expect(source).toContain("ryos-desktop:chat-notification-status");
    expect(source).toContain("buildChatRoomNotificationTag(message.roomId)");
    expect(source).toContain('"channel-auth-failed"');
    expect(source).toContain('"service-start-failed"');
  });

  test("desktop shell exposes notification status and shared sanitizer", () => {
    const mainSource = readSource("electron/main.ts");
    const preloadSource = readSource("electron/preload.ts");
    const typeSource = readSource("src/types/ryos-desktop.d.ts");
    expect(mainSource).toContain("ryos-desktop:get-notification-status");
    expect(mainSource).toContain("sanitizeSystemNotificationPayload(options)");
    expect(preloadSource).toContain("getNotificationStatus");
    expect(typeSource).toContain("getNotificationStatus");
  });

  test("renderer chat display uses stable shared notification tags", () => {
    const source = readSource("src/utils/chatNotificationDisplay.ts");
    expect(source).toContain("buildChatRoomNotificationTag(roomId)");
    expect(source).toContain("buildChatAiNotificationTag()");
    expect(source).toContain("tag,");
  });

  test("sanitizes local WebSocket config and strips ticket params", () => {
    expect(
      sanitizeDesktopChatNotificationConfig({
        appPublicOrigin: "https://os.ryo.lu",
        realtimeProvider: "local",
        websocketUrl: "wss://os.ryo.lu/ws?ticket=leaked&v=1#frag",
      })
    ).toEqual({
      appPublicOrigin: "https://os.ryo.lu",
      realtimeProvider: "local",
      websocketUrl: "wss://os.ryo.lu/ws?v=1",
      pusher: null,
    });

    expect(
      sanitizeDesktopChatNotificationWebSocketUrl(
        "wss://attacker.example/ws",
        "https://os.ryo.lu"
      )
    ).toBeNull();
    expect(
      sanitizeDesktopChatNotificationWebSocketUrl(
        "ws://os.ryo.lu/ws",
        "https://os.ryo.lu"
      )
    ).toBeNull();
    expect(
      sanitizeDesktopChatNotificationWebSocketUrl(null, "http://localhost:3000")
    ).toBe("ws://localhost:3000/ws");
  });

  test("builds local realtime protocol messages without exposing cookies", () => {
    expect(
      buildLocalRealtimeClientMessage({
        type: "subscribe",
        channel: "private-chats-ryo",
      })
    ).toBe('{"type":"subscribe","channel":"private-chats-ryo"}');
    expect(
      buildLocalRealtimeClientMessage({
        type: "unsubscribe",
        channel: "room-abc",
      })
    ).toBe('{"type":"unsubscribe","channel":"room-abc"}');
    expect(buildLocalRealtimeClientMessage({ type: "ping" })).toBe(
      '{"type":"ping"}'
    );
    expect(
      buildLocalRealtimeTicketWebSocketUrl("wss://os.ryo.lu/ws?v=1", "ticket-a")
    ).toBe("wss://os.ryo.lu/ws?v=1&ticket=ticket-a");
  });

  test("renderer hook resumes renderer mode from main fallback status", () => {
    const source = readSource("src/hooks/useBackgroundChatNotifications.ts");
    expect(source).toContain("desktop.onChatNotificationStatus");
    expect(source).toContain("desktop.onChatNotificationEvent");
    expect(source).toContain("getDesktopChatNotificationRendererMode(status)");
    expect(source.indexOf("desktop.onChatNotificationStatus")).toBeLessThan(
      source.indexOf(".configureChatNotifications(")
    );
    expect(source.indexOf("desktop.onChatNotificationEvent")).toBeLessThan(
      source.indexOf(".configureChatNotifications(")
    );
  });

  test("renderer fallback stays active until main is ready", () => {
    expect(
      shouldUseRendererChatNotificationFallback({
        isBackgroundMode: true,
        desktopNotificationMode: "unknown",
      })
    ).toBe(true);
    expect(
      shouldUseRendererChatNotificationFallback({
        isBackgroundMode: true,
        desktopNotificationMode: "renderer",
      })
    ).toBe(true);
    expect(
      shouldUseRendererChatNotificationFallback({
        isBackgroundMode: true,
        desktopNotificationMode: "managed",
      })
    ).toBe(false);
    expect(
      shouldUseRendererChatNotificationFallback({
        isBackgroundMode: false,
        desktopNotificationMode: "unknown",
      })
    ).toBe(false);
  });

  test("keeps main subscribed across chatsOpen transitions", () => {
    expect(
      shouldSubscribeRoomInMain(
        { id: "room-a", type: "public" },
        { chatsOpen: false }
      )
    ).toBe(true);
    expect(
      shouldSubscribeRoomInMain(
        { id: "irc-a", type: "irc" },
        { chatsOpen: false }
      )
    ).toBe(false);
    expect(
      shouldSubscribeRoomInMain(
        { id: "room-b", type: "private" },
        { chatsOpen: true }
      )
    ).toBe(true);
  });

  test("routes notification display to main only while the app is backgrounded", () => {
    expect(
      getMainChatNotificationDecision({
        chatsOpen: false,
        currentRoomId: null,
        messageRoomId: "room-a",
        mainWindowForeground: false,
      })
    ).toEqual({
      incrementUnread: true,
      showInMain: true,
      showInRenderer: false,
    });

    expect(
      getMainChatNotificationDecision({
        chatsOpen: false,
        currentRoomId: null,
        messageRoomId: "room-a",
        mainWindowForeground: true,
      })
    ).toEqual({
      incrementUnread: true,
      showInMain: false,
      showInRenderer: true,
    });

    expect(
      getMainChatNotificationDecision({
        chatsOpen: true,
        currentRoomId: "room-a",
        messageRoomId: "room-a",
        mainWindowForeground: false,
      })
    ).toEqual({
      incrementUnread: false,
      showInMain: false,
      showInRenderer: false,
    });

    expect(
      getMainChatNotificationDecision({
        chatsOpen: true,
        currentRoomId: "room-a",
        messageRoomId: "room-a",
        mainWindowForeground: true,
      })
    ).toEqual({
      incrementUnread: false,
      showInMain: false,
      showInRenderer: false,
    });
  });
});
