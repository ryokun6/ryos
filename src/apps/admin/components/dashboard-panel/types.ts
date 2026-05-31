import type { ReactNode } from "react";

export const RANGE_DAYS = [1, 7, 14, 30] as const;

export interface DailyMetrics {
  date: string;
  calls: number;
  ai: number;
  errors: number;
  uniqueVisitors: number;
  avgLatencyMs: number;
}

export interface AnalyticsSummary {
  days: DailyMetrics[];
  totals: {
    calls: number;
    ai: number;
    errors: number;
    uniqueVisitors: number;
    avgLatencyMs: number;
  };
}

export interface EndpointBreakdown {
  endpoint: string;
  count: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface AIUserBreakdown {
  username: string;
  count: number;
}

export interface AIRateLimitInfo {
  identifier: string;
  currentCount: number;
  limit: number;
  windowLabel: string;
}

export interface ProductDailyMetrics {
  date: string;
  events: number;
  pageViews: number;
  sessions: number;
  appLifecycle: number;
  auth: number;
  errors: number;
  uniqueVisitors: number;
}

export interface ProductAnalyticsSummary {
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

export interface ProductBreakdown {
  name: string;
  count: number;
}

export interface ProductAnalyticsDetail {
  summary: ProductAnalyticsSummary;
  topEvents: ProductBreakdown[];
  topApps: ProductBreakdown[];
  categories: ProductBreakdown[];
  sources: ProductBreakdown[];
  topPaths: ProductBreakdown[];
  topSongs?: ProductBreakdown[];
  topSites?: ProductBreakdown[];
  topCountries?: ProductBreakdown[];
}

export interface AnalyticsDetail {
  summary: AnalyticsSummary;
  topEndpoints: EndpointBreakdown[];
  statusCodes: StatusBreakdown[];
  aiByUser: AIUserBreakdown[];
  aiRateLimits: AIRateLimitInfo[];
  product?: ProductAnalyticsDetail;
}

export interface DashboardPanelProps {
  onRefresh?: () => void;
}

export interface TrendInfo {
  value: number;
  label: string;
}

export interface ProductBreakdownSection {
  title: string;
  items: ProductBreakdown[];
  barClassName: string;
  nameClassName?: string;
  emptyMessage: string;
  renderName?: (name: string) => ReactNode;
}
