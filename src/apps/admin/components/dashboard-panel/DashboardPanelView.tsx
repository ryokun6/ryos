import { useMemo, type ReactNode } from "react";
import { ArrowsClockwise, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { AdminPanelHeader } from "../AdminPanelHeader";
import { DashboardServerCard } from "../DashboardServerCard";
import { BreakdownList } from "./BreakdownList";
import { MiniBarChart } from "./MiniBarChart";
import { StatCard } from "./StatCard";
import type { DashboardPanelViewModel } from "./useDashboardPanel";
import type { DailyMetrics, ProductBreakdownSection } from "./types";
import { formatCountryDisplay, formatDateLabel } from "./utils";
import {
  adminCardClass,
  adminCardHeaderClass,
  adminListDividerClass,
  adminSectionLabelClass,
  adminToolbarSegmentClass,
  adminTrackBgClass,
} from "../../utils/adminStyles";

export function DashboardPanelView(props: DashboardPanelViewModel) {
  const {
    t,
    data,
    isLoading,
    error,
    rangeDays,
    setRangeDays,
    rangeDaysOptions,
    serverReloadKey,
    isToday,
    rangeLabel,
    getRangeLabel,
    fetchData,
    handleRefresh,
    countryLocale,
    analytics,
    formatNumber,
  } = props;

  const renderCountryName = useMemo(
    () =>
      (raw: string): ReactNode => {
        const { flag, name } = formatCountryDisplay(raw, countryLocale);
        return (
          <>
            {flag ? (
              <span aria-hidden="true" className="mr-1.5">
                {flag}
              </span>
            ) : null}
            {name}
          </>
        );
      },
    [countryLocale]
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
        <Warning className="size-8 text-neutral-400" weight="bold" />
        <span className="text-[12px] text-neutral-600">{error}</span>
        <Button variant="outline" size="sm" onClick={fetchData}>
          {t("apps.admin.dashboard.retry")}
        </Button>
      </div>
    );
  }

  if (!data || !analytics) return null;

  const {
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
    visitorTrend,
    callsTrend,
    aiTrend,
    errorsTrend,
  } = analytics;

  const productSections: ProductBreakdownSection[] | null = data.product
    ? [
        {
          title: t("apps.admin.dashboard.sections.topProductEvents"),
          items: data.product.topEvents,
          barClassName: "bg-neutral-400",
          nameClassName: "font-mono",
          emptyMessage: t("apps.admin.dashboard.empty.noData"),
        },
        {
          title: t("apps.admin.dashboard.sections.topApps"),
          items: data.product.topApps,
          barClassName: "bg-purple-400",
          nameClassName: "font-mono",
          emptyMessage: t("apps.admin.dashboard.empty.noData"),
        },
        {
          title: t("apps.admin.dashboard.sections.topSongs"),
          items: data.product.topSongs ?? [],
          barClassName: "bg-pink-400",
          emptyMessage: t("apps.admin.dashboard.empty.noSongs"),
        },
        {
          title: t("apps.admin.dashboard.sections.topSites"),
          items: data.product.topSites ?? [],
          barClassName: "bg-teal-400",
          nameClassName: "font-mono",
          emptyMessage: t("apps.admin.dashboard.empty.noSites"),
        },
        {
          title: t("apps.admin.dashboard.sections.topCountries"),
          items: data.product.topCountries ?? [],
          barClassName: "bg-orange-400",
          emptyMessage: t("apps.admin.dashboard.empty.noCountries"),
          renderName: renderCountryName,
        },
        {
          title: t("apps.admin.dashboard.sections.eventCategories"),
          items: data.product.categories,
          barClassName: "bg-yellow-500",
          nameClassName: "font-mono",
          emptyMessage: t("apps.admin.dashboard.empty.noData"),
        },
        {
          title: t("apps.admin.dashboard.sections.topPages"),
          items: data.product.topPaths,
          barClassName: "bg-green-400",
          nameClassName: "font-mono",
          emptyMessage: t("apps.admin.dashboard.empty.noData"),
        },
      ]
    : null;

  return (
    <div className="flex flex-col h-full font-geneva-12">
      <AdminPanelHeader
        title={t("apps.admin.dashboard.title")}
        actions={
          <>
            {rangeDaysOptions.map((d) => (
              <Button
                key={d}
                variant="ghost"
                size="sm"
                onClick={() => setRangeDays(d)}
                data-state={rangeDays === d ? "on" : "off"}
                className={adminToolbarSegmentClass}
              >
                {getRangeLabel(d)}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="size-7 shrink-0 p-0"
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-3">
          <StatCard
            label={t("apps.admin.dashboard.kpi.visitors")}
            value={formatNumber(kpiVisitors)}
            trend={visitorTrend}
          />
          <StatCard
            label={t("apps.admin.dashboard.kpi.apiCalls")}
            value={formatNumber(kpiCalls)}
            trend={callsTrend}
          />
          <StatCard
            label={t("apps.admin.dashboard.kpi.aiRequests")}
            value={formatNumber(kpiAI)}
            trend={aiTrend}
          />
          <StatCard
            label={t("apps.admin.dashboard.kpi.errorRate")}
            value={errorRate}
            trend={errorsTrend}
          />
        </div>

        <div className="flex items-center gap-4 px-4 pb-2 text-[10px] text-neutral-400">
          <span>
            {rangeLabel}
            {!isToday ? ` ${t("apps.admin.dashboard.totals.totals")}` : ""}:{" "}
            {formatNumber(isToday ? (latestDay?.calls ?? 0) : totals.calls)}{" "}
            {t("apps.admin.dashboard.totals.calls")}
          </span>
          <span>
            {formatNumber(
              isToday ? (latestDay?.uniqueVisitors ?? 0) : totals.uniqueVisitors
            )}{" "}
            {t("apps.admin.dashboard.totals.visitors")}
          </span>
          <span>
            {formatNumber(isToday ? (latestDay?.ai ?? 0) : totals.ai)}{" "}
            {t("apps.admin.dashboard.totals.ai")}
          </span>
          <span>
            {isToday ? (latestDay?.avgLatencyMs ?? 0) : totals.avgLatencyMs}
            {t("apps.admin.dashboard.totals.msAvg")}
          </span>
        </div>

        {showTimeSeriesCharts ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
            <TimeSeriesChartCard
              title={t("apps.admin.dashboard.charts.apiCalls")}
              days={days}
              valueKey="calls"
              color="bg-neutral-400"
            />
            <TimeSeriesChartCard
              title={t("apps.admin.dashboard.charts.uniqueVisitors")}
              days={days}
              valueKey="uniqueVisitors"
              color="bg-green-400"
            />
            <TimeSeriesChartCard
              title={t("apps.admin.dashboard.charts.aiRequests")}
              days={days}
              valueKey="ai"
              color="bg-yellow-400"
            />
            <TimeSeriesChartCard
              title={t("apps.admin.dashboard.charts.errors")}
              days={days}
              valueKey="errors"
              color="bg-red-400"
            />
          </div>
        ) : null}

        <div className="px-3 pb-3">
          <div className={adminCardClass}>
            <div className={adminCardHeaderClass}>
              <span className={adminSectionLabelClass}>
                {t("apps.admin.dashboard.sections.topEndpoints")} ({rangeLabel})
              </span>
            </div>
            {topEndpoints.length === 0 ? (
              <EmptyState message={t("apps.admin.dashboard.empty.noData")} />
            ) : (
              <div className={adminListDividerClass}>
                {topEndpoints.slice(0, 10).map((ep) => (
                  <div
                    key={ep.endpoint}
                    className="flex items-center gap-2 px-3 py-1.5"
                  >
                    <span className="text-[11px] font-mono text-neutral-600 flex-1 truncate">
                      {ep.endpoint}
                    </span>
                    <div className="w-24 flex items-center gap-1.5">
                      <div className={cn("flex-1 h-1.5 rounded-full overflow-hidden", adminTrackBgClass)}>
                        <div
                          className="h-full bg-indigo-400 rounded-full"
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
          <div className={adminCardClass}>
            <div className={adminCardHeaderClass}>
              <span className={adminSectionLabelClass}>
                {t("apps.admin.dashboard.sections.statusCodes")}
              </span>
            </div>
            {statusCodes.length === 0 ? (
              <EmptyState message={t("apps.admin.dashboard.empty.noData")} />
            ) : (
              <div className={adminListDividerClass}>
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

          <div className={adminCardClass}>
            <div className={adminCardHeaderClass}>
              <span className={adminSectionLabelClass}>
                {t("apps.admin.dashboard.sections.aiUsageByUser")}
              </span>
            </div>
            {aiByUser.length === 0 ? (
              <EmptyState message={t("apps.admin.dashboard.empty.noAiUsage")} />
            ) : (
              <div className={adminListDividerClass}>
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

        {showTimeSeriesCharts ? (
          <div className="px-3 pb-3">
            <TimeSeriesChartCard
              title={t("apps.admin.dashboard.charts.avgResponseTime")}
              days={days}
              valueKey="avgLatencyMs"
              color="bg-neutral-300"
              height={48}
            />
          </div>
        ) : null}

        {data.product ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 px-3 pb-3">
              <StatCard
                label={t("apps.admin.dashboard.kpi.productEvents")}
                value={formatNumber(data.product.summary.totals.events)}
              />
              <StatCard
                label={t("apps.admin.dashboard.kpi.pageViews")}
                value={formatNumber(data.product.summary.totals.pageViews)}
              />
              <StatCard
                label={t("apps.admin.dashboard.kpi.sessions")}
                value={formatNumber(data.product.summary.totals.sessions)}
              />
              <StatCard
                label={t("apps.admin.dashboard.kpi.appEvents")}
                value={formatNumber(data.product.summary.totals.appLifecycle)}
              />
            </div>

            {productSections ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 px-3 pb-3">
                {productSections.map((section) => (
                  <div
                    key={section.title}
                    className={adminCardClass}
                  >
                    <div className={adminCardHeaderClass}>
                      <span className={adminSectionLabelClass}>
                        {section.title}
                      </span>
                    </div>
                    <BreakdownList
                      items={section.items}
                      nameClassName={section.nameClassName}
                      barClassName={section.barClassName}
                      emptyMessage={section.emptyMessage}
                      renderName={section.renderName}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}

        <div className="px-3 pb-3">
          <DashboardServerCard reloadKey={serverReloadKey} />
        </div>
      </div>
    </div>
  );
}

function TimeSeriesChartCard({
  title,
  days,
  valueKey,
  color,
  height = 56,
}: {
  title: string;
  days: DailyMetrics[];
  valueKey: keyof DailyMetrics;
  color: string;
  height?: number;
}) {
  return (
    <div className={cn("rounded p-3", adminCardClass)}>
      <div className={cn(adminSectionLabelClass, "mb-2")}>
        {title}
      </div>
      <MiniBarChart
        data={days}
        valueKey={valueKey}
        color={color}
        height={height}
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
  );
}
