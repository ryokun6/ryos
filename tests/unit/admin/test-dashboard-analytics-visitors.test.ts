#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import { withDisplayVisitorMetrics } from "../../../src/apps/admin/components/dashboard-panel/deriveDashboardAnalytics";
import type { AnalyticsDetail } from "../../../src/apps/admin/components/dashboard-panel/types";

const baseDetail = {
  topEndpoints: [],
  statusCodes: [],
  aiByUser: [],
  aiRateLimits: [],
} satisfies Omit<AnalyticsDetail, "summary">;

describe("dashboard analytics visitor metrics", () => {
  test("uses product analytics visitors when API visitor keys are empty", () => {
    const summary = withDisplayVisitorMetrics({
      ...baseDetail,
      summary: {
        days: [
          {
            date: "2026-06-18",
            calls: 0,
            ai: 0,
            errors: 0,
            uniqueVisitors: 0,
            avgLatencyMs: 0,
          },
        ],
        totals: {
          calls: 0,
          ai: 0,
          errors: 0,
          uniqueVisitors: 0,
          avgLatencyMs: 0,
        },
      },
      product: {
        summary: {
          days: [
            {
              date: "2026-06-18",
              events: 3,
              pageViews: 1,
              sessions: 1,
              appLifecycle: 1,
              auth: 0,
              errors: 0,
              uniqueVisitors: 2,
            },
          ],
          totals: {
            events: 3,
            pageViews: 1,
            sessions: 1,
            appLifecycle: 1,
            auth: 0,
            errors: 0,
            uniqueVisitors: 2,
          },
        },
        topEvents: [],
        topApps: [],
        categories: [],
        sources: [],
        topPaths: [],
      },
    });

    expect(summary.days[0].uniqueVisitors).toBe(2);
    expect(summary.totals.uniqueVisitors).toBe(2);
  });

  test("keeps API visitors when product analytics has no visitor signal", () => {
    const summary = withDisplayVisitorMetrics({
      ...baseDetail,
      summary: {
        days: [
          {
            date: "2026-06-18",
            calls: 5,
            ai: 1,
            errors: 0,
            uniqueVisitors: 4,
            avgLatencyMs: 25,
          },
        ],
        totals: {
          calls: 5,
          ai: 1,
          errors: 0,
          uniqueVisitors: 4,
          avgLatencyMs: 25,
        },
      },
      product: {
        summary: {
          days: [
            {
              date: "2026-06-18",
              events: 0,
              pageViews: 0,
              sessions: 0,
              appLifecycle: 0,
              auth: 0,
              errors: 0,
              uniqueVisitors: 0,
            },
          ],
          totals: {
            events: 0,
            pageViews: 0,
            sessions: 0,
            appLifecycle: 0,
            auth: 0,
            errors: 0,
            uniqueVisitors: 0,
          },
        },
        topEvents: [],
        topApps: [],
        categories: [],
        sources: [],
        topPaths: [],
      },
    });

    expect(summary.days[0].uniqueVisitors).toBe(4);
    expect(summary.totals.uniqueVisitors).toBe(4);
  });
});
