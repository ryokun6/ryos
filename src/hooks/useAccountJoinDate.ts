import { useCallback, useEffect, useState } from "react";
import { getAuthSession } from "@/api/auth";

interface UseAccountJoinDateOptions {
  username?: string | null;
  isAuthenticated?: boolean;
}

export function useAccountJoinDate({
  username,
  isAuthenticated,
}: UseAccountJoinDateOptions) {
  const [accountJoinedAt, setAccountJoinedAt] = useState<number | null>(null);

  const refreshAccountJoinDate = useCallback(async (): Promise<number | null> => {
    if (!username || !isAuthenticated) {
      setAccountJoinedAt(null);
      return null;
    }

    try {
      const session = await getAuthSession();
      if (!session.ok || !session.data.authenticated) {
        setAccountJoinedAt(null);
        return null;
      }

      const createdAt = session.data.createdAt;
      if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
        setAccountJoinedAt(createdAt);
        return createdAt;
      }

      setAccountJoinedAt(null);
      return null;
    } catch (error) {
      console.error("[AccountJoinDate] Failed to fetch session:", error);
      setAccountJoinedAt(null);
      return null;
    }
  }, [username, isAuthenticated]);

  useEffect(() => {
    void refreshAccountJoinDate();
  }, [refreshAccountJoinDate]);

  return {
    accountJoinedAt,
    refreshAccountJoinDate,
  };
}
