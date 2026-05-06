import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { ArrowsClockwise, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { getAdminAnalytics } from "@/api/admin";
import { AdminPanelHeader } from "./AdminPanelHeader";
import {
  BreakdownList,
  MiniBarChart,
  SectionCard,
  StatCard,
} from "./dashboard/chartHelpers";
import { formatDateLabel, formatNumber } from "./dashboard/formatters";

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

interface ProductDailyMetrics {
  date: string;
  events: number;
  pageViews: number;
  sessions: number;
  appLifecycle: number;
  auth: number;
  errors: number;
  uniqueVisitors: number;
}

interface ProductAnalyticsSummary {
  days: ProductDailyMetrics[];
  totals: {
    events: number;
    pageViews: number;
    sessions: number;
    appLifecycle: number;
    auth: number;
    errors: number;
    uniqueVisitors: number;
  };
}

interface ProductBreakdown {
  name: string;
  count: number;
}

interface ProductAnalyticsDetail {
  summary: ProductAnalyticsSummary;
  topEvents: ProductBreakdown[];
  topApps: ProductBreakdown[];
  categories: ProductBreakdown[];
  sources: ProductBreakdown[];
  topPaths: ProductBreakdown[];
}

interface AnalyticsDetail {
  summary: AnalyticsSummary;
  topEndpoints: EndpointBreakdown[];
  statusCodes: StatusBreakdown[];
  aiByUser: AIUserBreakdown[];
  aiRateLimits: AIRateLimitInfo[];
  product?: ProductAnalyticsDetail;
}

interface AnalyticsPanelProps {
  onRefresh?: () => void;
}

const RANGE_DAYS = [1, 7, 14, 30] as const;

type EventGroup = {
  prefix: string;
  label: string;
};

/**
 * Group event names by their `<app>:` prefix so the long flat list of
 * tracked events becomes scannable. The label uses the prefix as a fallback
 * when no translation is available.
 */
function groupEventsByPrefix(
  events: ProductBreakdown[]
): { group: EventGroup; total: number; items: ProductBreakdown[] }[] {
  const groups = new Map<string, ProductBreakdown[]>();
  for (const event of events) {
    const idx = event.name.indexOf(":");
    const prefix = idx > 0 ? event.name.slice(0, idx) : "other";
    const existing = groups.get(prefix);
    if (existing) {
      existing.push(event);
    } else {
      groups.set(prefix, [event]);
    }
  }
  return [...groups.entries()]
    .map(([prefix, items]) => ({
      group: { prefix, label: prefix },
      total: items.reduce((sum, item) => sum + item.count, 0),
      items: items.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.total - a.total);
}

export function AnalyticsPanel({ onRefresh }: AnalyticsPanelProps) {
  const { t } = useTranslation();
  const { username, isAuthenticated } = useAuth();
  const [data, setData] = useState<AnalyticsDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState(7);
  const [eventFilter, setEventFilter] = useState("");

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

  const product = data?.product;
  const showTimeSeriesCharts = (product?.summary.days.length ?? 0) >= 2;

  const filteredEvents = useMemo(() => {
    if (!product) return [];
    const term = eventFilter.trim().toLowerCase();
    if (!term) return product.topEvents;
    return product.topEvents.filter((event) =>
      event.name.toLowerCase().includes(term)
    );
  }, [product, eventFilter]);

  const eventGroups = useMemo(
    () => groupEventsByPrefix(filteredEvents),
    [filteredEvents]
  );

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

  const days = product?.summary.days ?? [];
  const totals = product?.summary.totals;

  return (
    <div className="flex flex-col h-full font-geneva-12">
      <AdminPanelHeader
        title={t("apps.admin.analytics.title", "Analytics")}
        actions={
          <>
            {RANGE_DAYS.map((d) => (
              <Button
                key={d}
                variant="ghost"
                size="sm"
                onClick={() => setRangeDays(d)}
                className={cn(
                  "h-7 px-2 text-[12px]",
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
              className="h-7 w-7 shrink-0 p-0"
            >
              {isLoading ? (
                <ActivityIndicator size={14} />
              ) : (
                <ArrowsClockwise size={14} weight="bold" />
              )}
            </Button>
          </>
        }
      />

      <div className="flex-1 overflow-y-auto">
        {/* Page intro */}
        <div className="px-3 pt-3 pb-1">
          <p className="text-[11px] text-neutral-500">
            {t(
              "apps.admin.analytics.intro",
              "First-party product analytics: page views, sessions, app lifecycle and every tracked event from across ryOS."
            )}{" "}
            <span className="text-neutral-400">
              {t("apps.admin.analytics.range", "Range")}: {rangeLabel}
            </span>
          </p>
        </div>

        {/* Product KPIs */}
        {totals ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3">
            <StatCard
              label={t("apps.admin.dashboard.kpi.productEvents")}
              value={formatNumber(totals.events)}
              color="blue"
            />
            <StatCard
              label={t("apps.admin.dashboard.kpi.uniqueVisitors", "Visitors")}
              value={formatNumber(totals.uniqueVisitors)}
              color="green"
            />
            <StatCard
              label={t("apps.admin.dashboard.kpi.pageViews")}
              value={formatNumber(totals.pageViews)}
              color="neutral"
            />
            <StatCard
              label={t("apps.admin.dashboard.kpi.sessions")}
              value={formatNumber(totals.sessions)}
              color="yellow"
            />
            <StatCard
              label={t("apps.admin.dashboard.kpi.appEvents")}
              value={formatNumber(totals.appLifecycle)}
              color="blue"
            />
            <StatCard
              label={t("apps.admin.analytics.kpi.auth", "Auth Events")}
              value={formatNumber(totals.auth)}
              color="green"
            />
            <StatCard
              label={t("apps.admin.analytics.kpi.errors", "Errors")}
              value={formatNumber(totals.errors)}
              color="red"
            />
            <StatCard
              label={t("apps.admin.analytics.kpi.apiCalls", "API Calls")}
              value={formatNumber(data.summary.totals.calls)}
              color="neutral"
            />
          </div>
        ) : (
          <div className="px-3 py-8">
            <EmptyState
              message={t(
                "apps.admin.analytics.noProductData",
                "No product analytics data yet. Events appear here once the app starts emitting them."
              )}
            />
          </div>
        )}

        {/* Time-series charts */}
        {showTimeSeriesCharts && product ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
            <SectionCard title={t("apps.admin.analytics.charts.events", "Events")}>
              <div className="p-3">
                <MiniBarChart data={days} valueKey="events" color="bg-blue-400" height={56} />
                <DateAxis days={days} />
              </div>
            </SectionCard>
            <SectionCard
              title={t("apps.admin.dashboard.charts.uniqueVisitors")}
            >
              <div className="p-3">
                <MiniBarChart
                  data={days}
                  valueKey="uniqueVisitors"
                  color="bg-green-400"
                  height={56}
                />
                <DateAxis days={days} />
              </div>
            </SectionCard>
            <SectionCard title={t("apps.admin.analytics.charts.pageViews", "Page Views")}>
              <div className="p-3">
                <MiniBarChart data={days} valueKey="pageViews" color="bg-neutral-400" height={56} />
                <DateAxis days={days} />
              </div>
            </SectionCard>
            <SectionCard title={t("apps.admin.analytics.charts.sessions", "Sessions")}>
              <div className="p-3">
                <MiniBarChart data={days} valueKey="sessions" color="bg-yellow-400" height={56} />
                <DateAxis days={days} />
              </div>
            </SectionCard>
            <SectionCard title={t("apps.admin.analytics.charts.appLifecycle", "App Lifecycle")}>
              <div className="p-3">
                <MiniBarChart data={days} valueKey="appLifecycle" color="bg-blue-400" height={56} />
                <DateAxis days={days} />
              </div>
            </SectionCard>
            <SectionCard title={t("apps.admin.analytics.charts.errors", "Errors")}>
              <div className="p-3">
                <MiniBarChart data={days} valueKey="errors" color="bg-red-400" height={56} />
                <DateAxis days={days} />
              </div>
            </SectionCard>
          </div>
        ) : null}

        {/* Event explorer */}
        {product ? (
          <div className="px-3 pb-3">
            <SectionCard
              title={t("apps.admin.analytics.sections.eventExplorer", "Event Explorer")}
              count={filteredEvents.length}
              actions={
                <input
                  type="search"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  placeholder={t(
                    "apps.admin.analytics.filterEvents",
                    "Filter events..."
                  )}
                  className="text-[11px] px-2 py-0.5 border border-gray-200 rounded bg-white focus:outline-none focus:border-blue-300 w-40"
                  aria-label={t(
                    "apps.admin.analytics.filterEvents",
                    "Filter events..."
                  )}
                />
              }
            >
              {eventGroups.length === 0 ? (
                <EmptyState
                  message={t("apps.admin.dashboard.empty.noData")}
                />
              ) : (
                <div className="divide-y divide-gray-100">
                  {eventGroups.map(({ group, total, items }) => (
                    <details
                      key={group.prefix}
                      className="group"
                      open={eventFilter.length > 0 || eventGroups.length <= 4}
                    >
                      <summary className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 list-none">
                        <span className="text-neutral-300 text-[10px] w-3">
                          ▸
                        </span>
                        <span className="text-[11px] font-medium text-neutral-700 flex-1 truncate">
                          {group.label}
                        </span>
                        <span className="text-[10px] text-neutral-400 tabular-nums">
                          {items.length} ·{" "}
                          {formatNumber(total)}
                        </span>
                      </summary>
                      <div className="bg-gray-50/40">
                        <BreakdownList
                          items={items}
                          nameClassName="font-mono pl-3"
                          limit={50}
                          barColor="bg-blue-400"
                        />
                      </div>
                    </details>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        ) : null}

        {/* Breakdowns grid */}
        {product ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
            <SectionCard
              title={t("apps.admin.dashboard.sections.topApps")}
              count={product.topApps.length}
            >
              <BreakdownList
                items={product.topApps}
                nameClassName="font-mono"
                limit={20}
                barColor="bg-blue-400"
              />
            </SectionCard>
            <SectionCard
              title={t("apps.admin.dashboard.sections.eventCategories")}
              count={product.categories.length}
            >
              <BreakdownList
                items={product.categories}
                nameClassName="font-mono"
                barColor="bg-yellow-400"
              />
            </SectionCard>
            <SectionCard
              title={t("apps.admin.analytics.sections.sources", "Sources")}
              count={product.sources.length}
            >
              <BreakdownList
                items={product.sources}
                nameClassName="font-mono"
                barColor="bg-green-400"
              />
            </SectionCard>
            <SectionCard
              title={t("apps.admin.dashboard.sections.topPages")}
              count={product.topPaths.length}
            >
              <BreakdownList
                items={product.topPaths}
                nameClassName="font-mono"
                limit={20}
                barColor="bg-neutral-400"
              />
            </SectionCard>
          </div>
        ) : null}

        {/* API breakdowns: extra context next to product analytics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
          <SectionCard
            title={t("apps.admin.dashboard.sections.topEndpoints")}
            count={data.topEndpoints.length}
          >
            <BreakdownList
              items={data.topEndpoints.map((ep) => ({
                name: ep.endpoint,
                count: ep.count,
              }))}
              nameClassName="font-mono"
              limit={20}
              barColor="bg-neutral-400"
            />
          </SectionCard>
          <SectionCard
            title={t("apps.admin.dashboard.sections.statusCodes")}
          >
            <BreakdownList
              items={data.statusCodes.map((sc) => ({
                name: sc.status,
                count: sc.count,
              }))}
              nameClassName="font-mono"
              limit={20}
              barColor="bg-yellow-400"
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function DateAxis({ days }: { days: { date: string }[] }) {
  if (days.length === 0) return null;
  return (
    <div className="flex justify-between mt-1.5 text-[9px] text-neutral-400">
      <span>{formatDateLabel(days[0].date)}</span>
      <span>{formatDateLabel(days[days.length - 1].date)}</span>
    </div>
  );
}
