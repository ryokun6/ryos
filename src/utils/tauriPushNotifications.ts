import { addPluginListener, invoke, type PluginListener } from "@tauri-apps/api/core";
import { normalizePushToken } from "@/utils/pushToken";

const IOS_PUSH_PLUGIN = "ios-push";
export const PUSH_TOKEN_UNAVAILABLE_ERROR = "APNs token is not available yet";

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  return addPluginListener<PushRegistrationErrorPayload>(
    IOS_PUSH_PLUGIN,
    "registration-error",
    handler
  );
}

export function extractPushAlert(payload: IosPushNotificationPayload): {
  title: string;
  body: string;
} {
  const alert = payload.aps?.alert;
  if (typeof alert === "string") {
    return { title: "Notification", body: alert };
  }

  if (alert && typeof alert === "object") {
    const title = typeof alert.title === "string" ? alert.title : "Notification";
    const body = typeof alert.body === "string" ? alert.body : "";
    return { title, body };
  }

  return { title: "Notification", body: "" };
}
