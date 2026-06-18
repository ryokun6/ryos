import type { AnalyticsDetail, AnalyticsSummary } from "./types";

export function withDisplayVisitorMetrics(
  data: AnalyticsDetail
): AnalyticsSummary {
  const productDaysByDate = new Map(
    (data.product?.summary.days ?? []).map((day) => [day.date, day])
  );

  const days = data.summary.days.map((day) => {
    const productVisitors =
      productDaysByDate.get(day.date)?.uniqueVisitors ?? day.uniqueVisitors;
    return {
      ...day,
      uniqueVisitors: Math.max(day.uniqueVisitors, productVisitors),
    };
  });

  return {
    days,
    totals: {
      ...data.summary.totals,
      uniqueVisitors: Math.max(
        data.summary.totals.uniqueVisitors,
        data.product?.summary.totals.uniqueVisitors ?? 0
      ),
    },
  };
}
