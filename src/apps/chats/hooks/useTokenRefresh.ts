import { useEffect, useRef } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import * as React from "react";

const CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour

export function useTokenRefresh() {
  const checkAndRefreshTokenIfNeeded = useChatsStore(
    (state) => state.checkAndRefreshTokenIfNeeded
  );
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only run if we have both username and token
    if (!username || !authToken) {
      return;
    }

    // Check immediately on mount
    console.log("[useTokenRefresh] Checking token on mount...");
    checkAndRefreshTokenIfNeeded().then((result) => {
      if (result.refreshed) {
        console.log("[useTokenRefresh] Token was automatically refreshed");
      }
    });

    // Set up periodic check (every hour)
    intervalRef.current = setInterval(() => {
      console.log("[useTokenRefresh] Hourly token check...");
      checkAndRefreshTokenIfNeeded().then((result) => {
        if (result.refreshed) {
          console.log(
            "[useTokenRefresh] Token was automatically refreshed during hourly check"
          );
        }
      });
    }, CHECK_INTERVAL);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [username, authToken, checkAndRefreshTokenIfNeeded]);
}

// Hook to get the current token age
export function useTokenAge() {
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);
  const [ageInDays, setAgeInDays] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!username || !authToken) {
      setAgeInDays(null);
      return;
    }

    const calculateAge = () => {
      const key = `_token_refresh_time_${username}`;
      const refreshTimeStr = localStorage.getItem(key);

      if (!refreshTimeStr) {
        setAgeInDays(null);
        return;
      }

      const refreshTime = parseInt(refreshTimeStr, 10);
      const age = Date.now() - refreshTime;
      const days = Math.floor(age / (24 * 60 * 60 * 1000));
      setAgeInDays(days);
    };

    // Calculate immediately
    calculateAge();

    // Update every minute
    const interval = setInterval(calculateAge, 60 * 1000);

    return () => clearInterval(interval);
  }, [username, authToken]);

  return { ageInDays };
}
