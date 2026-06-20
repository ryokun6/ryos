import { useCallback, useEffect, useState } from "react";
import { getEmailStatus } from "@/api/auth";
import type { EmailStatusResponse } from "@/shared/contracts/auth";

interface UseRecoveryEmailOptions {
  username?: string | null;
  isAuthenticated?: boolean;
}

export function useRecoveryEmail({
  username,
  isAuthenticated,
}: UseRecoveryEmailOptions) {
  const [recoveryEmailStatus, setRecoveryEmailStatus] =
    useState<EmailStatusResponse | null>(null);
  const [isEmailStatusLoading, setIsEmailStatusLoading] = useState(false);

  const refreshRecoveryEmailStatus =
    useCallback(async (): Promise<EmailStatusResponse | null> => {
      if (!username || !isAuthenticated) {
        setRecoveryEmailStatus(null);
        setIsEmailStatusLoading(false);
        return null;
      }

      setIsEmailStatusLoading(true);
      try {
        const result = await getEmailStatus();
        setRecoveryEmailStatus(result);
        return result;
      } catch (error) {
        console.error("[RecoveryEmail] Failed to fetch email status:", error);
        return null;
      } finally {
        setIsEmailStatusLoading(false);
      }
    }, [username, isAuthenticated]);

  useEffect(() => {
    void refreshRecoveryEmailStatus();
  }, [refreshRecoveryEmailStatus]);

  return {
    recoveryEmailStatus,
    isEmailStatusLoading,
    refreshRecoveryEmailStatus,
  };
}
