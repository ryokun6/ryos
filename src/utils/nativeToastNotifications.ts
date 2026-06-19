import type {
  RyosDesktopApi,
  RyosDesktopNotificationOptions,
} from "@/types/ryos-desktop";
import { toast } from "sonner";

export type NativeToastKind = "basic" | "success" | "error" | "info" | "warning";

export type NativeToastOptions = {
  description?: unknown;
  action?: unknown;
  cancel?: unknown;
  duration?: unknown;
  id?: unknown;
};

const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 240;
const PROGRESS_TOAST_ID_PATTERN = /(progress|loading|prefetch)/i;
const SENSITIVE_TEXT_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i,
  /\b(?:access|refresh|id)?_?token\s*[:=]\s*\S+/i,
  /\b(?:api[_-]?key|secret|password|authorization)\s*[:=]\s*\S+/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
  /\b[A-Za-z0-9+/=_-]{48,}\b/,
];

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

function hasSensitiveText(value: string): boolean {
  return SENSITIVE_TEXT_PATTERNS.some((pattern) => pattern.test(value));
}

function toSafeNotificationText(
  value: unknown,
  maxLength: number
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || hasSensitiveText(normalized)) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
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

export function getNativeToastNotification(
  _kind: NativeToastKind,
  message: unknown,
  options?: NativeToastOptions
): RyosDesktopNotificationOptions | null {
  if (shouldSkipNativeToast(options)) {
    return null;
  }

  const title = toSafeNotificationText(message, MAX_TITLE_LENGTH);
  if (!title) {
    return null;
  }

  if (options?.description !== undefined && options.description !== null) {
    const body = toSafeNotificationText(options.description, MAX_BODY_LENGTH);
    if (!body) {
      return null;
    }
    return { title, body };
  }

  return { title };
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
  options?: NativeToastOptions
): Promise<void> {
  const payload = getNativeToastNotification(kind, message, options);
  if (!payload || !(await shouldShowNativeToastNotification())) {
    return;
  }

  await getDesktopApi()?.showNotification(payload).catch(() => undefined);
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
