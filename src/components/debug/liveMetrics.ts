import type { ConsoleLogEntry } from "@/utils/consoleCapture";

export const LIVE_HISTORY_LIMIT = 45;

export interface LiveHistoryPoint {
  recordedAt: number;
  fps: number | null;
  logRate: number;
}

export interface LiveLogMetrics {
  logRate: number;
  errorCount: number;
  warnCount: number;
}

export interface LiveSnapshotMarkdownLabels {
  title: string;
  environment: string;
  performance: string;
  logging: string;
  history: string;
  metric: string;
  value: string;
  /** Optional "Services" section header — section is omitted when absent. */
  services?: string;
  realtimeConnection?: string;
  cloudSync?: string;
  session?: string;
  runtime: string;
  appVersion: string;
  locale: string;
  theme: string;
  viewport: string;
  network: string;
  fps: string;
  frameTime: string;
  domNodes: string;
  jsHeap: string;
  storage: string;
  totalLogs: string;
  logRate: string;
  errors: string;
  warnings: string;
  current: string;
  minimum: string;
  maximum: string;
  average: string;
  unavailable: string;
}

export interface LiveSnapshotMarkdownData {
  sampledAt: number;
  locale: string;
  runtime: string;
  appVersion: string;
  theme: string;
  viewport: string;
  network: string;
  fps: number | null;
  frameTimeMs: number | null;
  domNodeCount: number;
  heap: string | null;
  storage: string | null;
  /** Optional services snapshot (realtime / cloud sync / session). */
  realtime?: string | null;
  cloudSync?: string | null;
  session?: string | null;
  totalLogs: number;
  logRate: number;
  errors: number;
  warnings: number;
  history: readonly LiveHistoryPoint[];
  labels: LiveSnapshotMarkdownLabels;
}

interface MetricSummary {
  minimum: number;
  maximum: number;
  average: number;
}

export function appendHistoryPoint(
  history: readonly LiveHistoryPoint[],
  point: LiveHistoryPoint,
  limit = LIVE_HISTORY_LIMIT
): LiveHistoryPoint[] {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const next = [...history, point];
  return next.length <= safeLimit ? next : next.slice(-safeLimit);
}

export function calculateLogMetrics(
  entries: readonly ConsoleLogEntry[],
  now: number,
  windowMs = 1_000
): LiveLogMetrics {
  const cutoff = now - Math.max(1, windowMs);
  let logRate = 0;
  let errorCount = 0;
  let warnCount = 0;

  for (const entry of entries) {
    if (entry.timestamp > cutoff && entry.timestamp <= now) {
      logRate += 1;
    }
    if (entry.level === "error") errorCount += 1;
    if (entry.level === "warn") warnCount += 1;
  }

  return { logRate, errorCount, warnCount };
}

export function formatBytes(bytes: number, locale = "en"): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** unitIndex;
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: value >= 100 || unitIndex === 0 ? 0 : 1,
  });

  return `${formatter.format(value)} ${units[unitIndex]}`;
}

export function buildSparklinePoints(
  values: readonly (number | null)[],
  width: number,
  height: number
): string {
  const usableWidth = Math.max(1, width);
  const usableHeight = Math.max(1, height);
  const points = values.flatMap((value, index) =>
    value === null || !Number.isFinite(value) ? [] : [{ index, value }]
  );

  if (points.length === 0) return "";

  const numericValues = points.map((point) => point.value);
  const minimum = Math.min(...numericValues);
  const maximum = Math.max(...numericValues);
  const range = maximum - minimum;
  const denominator = Math.max(1, values.length - 1);

  return points
    .map(({ index, value }) => {
      const x = (index / denominator) * usableWidth;
      const y =
        range === 0
          ? usableHeight / 2
          : usableHeight - ((value - minimum) / range) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export interface SparklineGeometryPoint {
  x: number;
  y: number;
  value: number;
}

export interface SparklineGeometry {
  /** Plotted points in viewBox coordinates. */
  points: SparklineGeometryPoint[];
  /** `<polyline>` points string for the trend line. */
  line: string;
  /** `<polygon>` points string for the filled area beneath the line. */
  area: string;
  minimum: number;
  maximum: number;
  average: number;
  /** Y coordinate of the average reference line in viewBox space. */
  averageY: number;
  /** Newest plotted point (right-most), used to anchor the live marker. */
  last: SparklineGeometryPoint;
}

/**
 * Builds the full geometry needed to render an area sparkline: the trend
 * polyline, the filled polygon, the min/max/average summary, and the latest
 * point. `padding` insets the line vertically so peaks and troughs (and the
 * stroke width) are not clipped at the edges of the viewBox.
 */
export function buildSparklineGeometry(
  values: readonly (number | null)[],
  width: number,
  height: number,
  padding = 0
): SparklineGeometry | null {
  const usableWidth = Math.max(1, width);
  const usableHeight = Math.max(1, height);
  const pad = Math.max(0, Math.min(padding, usableHeight / 2 - 0.5));
  const innerHeight = Math.max(1, usableHeight - pad * 2);

  const collected = values.flatMap((value, index) =>
    value === null || !Number.isFinite(value) ? [] : [{ index, value }]
  );
  if (collected.length === 0) return null;

  const numericValues = collected.map((point) => point.value);
  const minimum = Math.min(...numericValues);
  const maximum = Math.max(...numericValues);
  const range = maximum - minimum;
  const average =
    numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  const denominator = Math.max(1, values.length - 1);

  const yFor = (value: number) =>
    range === 0
      ? pad + innerHeight / 2
      : pad + innerHeight - ((value - minimum) / range) * innerHeight;

  const points: SparklineGeometryPoint[] = collected.map(({ index, value }) => ({
    x: (index / denominator) * usableWidth,
    y: yFor(value),
    value,
  }));

  const line = points
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${first.x.toFixed(1)},${usableHeight.toFixed(
    1
  )} ${line} ${last.x.toFixed(1)},${usableHeight.toFixed(1)}`;

  return {
    points,
    line,
    area,
    minimum,
    maximum,
    average,
    averageY: yFor(average),
    last,
  };
}

function summarizeMetric(
  values: readonly (number | null)[]
): MetricSummary | null {
  const availableValues = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  );
  if (availableValues.length === 0) return null;

  let minimum = availableValues[0];
  let maximum = availableValues[0];
  let total = 0;
  for (const value of availableValues) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
    total += value;
  }

  return {
    minimum,
    maximum,
    average: total / availableValues.length,
  };
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function formatLiveSnapshotMarkdown({
  sampledAt,
  locale,
  runtime,
  appVersion,
  theme,
  viewport,
  network,
  fps,
  frameTimeMs,
  domNodeCount,
  heap,
  storage,
  realtime,
  cloudSync,
  session,
  totalLogs,
  logRate,
  errors,
  warnings,
  history,
  labels,
}: LiveSnapshotMarkdownData): string {
  const numberFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  });
  const timestamp = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "long",
  }).format(new Date(sampledAt));
  const formatNumber = (value: number | null, suffix = "") =>
    value === null
      ? labels.unavailable
      : `${numberFormatter.format(value)}${suffix}`;
  const row = (label: string, value: string | number) =>
    `| ${escapeMarkdownCell(label)} | ${escapeMarkdownCell(String(value))} |`;

  const fpsSummary = summarizeMetric(history.map((point) => point.fps));
  const logRateSummary = summarizeMetric(
    history.map((point) => point.logRate)
  );
  const summaryRow = (
    label: string,
    currentValue: number | null,
    summary: MetricSummary | null,
    suffix: string
  ) =>
    `| ${escapeMarkdownCell(label)} | ${formatNumber(
      currentValue,
      suffix
    )} | ${
      summary ? formatNumber(summary.minimum, suffix) : labels.unavailable
    } | ${
      summary ? formatNumber(summary.maximum, suffix) : labels.unavailable
    } | ${
      summary ? formatNumber(summary.average, suffix) : labels.unavailable
    } |`;

  const servicesSection =
    labels.services &&
    labels.realtimeConnection &&
    labels.cloudSync &&
    labels.session
      ? [
          "",
          `## ${labels.services}`,
          `| ${labels.metric} | ${labels.value} |`,
          "| --- | --- |",
          row(labels.realtimeConnection, realtime ?? labels.unavailable),
          row(labels.cloudSync, cloudSync ?? labels.unavailable),
          row(labels.session, session ?? labels.unavailable),
        ]
      : [];

  return [
    `# ${labels.title} (${timestamp})`,
    "",
    `## ${labels.environment}`,
    `| ${labels.metric} | ${labels.value} |`,
    "| --- | --- |",
    row(labels.runtime, runtime),
    row(labels.appVersion, appVersion),
    row(labels.locale, locale),
    row(labels.theme, theme),
    row(labels.viewport, viewport),
    row(labels.network, network),
    ...servicesSection,
    "",
    `## ${labels.performance}`,
    `| ${labels.metric} | ${labels.value} |`,
    "| --- | --- |",
    row(labels.fps, formatNumber(fps, " fps")),
    row(labels.frameTime, formatNumber(frameTimeMs, " ms")),
    row(labels.domNodes, numberFormatter.format(domNodeCount)),
    row(labels.jsHeap, heap ?? labels.unavailable),
    row(labels.storage, storage ?? labels.unavailable),
    "",
    `## ${labels.logging}`,
    `| ${labels.metric} | ${labels.value} |`,
    "| --- | --- |",
    row(labels.totalLogs, totalLogs),
    row(labels.logRate, `${numberFormatter.format(logRate)}/s`),
    row(labels.errors, errors),
    row(labels.warnings, warnings),
    "",
    `## ${labels.history}`,
    `| ${labels.metric} | ${labels.current} | ${labels.minimum} | ${labels.maximum} | ${labels.average} |`,
    "| --- | ---: | ---: | ---: | ---: |",
    summaryRow(labels.fps, fps, fpsSummary, " fps"),
    summaryRow(labels.logRate, logRate, logRateSummary, "/s"),
  ].join("\n");
}
