/**
 * Native browser (OS-level) notification utilities for chat notifications.
 * When the tab is hidden and permission is granted, shows native notifications
 * instead of Sonner toasts so users see alerts when switched to another tab/app.
 */

import { useState, useCallback } from "react";

const DEFAULT_ICON = "/icons/mac-192.png";

export type NotificationPermission = "granted" | "denied" | "default";

/**
 * Returns whether the Notification API is available (browser supports it,
 * not in SSR, etc.). Does NOT check permission state.
 */
export function isNotificationApiAvailable(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

/**
 * Returns the current notification permission state.
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationApiAvailable()) {
    return "denied";
  }
  return Notification.permission as NotificationPermission;
}

/**
 * Requests notification permission from the user. Must be called in response to
 * a user gesture (e.g. menu click). Returns the resulting permission state.
 */
export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationApiAvailable()) {
    return Promise.resolve("denied");
  }
  if (Notification.permission !== "default") {
    return Promise.resolve(Notification.permission as NotificationPermission);
  }
  return Notification.requestPermission().then(
    (result) => result as NotificationPermission
  );
}

/**
 * Returns true if we should show native notifications (tab hidden + permission granted).
 * Callers use this to decide: native notification vs Sonner toast.
 */
export function shouldShowNativeNotification(): boolean {
  if (!isNotificationApiAvailable()) {
    return false;
  }
  if (typeof document === "undefined" || !document.hidden) {
    return false;
  }
  return Notification.permission === "granted";
}

export interface ShowChatNotificationParams {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  onClick?: () => void;
}

/**
 * Shows a native browser notification when tab is hidden and permission is granted.
 * Returns true if a native notification was shown; false means the caller should
 * fall back to Sonner toast (tab visible or no permission).
 * Caller must provide onClick to open Chats and switch to the relevant room.
 */
export function showChatNotification(
  params: ShowChatNotificationParams
): boolean {
  if (!shouldShowNativeNotification()) {
    return false;
  }

  const { title, body, icon = DEFAULT_ICON, tag, onClick } = params;

  try {
    const n = new Notification(title, {
      body,
      icon,
      tag: tag ?? undefined,
      requireInteraction: false,
    });

    n.onclick = () => {
      n.close();
      onClick?.();
      window.focus();
    };

    return true;
  } catch {
    return false;
  }
}

/**
 * React hook for notification permission state.
 * Use when you need to show permission state in UI and request permission on user action.
 */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    getNotificationPermission()
  );

  const requestPermission = useCallback(async () => {
    const result = await requestNotificationPermission();
    setPermission(result);
    return result;
  }, []);

  return { permission, requestPermission };
}
