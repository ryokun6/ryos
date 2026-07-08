import { describe, expect, test } from "bun:test";
import {
  appendHistoryPoint,
  buildSparklineGeometry,
  buildSparklinePoints,
  calculateLogMetrics,
  formatBytes,
  formatLiveSnapshotMarkdown,
  type LiveHistoryPoint,
  type LiveSnapshotMarkdownLabels,
} from "../../../src/components/debug/liveMetrics";
import { getRestoredScrollTop } from "../../../src/components/debug/debugLogVirtualization";
import type { ConsoleLogEntry } from "../../../src/utils/consoleCapture";

function historyPoint(recordedAt: number): LiveHistoryPoint {
  return { recordedAt, fps: 60, logRate: recordedAt };
}

const REPORT_LABELS: LiveSnapshotMarkdownLabels = {
  title: "Live environment snapshot",
  environment: "Environment",
  performance: "Performance",
  logging: "Logging",
  history: "History summary",
  metric: "Metric",
  value: "Value",
  runtime: "Runtime",
  appVersion: "App",
  locale: "Locale",
  theme: "Theme",
  viewport: "Viewport",
  network: "Network",
  fps: "Rendering cadence",
  frameTime: "Frame time",
  domNodes: "DOM nodes",
  jsHeap: "JS heap",
  storage: "Storage",
  totalLogs: "Total logs",
  logRate: "Log activity",
  errors: "Errors",
  warnings: "Warnings",
  current: "Current",
  minimum: "Minimum",
  maximum: "Maximum",
  average: "Average",
  unavailable: "Unavailable",
};

describe("debug live metrics", () => {
  test("caps history at the requested number of newest points", () => {
    const history = [historyPoint(1), historyPoint(2), historyPoint(3)];
    const result = appendHistoryPoint(history, historyPoint(4), 3);

    expect(result.map((point) => point.recordedAt)).toEqual([2, 3, 4]);
    expect(history.map((point) => point.recordedAt)).toEqual([1, 2, 3]);
  });

  test("calculates recent log rate and buffered severity counts", () => {
    const entries: ConsoleLogEntry[] = [
      { id: 1, level: "log", timestamp: 8_500, text: "old" },
      { id: 2, level: "warn", timestamp: 9_500, text: "recent warn" },
      { id: 3, level: "error", timestamp: 9_999, text: "recent error" },
      { id: 4, level: "error", timestamp: 10_001, text: "future error" },
    ];

    expect(calculateLogMetrics(entries, 10_000)).toEqual({
      logRate: 2,
      errorCount: 2,
      warnCount: 1,
    });
  });

  test("formats byte values into compact binary units", () => {
    expect(formatBytes(0, "en-US")).toBe("0 B");
    expect(formatBytes(1_536, "en-US")).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024, "en-US")).toBe("5 MB");
  });

  test("builds stable sparkline points for constant and missing values", () => {
    expect(buildSparklinePoints([5, 5, 5], 100, 40)).toBe(
      "0.0,20.0 50.0,20.0 100.0,20.0"
    );
    expect(buildSparklinePoints([null, 5, null], 100, 40)).toBe("50.0,20.0");
    expect(buildSparklinePoints([null], 100, 40)).toBe("");
  });

  test("returns null geometry when no finite values are present", () => {
    expect(buildSparklineGeometry([], 200, 56, 5)).toBeNull();
    expect(buildSparklineGeometry([null, null], 200, 56, 5)).toBeNull();
  });

  test("builds area geometry with summary, padding, and live marker", () => {
    const geometry = buildSparklineGeometry([0, 5, 10], 200, 60, 5);
    expect(geometry).not.toBeNull();
    if (!geometry) return;

    expect(geometry.minimum).toBe(0);
    expect(geometry.maximum).toBe(10);
    expect(geometry.average).toBe(5);
    // Trend line spans the full width and respects vertical padding.
    expect(geometry.line).toBe("0.0,55.0 100.0,30.0 200.0,5.0");
    // Average reference line sits at the vertical midpoint here.
    expect(geometry.averageY).toBeCloseTo(30, 5);
    // Filled polygon drops to the baseline (full height) at both ends.
    expect(geometry.area).toBe(
      "0.0,60.0 0.0,55.0 100.0,30.0 200.0,5.0 200.0,60.0"
    );
    // Newest point anchors the live marker at the right edge.
    expect(geometry.last).toEqual({ x: 200, y: 5, value: 10 });
  });

  test("centers a flat series and keeps it within the padded band", () => {
    const geometry = buildSparklineGeometry([7, 7, 7], 200, 60, 5);
    expect(geometry).not.toBeNull();
    if (!geometry) return;

    expect(geometry.minimum).toBe(7);
    expect(geometry.maximum).toBe(7);
    expect(geometry.line).toBe("0.0,30.0 100.0,30.0 200.0,30.0");
    expect(geometry.averageY).toBeCloseTo(30, 5);
  });

  test("restores a remounted log scroller without losing its position", () => {
    expect(
      getRestoredScrollTop({
        previousScrollTop: 420,
        scrollHeight: 1_000,
        clientHeight: 300,
        stickToBottom: false,
      })
    ).toBe(420);
    expect(
      getRestoredScrollTop({
        previousScrollTop: 420,
        scrollHeight: 1_000,
        clientHeight: 300,
        stickToBottom: true,
      })
    ).toBe(700);
  });

  test("formats a concise Markdown snapshot with history summaries", () => {
    const report = formatLiveSnapshotMarkdown({
      sampledAt: Date.UTC(2026, 5, 27, 12, 0, 0),
      locale: "en-US",
      runtime: "Browser",
      appVersion: "ryOS 1.0.8",
      theme: "Aqua · Light",
      viewport: "1440×900 @ 2x",
      network: "Online",
      fps: 60,
      frameTimeMs: 16.7,
      domNodeCount: 1_234,
      heap: "40 MB / 2 GB",
      storage: "5 MB / 10 GB",
      totalLogs: 42,
      logRate: 4,
      errors: 1,
      warnings: 2,
      history: [
        { recordedAt: 1, fps: 40, logRate: 2 },
        { recordedAt: 2, fps: 60, logRate: 4 },
      ],
      labels: REPORT_LABELS,
    });

    expect(report).toContain("# Live environment snapshot (Jun 27, 2026");
    expect(report).toContain("| Runtime | Browser |");
    expect(report).toContain("| JS heap | 40 MB / 2 GB |");
    expect(report).toContain(
      "| Rendering cadence | 60 fps | 40 fps | 60 fps | 50 fps |"
    );
    expect(report).not.toContain("localStorage");
  });

  test("includes a Services section when service labels are provided", () => {
    const report = formatLiveSnapshotMarkdown({
      sampledAt: Date.UTC(2026, 5, 27, 12, 0, 0),
      locale: "en-US",
      runtime: "Browser",
      appVersion: "ryOS 1.0.8",
      theme: "Aqua · Light",
      viewport: "1440×900 @ 2x",
      network: "Online",
      fps: 60,
      frameTimeMs: 16.7,
      domNodeCount: 1_234,
      heap: "40 MB / 2 GB",
      storage: "5 MB / 10 GB",
      realtime: "Connected · pusher · 2 channels",
      cloudSync: "Auto · last checked Jun 27",
      session: "ryo (admin)",
      totalLogs: 42,
      logRate: 4,
      errors: 0,
      warnings: 0,
      history: [{ recordedAt: 1, fps: 60, logRate: 4 }],
      labels: {
        ...REPORT_LABELS,
        services: "Services",
        realtimeConnection: "Realtime",
        cloudSync: "Cloud sync",
        session: "Session",
      },
    });

    expect(report).toContain("## Services");
    expect(report).toContain("| Realtime | Connected · pusher · 2 channels |");
    expect(report).toContain("| Cloud sync | Auto · last checked Jun 27 |");
    expect(report).toContain("| Session | ryo (admin) |");
  });

  test("omits the Services section when labels are absent", () => {
    const report = formatLiveSnapshotMarkdown({
      sampledAt: Date.UTC(2026, 5, 27, 12, 0, 0),
      locale: "en-US",
      runtime: "Browser",
      appVersion: "ryOS 1.0.8",
      theme: "Aqua · Light",
      viewport: "1440×900 @ 2x",
      network: "Online",
      fps: 60,
      frameTimeMs: 16.7,
      domNodeCount: 1_234,
      heap: "40 MB / 2 GB",
      storage: "5 MB / 10 GB",
      totalLogs: 42,
      logRate: 4,
      errors: 0,
      warnings: 0,
      history: [{ recordedAt: 1, fps: 60, logRate: 4 }],
      labels: REPORT_LABELS,
    });

    expect(report).not.toContain("## Services");
  });

  test("marks unavailable snapshot values explicitly", () => {
    const report = formatLiveSnapshotMarkdown({
      sampledAt: Date.UTC(2026, 5, 27),
      locale: "en-US",
      runtime: "PWA",
      appVersion: "ryOS 1.0.8",
      theme: "Aqua · Dark",
      viewport: "390×844 @ 3x",
      network: "Offline",
      fps: null,
      frameTimeMs: null,
      domNodeCount: 100,
      heap: null,
      storage: null,
      totalLogs: 0,
      logRate: 0,
      errors: 0,
      warnings: 0,
      history: [{ recordedAt: 1, fps: null, logRate: 0 }],
      labels: REPORT_LABELS,
    });

    expect(report).toContain("| JS heap | Unavailable |");
    expect(report).toContain("| Storage | Unavailable |");
    expect(report).toContain("| Rendering cadence | Unavailable |");
  });
});
