import type {
  RyosDesktopApi,
  RyosDesktopNotificationOptions,
} from "@/types/ryos-desktop";
import { toast } from "sonner";
import {
  sanitizeSystemNotificationPayload,
  type SystemNotificationTimeoutType,
  type SystemNotificationUrgency,
} from "@/utils/systemNotifications";

export type NativeToastKind = "basic" | "success" | "error" | "info" | "warning";

export type NativeToastOptions = {
  description?: unknown;
  action?: unknown;
  cancel?: unknown;
  duration?: unknown;
  id?: unknown;
  chatRoomId?: unknown;
  tag?: unknown;
  silent?: unknown;
  urgency?: unknown;
  timeoutType?: unknown;
};

const PROGRESS_TOAST_ID_PATTERN = /(progress|loading|prefetch)/i;

let installed = false;

export type NativeToastDesktopApi = Pick<
  RyosDesktopApi,
  "shouldShowNativeNotification" | "showNotification"
>;

type ToastMethodName =
  | "success"
  | "error"
  | "info"
  | "warning"
  | "message";

type ToastMethod = (message: unknown, options?: NativeToastOptions) => unknown;
type ToastMethodRegistry = Record<string, ToastMethod> & {
  __ryosNativeNotificationsInstalled?: boolean;
};

const NATIVE_TOAST_METHODS: Array<{
  name: ToastMethodName;
  kind: NativeToastKind;
}> = [
  { name: "success", kind: "success" },
  { name: "error", kind: "error" },
  { name: "info", kind: "info" },
  { name: "warning", kind: "warning" },
  { name: "message", kind: "basic" },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getNativeToastOptions(
  value: unknown
): NativeToastOptions | undefined {
  return isPlainObject(value) ? value : undefined;
}

function shouldSkipNativeToast(options: NativeToastOptions | undefined): boolean {
  if (!options) {
    return false;
  }

  if (options.action !== undefined || options.cancel !== undefined) {
    return true;
  }
  if (options.duration === Infinity || options.duration === 0) {
    return true;
  }
  if (
    typeof options.id === "string" &&
    PROGRESS_TOAST_ID_PATTERN.test(options.id)
  ) {
    return true;
  }

  return false;
}

function getNativeToastChatRoomId(
  options: NativeToastOptions | undefined
): string | null | undefined {
  if (!options || !("chatRoomId" in options)) {
    return undefined;
  }
  return typeof options.chatRoomId === "string" || options.chatRoomId === null
    ? options.chatRoomId
    : undefined;
}

function getNativeToastUrgency(
  options: NativeToastOptions | undefined
): SystemNotificationUrgency | undefined {
  return options?.urgency === "low" ||
    options?.urgency === "normal" ||
    options?.urgency === "critical"
    ? options.urgency
    : undefined;
}

function getNativeToastTimeoutType(
  options: NativeToastOptions | undefined
): SystemNotificationTimeoutType | undefined {
  return options?.timeoutType === "default" || options?.timeoutType === "never"
    ? options.timeoutType
    : undefined;
}

export function getNativeToastNotification(
  _kind: NativeToastKind,
  message: unknown,
  options?: NativeToastOptions
): RyosDesktopNotificationOptions | null {
  if (shouldSkipNativeToast(options)) {
    return null;
  }

  const chatRoomId = getNativeToastChatRoomId(options);
  const hasDescription =
    options?.description !== undefined && options.description !== null;
  const payload = sanitizeSystemNotificationPayload({
    title: message,
    body: hasDescription ? options.description : undefined,
    chatRoomId,
    tag: options?.tag,
    silent: options?.silent === true,
    urgency: getNativeToastUrgency(options),
    timeoutType: getNativeToastTimeoutType(options),
  });

  if (hasDescription && !payload?.body) {
    return null;
  }

  return payload;
}

function getDesktopApi() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.ryosDesktop ?? null;
}

export async function shouldShowNativeToastNotification(
  desktopApi: NativeToastDesktopApi | null | undefined = getDesktopApi()
): Promise<boolean> {
  if (!desktopApi?.shouldShowNativeNotification) {
    return false;
  }

  return desktopApi.shouldShowNativeNotification().catch(() => false);
}

export async function showNativeToastNotification(
  kind: NativeToastKind,
  message: unknown,
  options?: NativeToastOptions,
  desktopApi: NativeToastDesktopApi | null | undefined = getDesktopApi()
): Promise<boolean> {
  const payload = getNativeToastNotification(kind, message, options);
  if (!payload || !(await shouldShowNativeToastNotification(desktopApi))) {
    return false;
  }

  const result = await desktopApi?.showNotification(payload).catch(() => null);
  return result?.shown === true;
}

export function installNativeToastNotifications(): void {
  const toastMethods = toast as unknown as ToastMethodRegistry;

  if (installed || toastMethods.__ryosNativeNotificationsInstalled) {
    return;
  }
  installed = true;
  toastMethods.__ryosNativeNotificationsInstalled = true;

  for (const { name, kind } of NATIVE_TOAST_METHODS) {
    const original = toastMethods[name];
    if (typeof original !== "function") {
      continue;
    }

    toastMethods[name] = function nativeToastMethod(
      message: unknown,
      options?: NativeToastOptions
    ) {
      void showNativeToastNotification(
        kind,
        message,
        getNativeToastOptions(options)
      );
      return original.call(this, message, options);
    };
  }
}
