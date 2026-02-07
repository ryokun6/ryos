import { useEffect, useRef, useState } from "react";
import { toast } from "@/hooks/useToast";
import { useChatsStore } from "@/stores/useChatsStore";
import { getApiUrl, isTauriIOS } from "@/utils/platform";
import {
  extractPushAlert,
  getPushToken,
  onPushNotification,
  onPushNotificationTapped,
  onPushRegistrationError,
  onPushToken,
  requestPushPermission,
} from "@/utils/tauriPushNotifications";

const NATIVE_REGISTRATION_ERROR_DEDUPE_MS = 15_000;

export function useTauriPushNotifications() {
  const { username, authToken } = useChatsStore((state) => ({
    username: state.username,
    authToken: state.authToken,
  }));

  const [deviceToken, setDeviceToken] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const lastRegisteredRef = useRef<string | null>(null);
  const lastRegistrationErrorRef = useRef<string | null>(null);
  const lastNativeRegistrationErrorRef = useRef<{
    message: string;
    at: number;
  } | null>(null);

  useEffect(() => {
    if (!isTauriIOS() || initializedRef.current) return;
    initializedRef.current = true;

    let isDisposed = false;
    let tokenUnlisten: (() => Promise<void>) | undefined;
    let notificationUnlisten: (() => Promise<void>) | undefined;
    let tapUnlisten: (() => Promise<void>) | undefined;
    let registrationErrorUnlisten: (() => Promise<void>) | undefined;

    const init = async () => {
      try {
        const tokenListener = await onPushToken((token) => {
          if (!isDisposed) {
            setDeviceToken(token);
          }
        });
        tokenUnlisten = () => tokenListener.unregister();

        const notificationListener = await onPushNotification((payload) => {
          const { title, body } = extractPushAlert(payload);
          if (title || body) {
            toast(title || "Notification", {
              description: body || undefined,
            });
          }
        });
        notificationUnlisten = () => notificationListener.unregister();

        const tapListener = await onPushNotificationTapped((payload) => {
          const { title, body } = extractPushAlert(payload);
          toast(title || "Notification", {
            description: body || "Opened from notification",
          });
        });
        tapUnlisten = () => tapListener.unregister();

        const registrationErrorListener = await onPushRegistrationError((payload) => {
          const description =
            typeof payload?.message === "string" && payload.message.trim().length > 0
              ? payload.message
              : "Could not register for push notifications on this device.";
          const now = Date.now();
          const previousError = lastNativeRegistrationErrorRef.current;
          if (
            previousError &&
            previousError.message === description &&
            now - previousError.at < NATIVE_REGISTRATION_ERROR_DEDUPE_MS
          ) {
            return;
          }
          lastNativeRegistrationErrorRef.current = {
            message: description,
            at: now,
          };
          toast("Push registration failed", {
            description,
          });
        });
        registrationErrorUnlisten = () => registrationErrorListener.unregister();

        const permission = await requestPushPermission();
        if (!permission.granted) {
          return;
        }

        try {
          const token = await getPushToken();
          if (!isDisposed) {
            setDeviceToken(token);
          }
        } catch {
          // Token may not be available immediately after requesting permission.
        }
      } catch (error) {
        console.error("[push] Failed to initialize iOS push bridge", error);
      }
    };

    init();

    return () => {
      isDisposed = true;
      void tokenUnlisten?.();
      void notificationUnlisten?.();
      void tapUnlisten?.();
      void registrationErrorUnlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauriIOS()) return;
    if (!deviceToken || !username || !authToken) return;

    const registerKey = `${username}:${deviceToken}`;
    if (lastRegisteredRef.current === registerKey) return;

    let cancelled = false;

    const register = async () => {
      try {
        const response = await fetch(getApiUrl("/api/push/register"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
            "X-Username": username,
          },
          body: JSON.stringify({
            token: deviceToken,
            platform: "ios",
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || `HTTP ${response.status}`);
        }

        if (!cancelled) {
          lastRegisteredRef.current = registerKey;
          lastRegistrationErrorRef.current = null;
          lastNativeRegistrationErrorRef.current = null;
        }
      } catch (error) {
        console.error("[push] Failed to register iOS push token", error);
        if (!cancelled && lastRegistrationErrorRef.current !== registerKey) {
          lastRegistrationErrorRef.current = registerKey;
          toast("Push registration failed", {
            description:
              error instanceof Error
                ? error.message
                : "Could not register this device token with the server.",
          });
        }
      }
    };

    register();

    return () => {
      cancelled = true;
    };
  }, [deviceToken, username, authToken]);

  useEffect(() => {
    if (!username || !authToken) {
      lastRegisteredRef.current = null;
      lastRegistrationErrorRef.current = null;
      lastNativeRegistrationErrorRef.current = null;
    }
  }, [username, authToken]);
}
