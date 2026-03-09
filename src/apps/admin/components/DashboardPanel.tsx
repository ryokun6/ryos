import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  ArrowsClockwise,
  ChartBar,
  Lightning,
  Warning,
  Robot,
  Globe,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
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
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function MiniBarChart({
  data,
  valueKey,
  color = "bg-neutral-500",
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
  icon,
  trend,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1 p-3 bg-white rounded border border-gray-200">
      <div className="flex items-center gap-2">
        <div className={cn("p-1.5 rounded", color)}>{icon}</div>
        <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
          {label}
        </span>
      </div>
      <div className="text-[20px] font-semibold leading-tight pl-0.5">
        {value}
      </div>
      {trend && (
        <div
          className={cn(
            "text-[10px] pl-0.5",
            trend.value > 0
              ? "text-green-600"
              : trend.value < 0
                ? "text-red-600"
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

export function DashboardPanel({ onRefresh }: DashboardPanelProps) {
  const { username, authToken } = useAuth();
  const [data, setData] = useState<AnalyticsDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(7);

  const fetchData = useCallback(async () => {
    if (!username || !authToken) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await getAdminAnalytics<AnalyticsDetail>(
        { username, token: authToken },
        rangeDays,
        true
      );
      setData(result);
    } catch (err) {
      console.error("Failed to fetch analytics:", err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }, [username, authToken, rangeDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (isLoading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <ActivityIndicator size={24} />
        <span className="text-[11px] text-neutral-500">
          Loading analytics...
        </span>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Warning className="h-8 w-8 text-neutral-400" weight="bold" />
        <span className="text-[12px] text-red-600">{error}</span>
        <Button variant="outline" size="sm" onClick={fetchData}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, topEndpoints, statusCodes, aiByUser, aiRateLimits } = data;
  const { totals, days } = summary;

  const todayData = days.length > 0 ? days[days.length - 1] : null;
  const yesterdayData = days.length > 1 ? days[days.length - 2] : null;

  function calcTrend(
    todayVal: number | undefined,
    yesterdayVal: number | undefined
  ) {
    const tv = todayVal ?? 0;
    const yv = yesterdayVal ?? 0;
    if (yv === 0) return tv > 0 ? { value: 100, label: "vs yesterday" } : { value: 0, label: "vs yesterday" };
    return {
      value: Math.round(((tv - yv) / yv) * 100),
      label: "vs yesterday",
    };
  }

  const errorRate =
    totals.calls > 0
      ? `${((totals.errors / totals.calls) * 100).toFixed(1)}%`
      : "0%";

  const topEndpointMax = topEndpoints.length > 0 ? topEndpoints[0].count : 1;

  return (
    <div className="flex flex-col h-full font-geneva-12">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ChartBar className="h-3.5 w-3.5 text-neutral-600" weight="bold" />
          <span className="text-[12px] font-medium">Dashboard</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Range selector */}
          {[7, 14, 30].map((d) => (
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
              {d}d
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
            label="Visitors"
            value={formatNumber(todayData?.uniqueVisitors ?? 0)}
            icon={<Globe className="h-3.5 w-3.5 text-blue-600" weight="bold" />}
            trend={calcTrend(
              todayData?.uniqueVisitors,
              yesterdayData?.uniqueVisitors
            )}
            color="bg-blue-50"
          />
          <StatCard
            label="API Calls"
            value={formatNumber(todayData?.calls ?? 0)}
            icon={<Lightning className="h-3.5 w-3.5 text-amber-600" weight="bold" />}
            trend={calcTrend(todayData?.calls, yesterdayData?.calls)}
            color="bg-amber-50"
          />
          <StatCard
            label="AI Requests"
            value={formatNumber(todayData?.ai ?? 0)}
            icon={<Robot className="h-3.5 w-3.5 text-purple-600" weight="bold" />}
            trend={calcTrend(todayData?.ai, yesterdayData?.ai)}
            color="bg-purple-50"
          />
          <StatCard
            label="Error Rate"
            value={errorRate}
            icon={<Warning className="h-3.5 w-3.5 text-red-600" weight="bold" />}
            trend={calcTrend(todayData?.errors, yesterdayData?.errors)}
            color="bg-red-50"
          />
        </div>

        {/* Totals strip */}
        <div className="flex items-center gap-4 px-4 pb-2 text-[10px] text-neutral-500">
          <span>
            {rangeDays}d totals: {formatNumber(totals.calls)} calls
          </span>
          <span>{formatNumber(totals.uniqueVisitors)} visitors</span>
          <span>{formatNumber(totals.ai)} AI</span>
          <span>{totals.avgLatencyMs}ms avg</span>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
          {/* API Calls chart */}
          <div className="border border-gray-200 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2 font-medium">
              API Calls
            </div>
            <MiniBarChart
              data={days}
              valueKey="calls"
              color="bg-amber-400"
              height={56}
            />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>{days.length > 0 ? formatDateLabel(days[0].date) : ""}</span>
              <span>
                {days.length > 0
                  ? formatDateLabel(days[days.length - 1].date)
                  : ""}
              </span>
            </div>
          </div>

          {/* Unique Visitors chart */}
          <div className="border border-gray-200 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2 font-medium">
              Unique Visitors
            </div>
            <MiniBarChart
              data={days}
              valueKey="uniqueVisitors"
              color="bg-blue-400"
              height={56}
            />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>{days.length > 0 ? formatDateLabel(days[0].date) : ""}</span>
              <span>
                {days.length > 0
                  ? formatDateLabel(days[days.length - 1].date)
                  : ""}
              </span>
            </div>
          </div>

          {/* AI Requests chart */}
          <div className="border border-gray-200 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2 font-medium">
              AI Requests
            </div>
            <MiniBarChart
              data={days}
              valueKey="ai"
              color="bg-purple-400"
              height={56}
            />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>{days.length > 0 ? formatDateLabel(days[0].date) : ""}</span>
              <span>
                {days.length > 0
                  ? formatDateLabel(days[days.length - 1].date)
                  : ""}
              </span>
            </div>
          </div>

          {/* Errors chart */}
          <div className="border border-gray-200 rounded p-3 bg-white">
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2 font-medium">
              Errors
            </div>
            <MiniBarChart
              data={days}
              valueKey="errors"
              color="bg-red-400"
              height={56}
            />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>{days.length > 0 ? formatDateLabel(days[0].date) : ""}</span>
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
              <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
                Top Endpoints ({rangeDays}d)
              </span>
            </div>
            {topEndpoints.length === 0 ? (
              <div className="text-[11px] text-neutral-400 text-center py-4">
                No data yet
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {topEndpoints.slice(0, 10).map((ep) => (
                  <div
                    key={ep.endpoint}
                    className="flex items-center gap-2 px-3 py-1.5"
                  >
                    <span className="text-[11px] font-mono text-neutral-700 flex-1 truncate">
                      {ep.endpoint}
                    </span>
                    <div className="w-24 flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
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

        {/* Status Codes & AI Usage side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
          {/* Status Codes */}
          <div className="border border-gray-200 rounded bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
                Status Codes
              </span>
            </div>
            {statusCodes.length === 0 ? (
              <div className="text-[11px] text-neutral-400 text-center py-4">
                No data yet
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {statusCodes.map((sc) => (
                  <div
                    key={sc.status}
                    className="flex items-center justify-between px-3 py-1.5"
                  >
                    <span
                      className={cn(
                        "text-[11px] font-mono font-medium px-1.5 py-0.5 rounded",
                        sc.status.startsWith("2") &&
                          "bg-green-50 text-green-700",
                        sc.status.startsWith("3") &&
                          "bg-blue-50 text-blue-700",
                        sc.status.startsWith("4") &&
                          "bg-amber-50 text-amber-700",
                        sc.status.startsWith("5") && "bg-red-50 text-red-700"
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

          {/* AI Usage by User */}
          <div className="border border-gray-200 rounded bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-[10px] uppercase tracking-wide text-neutral-500 font-medium">
                AI Usage by User
              </span>
            </div>
            {aiByUser.length === 0 ? (
              <div className="text-[11px] text-neutral-400 text-center py-4">
                No AI usage yet
              </div>
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
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full bg-purple-100 flex items-center justify-center text-[9px] font-medium text-purple-700">
                          {entry.username[0].toUpperCase()}
                        </div>
                        <span className="text-[11px]">{entry.username}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-neutral-500 tabular-nums">
                          {formatNumber(entry.count)}
                        </span>
                        {rl && rl.limit > 0 && (
                          <span
                            className={cn(
                              "text-[9px] px-1 py-0.5 rounded",
                              rl.currentCount >= rl.limit
                                ? "bg-red-50 text-red-600"
                                : rl.currentCount >= rl.limit * 0.8
                                  ? "bg-amber-50 text-amber-600"
                                  : "bg-green-50 text-green-600"
                            )}
                          >
                            {rl.currentCount}/{rl.limit} ({rl.windowLabel})
                          </span>
                        )}
                        {rl && rl.limit === -1 && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-blue-50 text-blue-600">
                            unlimited
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
            <div className="text-[10px] uppercase tracking-wide text-neutral-500 mb-2 font-medium">
              Avg Response Time (ms)
            </div>
            <MiniBarChart
              data={days}
              valueKey="avgLatencyMs"
              color="bg-emerald-400"
              height={48}
            />
            <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
              <span>{days.length > 0 ? formatDateLabel(days[0].date) : ""}</span>
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
