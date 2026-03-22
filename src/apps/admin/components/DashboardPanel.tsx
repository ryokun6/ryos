import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ArrowsClockwise, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { getAdminAnalytics } from "@/api/admin";

interface DailyMetrics {
  date: string;
  calls: number;
  ai: number;
  errors: number;
  uniqueVisitors: number;
  avgLatencyMs: number;
}

interface AnalyticsSummary {
  days: DailyMetrics[];
  totals: {
    calls: number;
    ai: number;
    errors: number;
    uniqueVisitors: number;
    avgLatencyMs: number;
  };
}

interface EndpointBreakdown {
  endpoint: string;
  count: number;
}

interface StatusBreakdown {
  status: string;
  count: number;
}

interface AIUserBreakdown {
  username: string;
  count: number;
}

interface AIRateLimitInfo {
  identifier: string;
  currentCount: number;
  limit: number;
  windowLabel: string;
}

interface AnalyticsDetail {
  summary: AnalyticsSummary;
  topEndpoints: EndpointBreakdown[];
  statusCodes: StatusBreakdown[];
  aiByUser: AIUserBreakdown[];
  aiRateLimits: AIRateLimitInfo[];
}

interface DashboardPanelProps {
  onRefresh?: () => void;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function MiniBarChart({
  data,
  valueKey,
  color = "bg-neutral-400",
  height = 64,
}: {
  data: DailyMetrics[];
  valueKey: keyof DailyMetrics;
  color?: string;
  height?: number;
}) {
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);

  return (
    <div className="flex items-end gap-[3px]" style={{ height }}>
      {values.map((v, i) => {
        const barH = Math.max(1, (v / max) * height);
        return (
          <div
            key={data[i].date}
            className="flex flex-col items-center flex-1 min-w-0 group relative"
            style={{ height }}
          >
            <div className="flex-1" />
            <div
              className={cn("w-full rounded-t-sm transition-all", color)}
              style={{ height: barH }}
            />
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-black/80 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap z-10 pointer-events-none">
              {formatDateLabel(data[i].date)}: {formatNumber(v)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  trend,
}: {
  label: string;
  value: string;
  trend?: { value: number; label: string };
}) {
  return (
    <div className="flex flex-col gap-1 p-3 bg-white rounded border border-gray-200">
      <span className="text-[10px] uppercase tracking-wide text-neutral-400">
        {label}
      </span>
      <div className="text-[18px] font-semibold leading-tight text-neutral-800">
        {value}
      </div>
      {trend && (
        <div
          className={cn(
            "text-[10px]",
            trend.value > 0
              ? "text-green-600"
              : trend.value < 0
                ? "text-red-500"
                : "text-neutral-400"
          )}
        >
          {trend.value > 0 ? "+" : ""}
          {trend.value}% {trend.label}
        </div>
      )}
    </div>
  );
}

const RANGE_DAYS = [1, 7, 14, 30] as const;

export function DashboardPanel({ onRefresh }: DashboardPanelProps) {
  const { t } = useTranslation();
  const { username, isAuthenticated } = useAuth();
  const [data, setData] = useState<AnalyticsDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(1);

  const isToday = rangeDays === 1;
  const rangeLabel = isToday ? t("apps.admin.dashboard.range.today") : `${rangeDays}d`;
  const getRangeLabel = (d: number) =>
    d === 1 ? t("apps.admin.dashboard.range.today") : `${d}d`;

  const fetchData = useCallback(async () => {
    if (!username || !isAuthenticated) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getAdminAnalytics<AnalyticsDetail>(
        rangeDays,
        true
      );
      setData(result);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
      setError(err instanceof Error ? err.message : t("apps.admin.dashboard.failedToLoad"));
    } finally {
      setIsLoading(false);
    }
  }, [username, isAuthenticated, rangeDays, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <ActivityIndicator size={24} />
        <span className="text-[11px] text-neutral-500">
          {t("apps.admin.dashboard.loading")}
        </span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Warning className="h-8 w-8 text-neutral-400" weight="bold" />
        <span className="text-[12px] text-neutral-600">{error}</span>
        <Button variant="outline" size="sm" onClick={fetchData}>
          {t("apps.admin.dashboard.retry")}
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, topEndpoints, statusCodes, aiByUser, aiRateLimits } = data;
  const { totals, days } = summary;

  const latestDay = days.length > 0 ? days[days.length - 1] : null;
  const prevDay = days.length > 1 ? days[days.length - 2] : null;

  function calcTrend(
    currentVal: number | undefined,
    previousVal: number | undefined,
    label: string = t("apps.admin.dashboard.trend.vsPrevDay")
  ) {
    const cv = currentVal ?? 0;
    const pv = previousVal ?? 0;
    if (pv === 0)
      return cv > 0
        ? { value: 100, label }
        : { value: 0, label };
    return {
      value: Math.round(((cv - pv) / pv) * 100),
      label,
    };
  }

  const kpiVisitors = isToday ? (latestDay?.uniqueVisitors ?? 0) : totals.uniqueVisitors;
  const kpiCalls = isToday ? (latestDay?.calls ?? 0) : totals.calls;
  const kpiAI = isToday ? (latestDay?.ai ?? 0) : totals.ai;
  const kpiErrorDenom = isToday ? (latestDay?.calls ?? 0) : totals.calls;
  const kpiErrorNum = isToday ? (latestDay?.errors ?? 0) : totals.errors;
  const errorRate =
    kpiErrorDenom > 0
      ? `${((kpiErrorNum / kpiErrorDenom) * 100).toFixed(1)}%`
      : "0%";

  const showTrend = !isToday && prevDay != null;

  const topEndpointMax = topEndpoints.length > 0 ? topEndpoints[0].count : 1;

  return (
    <div className="flex flex-col h-full font-geneva-12">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <span className="text-[12px] font-medium">{t("apps.admin.dashboard.title")}</span>
        <div className="flex items-center gap-1">
          {RANGE_DAYS.map((d) => (
            <Button
              key={d}
              variant="ghost"
              size="sm"
              onClick={() => setRangeDays(d)}
              className={cn(
                "h-6 px-2 text-[10px]",
                rangeDays === d && "bg-neutral-200"
              )}
            >
              {getRangeLabel(d)}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              fetchData();
              onRefresh?.();
            }}
            className="h-7 w-7 p-0 ml-1"
          >
            {isLoading ? (
              <ActivityIndicator size={14} />
            ) : (
              <ArrowsClockwise className="h-3.5 w-3.5" weight="bold" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3">
          <StatCard
            label={t("apps.admin.dashboard.kpi.visitors")}
            value={formatNumber(kpiVisitors)}
            trend={showTrend ? calcTrend(latestDay?.uniqueVisitors, prevDay?.uniqueVisitors) : undefined}
          />
          <StatCard
            label={t("apps.admin.dashboard.kpi.apiCalls")}
            value={formatNumber(kpiCalls)}
            trend={showTrend ? calcTrend(latestDay?.calls, prevDay?.calls) : undefined}
          />
          <StatCard
            label={t("apps.admin.dashboard.kpi.aiRequests")}
            value={formatNumber(kpiAI)}
            trend={showTrend ? calcTrend(latestDay?.ai, prevDay?.ai) : undefined}
          />
          <StatCard
            label={t("apps.admin.dashboard.kpi.errorRate")}
            value={errorRate}
            trend={showTrend ? calcTrend(latestDay?.errors, prevDay?.errors) : undefined}
          />
        </div>

        {/* Totals strip */}
        <div className="flex items-center gap-4 px-4 pb-2 text-[10px] text-neutral-400">
          <span>
            {rangeLabel}{!isToday ? ` ${t("apps.admin.dashboard.totals.totals")}` : ""}: {formatNumber(isToday ? (latestDay?.calls ?? 0) : totals.calls)} {t("apps.admin.dashboard.totals.calls")}
          </span>
          <span>{formatNumber(isToday ? (latestDay?.uniqueVisitors ?? 0) : totals.uniqueVisitors)} {t("apps.admin.dashboard.totals.visitors")}</span>
          <span>{formatNumber(isToday ? (latestDay?.ai ?? 0) : totals.ai)} {t("apps.admin.dashboard.totals.ai")}</span>
          <span>{isToday ? (latestDay?.avgLatencyMs ?? 0) : totals.avgLatencyMs}{t("apps.admin.dashboard.totals.msAvg")}</span>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
          <div className="border border-gray-200 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-2">
              {t("apps.admin.dashboard.charts.apiCalls")}
            </div>
            <MiniBarChart data={days} valueKey="calls" color="bg-neutral-400" height={56} />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>
                {days.length > 0 ? formatDateLabel(days[0].date) : ""}
              </span>
              <span>
                {days.length > 0
                  ? formatDateLabel(days[days.length - 1].date)
                  : ""}
              </span>
            </div>
          </div>

          <div className="border border-gray-200 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-2">
              {t("apps.admin.dashboard.charts.uniqueVisitors")}
            </div>
            <MiniBarChart data={days} valueKey="uniqueVisitors" color="bg-green-400" height={56} />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>
                {days.length > 0 ? formatDateLabel(days[0].date) : ""}
              </span>
              <span>
                {days.length > 0
                  ? formatDateLabel(days[days.length - 1].date)
                  : ""}
              </span>
            </div>
          </div>

          <div className="border border-gray-200 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-2">
              {t("apps.admin.dashboard.charts.aiRequests")}
            </div>
            <MiniBarChart data={days} valueKey="ai" color="bg-yellow-400" height={56} />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>
                {days.length > 0 ? formatDateLabel(days[0].date) : ""}
              </span>
              <span>
                {days.length > 0
                  ? formatDateLabel(days[days.length - 1].date)
                  : ""}
              </span>
            </div>
          </div>

          <div className="border border-gray-200 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-2">
              {t("apps.admin.dashboard.charts.errors")}
            </div>
            <MiniBarChart data={days} valueKey="errors" color="bg-red-400" height={56} />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>
                {days.length > 0 ? formatDateLabel(days[0].date) : ""}
              </span>
              <span>
                {days.length > 0
                  ? formatDateLabel(days[days.length - 1].date)
                  : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Top Endpoints */}
        <div className="px-3 pb-3">
          <div className="border border-gray-200 rounded bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                {t("apps.admin.dashboard.sections.topEndpoints")} ({rangeLabel})
              </span>
            </div>
            {topEndpoints.length === 0 ? (
              <EmptyState message={t("apps.admin.dashboard.empty.noData")} />
            ) : (
              <div className="divide-y divide-gray-100">
                {topEndpoints.slice(0, 10).map((ep) => (
                  <div
                    key={ep.endpoint}
                    className="flex items-center gap-2 px-3 py-1.5"
                  >
                    <span className="text-[11px] font-mono text-neutral-600 flex-1 truncate">
                      {ep.endpoint}
                    </span>
                    <div className="w-24 flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-neutral-400 rounded-full"
                          style={{
                            width: `${(ep.count / topEndpointMax) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-neutral-500 w-8 text-right tabular-nums">
                        {formatNumber(ep.count)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status Codes & AI Usage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
          <div className="border border-gray-200 rounded bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                {t("apps.admin.dashboard.sections.statusCodes")}
              </span>
            </div>
            {statusCodes.length === 0 ? (
              <EmptyState message={t("apps.admin.dashboard.empty.noData")} />
            ) : (
              <div className="divide-y divide-gray-100">
                {statusCodes.map((sc) => (
                  <div
                    key={sc.status}
                    className="flex items-center justify-between px-3 py-1.5"
                  >
                    <span
                      className={cn(
                        "text-[11px] font-mono",
                        sc.status.startsWith("2") && "text-green-600",
                        sc.status.startsWith("3") && "text-neutral-600",
                        sc.status.startsWith("4") && "text-yellow-600",
                        sc.status.startsWith("5") && "text-red-600"
                      )}
                    >
                      {sc.status}
                    </span>
                    <span className="text-[10px] text-neutral-500 tabular-nums">
                      {formatNumber(sc.count)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-[10px] uppercase tracking-wide text-neutral-400">
                {t("apps.admin.dashboard.sections.aiUsageByUser")}
              </span>
            </div>
            {aiByUser.length === 0 ? (
              <EmptyState message={t("apps.admin.dashboard.empty.noAiUsage")} />
            ) : (
              <div className="divide-y divide-gray-100">
                {aiByUser.map((entry) => {
                  const rl = aiRateLimits.find(
                    (r) => r.identifier === entry.username
                  );
                  return (
                    <div
                      key={entry.username}
                      className="flex items-center justify-between px-3 py-1.5"
                    >
                      <span className="text-[11px] text-neutral-600">
                        {entry.username}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500 tabular-nums">
                          {formatNumber(entry.count)}
                        </span>
                        {rl && rl.limit > 0 && (
                          <span
                            className={cn(
                              "text-[9px] tabular-nums",
                              rl.currentCount >= rl.limit
                                ? "text-red-500"
                                : rl.currentCount >= rl.limit * 0.8
                                  ? "text-yellow-600"
                                  : "text-green-600"
                            )}
                          >
                            {rl.currentCount}/{rl.limit}
                          </span>
                        )}
                        {rl && rl.limit === -1 && (
                          <span className="text-[9px] text-neutral-400">
                            ∞
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Avg Latency */}
        <div className="px-3 pb-3">
          <div className="border border-gray-200 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-2">
              {t("apps.admin.dashboard.charts.avgResponseTime")}
            </div>
            <MiniBarChart data={days} valueKey="avgLatencyMs" color="bg-neutral-300" height={48} />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>
                {days.length > 0 ? formatDateLabel(days[0].date) : ""}
              </span>
              <span>
                {days.length > 0
                  ? formatDateLabel(days[days.length - 1].date)
                  : ""}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
