import { addPluginListener, invoke, type PluginListener } from "@tauri-apps/api/core";
import { normalizePushToken } from "@/utils/pushToken";

const IOS_PUSH_PLUGIN = "ios-push";
export const PUSH_TOKEN_UNAVAILABLE_ERROR = "APNs token is not available yet";
export const PUSH_REGISTRATION_ERROR_FALLBACK_MESSAGE =
  "Could not register for push notifications on this device.";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export interface PushPermissionResult {
  granted: boolean;
}

export interface IosPushNotificationPayload {
  aps?: {
    alert?: string | { title?: string; body?: string };
    badge?: number;
    sound?: string;
  };
  [key: string]: unknown;
}

interface PushTokenPayload {
  token: string;
}

export interface PushRegistrationErrorPayload {
  message: string;
}

export function normalizePushPermissionResult(payload: unknown): PushPermissionResult {
  if (isPlainRecord(payload) && payload.granted === true) {
    return { granted: true };
  }
  return { granted: false };
}

export function normalizeInvokedPushToken(token: unknown): string {
  const normalizedToken = normalizePushToken(token);
  if (!normalizedToken) {
    throw new Error(PUSH_TOKEN_UNAVAILABLE_ERROR);
  }
  return normalizedToken;
}

export function extractNormalizedPushToken(
  payload: Partial<PushTokenPayload> | null | undefined
): string | null {
  return normalizePushToken(payload?.token);
}

export function normalizePushNotificationPayload(
  payload: unknown
): IosPushNotificationPayload {
  return isPlainRecord(payload) ? (payload as IosPushNotificationPayload) : {};
}

export function normalizePushRegistrationErrorPayload(
  payload: unknown
): PushRegistrationErrorPayload {
  if (isPlainRecord(payload) && typeof payload.message === "string") {
    const message = payload.message.trim();
    if (message.length > 0) {
      return { message };
    }
  }

  return {
    message: PUSH_REGISTRATION_ERROR_FALLBACK_MESSAGE,
  };
}

function addPushNotificationListener(
  eventName: "notification" | "notification-tapped",
  handler: (payload: IosPushNotificationPayload) => void
): Promise<PluginListener> {
  return addPluginListener<IosPushNotificationPayload>(
    IOS_PUSH_PLUGIN,
    eventName,
    (payload) => handler(normalizePushNotificationPayload(payload))
  );
}

export async function requestPushPermission(): Promise<PushPermissionResult> {
  const payload = await invoke<unknown>(`plugin:${IOS_PUSH_PLUGIN}|request_push_permission`);
  return normalizePushPermissionResult(payload);
}

export async function getPushToken(): Promise<string> {
  const token = await invoke<string>(`plugin:${IOS_PUSH_PLUGIN}|get_push_token`);
  return normalizeInvokedPushToken(token);
}

export async function onPushToken(
  handler: (token: string) => void
): Promise<PluginListener> {
  return addPluginListener<PushTokenPayload>(IOS_PUSH_PLUGIN, "token", (payload) => {
    const normalizedToken = extractNormalizedPushToken(payload);
    if (normalizedToken) {
      handler(normalizedToken);
    }
  });
}

export async function onPushNotification(
  handler: (payload: IosPushNotificationPayload) => void
): Promise<PluginListener> {
  return addPushNotificationListener("notification", handler);
}

export async function onPushNotificationTapped(
  handler: (payload: IosPushNotificationPayload) => void
): Promise<PluginListener> {
  return addPushNotificationListener("notification-tapped", handler);
}

export async function onPushRegistrationError(
  handler: (payload: PushRegistrationErrorPayload) => void
): Promise<PluginListener> {
  return addPluginListener<unknown>(
    IOS_PUSH_PLUGIN,
    "registration-error",
    (payload) => handler(normalizePushRegistrationErrorPayload(payload))
  );
}

export function extractPushAlert(payload: IosPushNotificationPayload): {
  title: string;
  body: string;
} {
  const normalizeAlertText = (value: unknown): string =>
    typeof value === "string" ? value.trim() : "";

  const alert = payload.aps?.alert;
  if (typeof alert === "string") {
    return { title: "Notification", body: normalizeAlertText(alert) };
  }

  if (alert && typeof alert === "object") {
    const title = normalizeAlertText(alert.title) || "Notification";
    const body = normalizeAlertText(alert.body);
    return { title, body };
  }

  return { title: "Notification", body: "" };
}
