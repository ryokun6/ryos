import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  createTelegramLink,
  disconnectTelegramLink,
  getTelegramLinkStatus,
  type TelegramLinkCreateResponse,
  type TelegramLinkSession,
  type TelegramLinkedAccount,
  type TelegramLinkStatusResponse,
} from "@/api/telegram";

interface UseTelegramLinkOptions {
  username?: string | null;
  authToken?: string | null;
}

export function getTelegramLinkedAccountLabel(
  account: TelegramLinkedAccount
): string {
  if (account.telegramUsername) {
    return `@${account.telegramUsername}`;
  }

  const fullName = [account.firstName, account.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || account.telegramUserId;
}

export function useTelegramLink({
  username,
  authToken,
}: UseTelegramLinkOptions) {
  const { t } = useTranslation();
  const [telegramLinkedAccount, setTelegramLinkedAccount] =
    useState<TelegramLinkedAccount | null>(null);
  const [telegramLinkSession, setTelegramLinkSession] =
    useState<TelegramLinkSession | null>(null);
  const [isTelegramStatusLoading, setIsTelegramStatusLoading] = useState(false);
  const [isCreatingTelegramLink, setIsCreatingTelegramLink] = useState(false);
  const [isDisconnectingTelegramLink, setIsDisconnectingTelegramLink] =
    useState(false);

  const refreshTelegramLinkStatus = useCallback(
    async (): Promise<TelegramLinkStatusResponse | null> => {
    if (!username || !authToken) {
      setTelegramLinkedAccount(null);
      setTelegramLinkSession(null);
      setIsTelegramStatusLoading(false);
      return null;
    }

    setIsTelegramStatusLoading(true);
    try {
      const result = await getTelegramLinkStatus({
        username,
        token: authToken,
      });
      setTelegramLinkedAccount(result.account);
      setTelegramLinkSession(result.account ? null : result.pendingLink);
      return result;
    } catch (error) {
      console.error("[Telegram] Failed to fetch link status:", error);
      return null;
    } finally {
      setIsTelegramStatusLoading(false);
    }
    },
    [username, authToken]
  );

  useEffect(() => {
    void refreshTelegramLinkStatus();
  }, [refreshTelegramLinkStatus]);

  const handleCreateTelegramLink = useCallback(
    async (): Promise<TelegramLinkCreateResponse | null> => {
      if (!username || !authToken) {
        toast.error(t("apps.control-panels.telegram.loginRequired"));
        return null;
      }

      setIsCreatingTelegramLink(true);
      try {
        const result = await createTelegramLink({
          username,
          token: authToken,
        });

        if (result.linkedAccount) {
          setTelegramLinkedAccount(result.linkedAccount);
          setTelegramLinkSession(null);
        } else {
          setTelegramLinkSession(result);
        }

        toast.success(t("apps.control-panels.telegram.linkReady"));
        return result;
      } catch (error) {
        console.error("[Telegram] Failed to create link:", error);
        toast.error(t("apps.control-panels.telegram.linkFailed"));
        return null;
      } finally {
        setIsCreatingTelegramLink(false);
      }
    },
    [username, authToken, t]
  );

  const handleOpenTelegramLink = useCallback(() => {
    if (!telegramLinkSession?.deepLink) {
      toast.error(t("apps.control-panels.telegram.deepLinkUnavailable"));
      return;
    }

    window.open(telegramLinkSession.deepLink, "_blank", "noopener,noreferrer");
  }, [telegramLinkSession, t]);

  const handleCopyTelegramCode = useCallback(async () => {
    if (!telegramLinkSession?.code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(telegramLinkSession.code);
      toast.success(t("apps.control-panels.telegram.codeCopied"));
    } catch (error) {
      console.error("[Telegram] Failed to copy code:", error);
      toast.error(t("apps.control-panels.telegram.copyFailed"));
    }
  }, [telegramLinkSession, t]);

  const handleDisconnectTelegramLink = useCallback(async () => {
    if (!username || !authToken) {
      toast.error(t("apps.control-panels.telegram.loginRequired"));
      return;
    }

    setIsDisconnectingTelegramLink(true);
    try {
      await disconnectTelegramLink({
        username,
        token: authToken,
      });
      setTelegramLinkedAccount(null);
      setTelegramLinkSession(null);
      toast.success(t("apps.control-panels.telegram.disconnected"));
    } catch (error) {
      console.error("[Telegram] Failed to disconnect link:", error);
      toast.error(t("apps.control-panels.telegram.disconnectFailed"));
    } finally {
      setIsDisconnectingTelegramLink(false);
    }
  }, [username, authToken, t]);

  return {
    telegramLinkedAccount,
    telegramLinkSession,
    isTelegramStatusLoading,
    isCreatingTelegramLink,
    isDisconnectingTelegramLink,
    refreshTelegramLinkStatus,
    handleCreateTelegramLink,
    handleOpenTelegramLink,
    handleCopyTelegramCode,
    handleDisconnectTelegramLink,
  };
}
