import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useAdminDashboardStore } from "@/stores/useAdminDashboardStore";
import { getAdminAnalytics } from "@/api/admin";
import type {
  AnalyticsDetail,
  DashboardPanelProps,
  TrendInfo,
} from "./types";
import { withDisplayVisitorMetrics } from "./deriveDashboardAnalytics";
import { RANGE_DAYS } from "./types";
import { formatNumber } from "./utils";

export function useDashboardPanel({ onRefresh }: DashboardPanelProps) {
  const { t, i18n } = useTranslation();
  const countryLocale = i18n.resolvedLanguage || i18n.language || "en";
  const { username, isAuthenticated } = useAuth();
  const [data, setData] = useState<AnalyticsDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rangeDays = useAdminDashboardStore((s) => s.rangeDays);
  const setRangeDays = useAdminDashboardStore((s) => s.setRangeDays);
  const [serverReloadKey, setServerReloadKey] = useState(0);

  const isToday = rangeDays === 1;
  const rangeLabel = isToday
    ? t("apps.admin.dashboard.range.today")
    : `${rangeDays}d`;
  const getRangeLabel = (d: number) =>
    d === 1 ? t("apps.admin.dashboard.range.today") : `${d}d`;

  const fetchData = useCallback(async () => {
    if (!username || !isAuthenticated) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getAdminAnalytics<AnalyticsDetail>(rangeDays, true);
      setData(result);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
      setError(
        err instanceof Error
          ? err.message
          : t("apps.admin.dashboard.failedToLoad")
      );
    } finally {
      setIsLoading(false);
    }
  }, [username, isAuthenticated, rangeDays, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData();
    setServerReloadKey((k) => k + 1);
    onRefresh?.();
  }, [fetchData, onRefresh]);

  const trendLabel = t("apps.admin.dashboard.trend.vsPrevDay");

  const calcTrend = useCallback(
    (
      currentVal: number | undefined,
      previousVal: number | undefined,
      label: string = trendLabel
    ): TrendInfo => {
      const cv = currentVal ?? 0;
      const pv = previousVal ?? 0;
      if (pv === 0) return cv > 0 ? { value: 100, label } : { value: 0, label };
      return {
        value: Math.round(((cv - pv) / pv) * 100),
        label,
      };
    },
    [trendLabel]
  );

  const analytics = useMemo(() => {
    if (!data) return null;

    const { topEndpoints, statusCodes, aiByUser, aiRateLimits } = data;
    const summary = withDisplayVisitorMetrics(data);
    const { totals, days } = summary;

    const latestDay = days.length > 0 ? days[days.length - 1] : null;
    const prevDay = days.length > 1 ? days[days.length - 2] : null;

    const kpiVisitors = isToday
      ? (latestDay?.uniqueVisitors ?? 0)
      : totals.uniqueVisitors;
    const kpiCalls = isToday ? (latestDay?.calls ?? 0) : totals.calls;
    const kpiAI = isToday ? (latestDay?.ai ?? 0) : totals.ai;
    const kpiErrorDenom = isToday ? (latestDay?.calls ?? 0) : totals.calls;
    const kpiErrorNum = isToday ? (latestDay?.errors ?? 0) : totals.errors;
    const errorRate =
      kpiErrorDenom > 0
        ? `${((kpiErrorNum / kpiErrorDenom) * 100).toFixed(1)}%`
        : "0%";

    const showTrend = !isToday && prevDay != null;
    const showTimeSeriesCharts = days.length >= 2;
    const topEndpointMax =
      topEndpoints.length > 0 ? topEndpoints[0].count : 1;

    return {
      topEndpoints,
      statusCodes,
      aiByUser,
      aiRateLimits,
      totals,
      days,
      latestDay,
      kpiVisitors,
      kpiCalls,
      kpiAI,
      errorRate,
      showTimeSeriesCharts,
      topEndpointMax,
      visitorTrend: showTrend
        ? calcTrend(latestDay?.uniqueVisitors, prevDay?.uniqueVisitors)
        : undefined,
      callsTrend: showTrend
        ? calcTrend(latestDay?.calls, prevDay?.calls)
        : undefined,
      aiTrend: showTrend
        ? calcTrend(latestDay?.ai, prevDay?.ai)
        : undefined,
      errorsTrend: showTrend
        ? calcTrend(latestDay?.errors, prevDay?.errors)
        : undefined,
    };
  }, [data, isToday, calcTrend]);

  return {
    t,
    data,
    isLoading,
    error,
    rangeDays,
    setRangeDays,
    rangeDaysOptions: RANGE_DAYS,
    serverReloadKey,
    isToday,
    rangeLabel,
    getRangeLabel,
    fetchData,
    handleRefresh,
    countryLocale,
    analytics,
    formatNumber,
  };
}

export type DashboardPanelViewModel = ReturnType<typeof useDashboardPanel>;
