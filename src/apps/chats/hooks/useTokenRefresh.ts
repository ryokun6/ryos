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
  const isCheckingRef = useRef<boolean>(false);

  useEffect(() => {
    // Clear any existing interval first to prevent race conditions
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Only run if we have both username and token
    if (!username || !authToken) {
      return;
    }

    // Wrapped token check function with race condition protection
    const performTokenCheck = async (context: string) => {
      if (isCheckingRef.current) {
        console.log(`[useTokenRefresh] Skipping ${context} - check already in progress`);
        return;
      }

      isCheckingRef.current = true;
      try {
        console.log(`[useTokenRefresh] ${context}...`);
        const result = await checkAndRefreshTokenIfNeeded();
        if (result.refreshed) {
          console.log(`[useTokenRefresh] Token was automatically refreshed during ${context}`);
        }
      } catch (error) {
        console.error(`[useTokenRefresh] Error during ${context}:`, error);
      } finally {
        isCheckingRef.current = false;
      }
    };

    // Check immediately on mount
    performTokenCheck("Checking token on mount");

    // Set up periodic check (every hour)
    intervalRef.current = setInterval(() => {
      performTokenCheck("Hourly token check");
    }, CHECK_INTERVAL);

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      isCheckingRef.current = false;
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
