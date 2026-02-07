import { addPluginListener, invoke, type PluginListener } from "@tauri-apps/api/core";

const IOS_PUSH_PLUGIN = "ios-push";

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

export async function requestPushPermission(): Promise<PushPermissionResult> {
  return invoke<PushPermissionResult>(`plugin:${IOS_PUSH_PLUGIN}|request_push_permission`);
}

export async function getPushToken(): Promise<string> {
  return invoke<string>(`plugin:${IOS_PUSH_PLUGIN}|get_push_token`);
}

export async function onPushToken(
  handler: (token: string) => void
): Promise<PluginListener> {
  return addPluginListener<PushTokenPayload>(IOS_PUSH_PLUGIN, "token", (payload) => {
    if (payload?.token) {
      handler(payload.token);
    }
  });
}

export async function onPushNotification(
  handler: (payload: IosPushNotificationPayload) => void
): Promise<PluginListener> {
  return addPluginListener<IosPushNotificationPayload>(
    IOS_PUSH_PLUGIN,
    "notification",
    handler
  );
}

export async function onPushNotificationTapped(
  handler: (payload: IosPushNotificationPayload) => void
): Promise<PluginListener> {
  return addPluginListener<IosPushNotificationPayload>(
    IOS_PUSH_PLUGIN,
    "notification-tapped",
    handler
  );
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
