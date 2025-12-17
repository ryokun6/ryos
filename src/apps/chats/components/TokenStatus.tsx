import React from "react";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useTokenAge } from "../hooks/useTokenRefresh";
import { useChatsStore } from "@/stores/useChatsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";

export function TokenStatus() {
  const { t } = useTranslation();
  const { ageInDays } = useTokenAge();
  const debugMode = useAppStore((state) => state.debugMode);
  const refreshAuthToken = useChatsStore((state) => state.refreshAuthToken);
  const checkAndRefreshTokenIfNeeded = useChatsStore(
    (state) => state.checkAndRefreshTokenIfNeeded
  );
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);

  const [recentlyRefreshed, setRecentlyRefreshed] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [lastRefreshTime, setLastRefreshTime] = React.useState<Date | null>(
    null
  );
  const [refreshError, setRefreshError] = React.useState<string | null>(null);

  // Track token age changes to detect refreshes
  const previousAgeRef = React.useRef(ageInDays);
  React.useEffect(() => {
    if (
      previousAgeRef.current !== null &&
      previousAgeRef.current > 0 &&
      ageInDays === 0
    ) {
      // Token was just refreshed
      setRecentlyRefreshed(true);
      setLastRefreshTime(new Date());
      // Hide the indicator after 5 seconds
      const timer = setTimeout(() => setRecentlyRefreshed(false), 5000);
      return () => clearTimeout(timer);
    }
    previousAgeRef.current = ageInDays;
  }, [ageInDays]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    setRefreshError(null);

    try {
      // Force a refresh by calling checkAndRefreshTokenIfNeeded
      const result = await checkAndRefreshTokenIfNeeded();

      if (result.refreshed) {
        setRecentlyRefreshed(true);
        setLastRefreshTime(new Date());
        setTimeout(() => setRecentlyRefreshed(false), 5000);
      } else {
        // Token is not old enough, force refresh anyway
        const refreshResult = await refreshAuthToken();
        if (refreshResult.ok) {
          setRecentlyRefreshed(true);
          setLastRefreshTime(new Date());
          setTimeout(() => setRecentlyRefreshed(false), 5000);
        } else {
          setRefreshError(refreshResult.error || "Failed to refresh token");
        }
      }
    } catch (error) {
      setRefreshError("Error refreshing token");
      console.error("Manual token refresh error:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Debug mode: Always show persistent status
  if (debugMode && username && authToken) {
    const tokenAgeDisplay = ageInDays ?? 0;
    const tokenStatus =
      tokenAgeDisplay < 7 ? "fresh" : tokenAgeDisplay < 25 ? "active" : "old";
    const statusColor =
      tokenStatus === "fresh"
        ? "text-green-500"
        : tokenStatus === "active"
        ? "text-blue-500"
        : "text-orange-500";

    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 px-2 py-1 h-7"
          title={t("apps.chats.tokenStatus.clickToRefresh")}
        >
          {isRefreshing ? (
            <>
              <ActivityIndicator size="xs" />
              <span className="font-geneva-12 text-[11px]">{t("apps.chats.tokenStatus.refreshing")}</span>
            </>
          ) : (
            <>
              {tokenAgeDisplay === 0 ? (
                <span className="font-geneva-12 text-[11px] text-green-500">
                  {t("apps.chats.tokenStatus.refresh")}
                </span>
              ) : (
                <>
                  <Clock className={`h-3 w-3 ${statusColor}`} />
                  <span className={`font-geneva-12 text-[11px] ${statusColor}`}>
                    {t("apps.chats.tokenStatus.daysOld", { days: tokenAgeDisplay })}
                  </span>
                </>
              )}
            </>
          )}
        </Button>

        {recentlyRefreshed && (
          <span className="font-geneva-12 text-[11px] text-green-500 animate-fade-in">
            ✓ {t("apps.chats.tokenStatus.refreshed")}
          </span>
        )}

        {refreshError && (
          <span className="font-geneva-12 text-[11px] text-red-500 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {refreshError}
          </span>
        )}

        {lastRefreshTime && !recentlyRefreshed && (
          <span
            className="font-geneva-12 text-[11px] text-gray-400"
            title={lastRefreshTime.toLocaleString()}
          >
            {t("apps.chats.tokenStatus.last")}: {getRelativeTime(lastRefreshTime)}
          </span>
        )}
      </div>
    );
  }

  // Normal mode: Only show indicator if token was just refreshed
  if (!recentlyRefreshed) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 px-2 py-0.5 bg-green-100/80 text-green-700 rounded-md animate-fade-in">
      <CheckCircle className="h-3 w-3" />
      <span className="font-geneva-12 text-[11px]">{t("apps.chats.tokenStatus.tokenRefreshed")}</span>
    </div>
  );
}

// Helper function to get relative time
function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return i18n.t("apps.chats.tokenStatus.justNow");
  if (diffMins < 60) return i18n.t("apps.chats.tokenStatus.minutesAgo", { minutes: diffMins });

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return i18n.t("apps.chats.tokenStatus.hoursAgo", { hours: diffHours });

  const diffDays = Math.floor(diffHours / 24);
  return i18n.t("apps.chats.tokenStatus.daysAgo", { days: diffDays });
}
