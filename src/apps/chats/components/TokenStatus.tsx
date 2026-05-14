import { CheckCircle } from "@phosphor-icons/react";
import { useChatsStore } from "@/stores/useChatsStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useTranslation } from "react-i18next";

/**
 * Shows authentication status. With cookie-only auth, sessions are managed
 * server-side via httpOnly cookies — no client-side token age or refresh.
 */
export function TokenStatus() {
  const { t } = useTranslation();
  const debugMode = useDisplaySettingsStore((state) => state.debugMode);
  const username = useChatsStore((state) => state.username);
  const isAuthenticated = useChatsStore((state) => state.isAuthenticated);

  // Debug mode: Show simple auth status
  if (debugMode && username && isAuthenticated) {
    return (
      <div className="flex items-center gap-1 px-2 py-0.5">
        <CheckCircle className="size-3 text-green-500" weight="bold" />
        <span className="font-geneva-12 text-[11px] text-green-600">
          {t("apps.chats.tokenStatus.authenticated", { defaultValue: "Logged in" })}
        </span>
      </div>
    );
  }

  return null;
}
