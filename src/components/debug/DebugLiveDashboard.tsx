import { useEffect, useId, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import packageInfo from "../../../package.json";
import { getTheme } from "@/themes";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useRealtimeConnectionStatus } from "@/hooks/useRealtimeConnectionStatus";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";
import { getRealtimeChannelNames } from "@/lib/pusherClient";
import { getRealtimeProvider } from "@/utils/runtimeConfig";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useChatsStore } from "@/stores/useChatsStore";
import type { ConsoleLogEntry } from "@/utils/consoleCapture";
import { cn } from "@/lib/utils";
import {
  buildSparklineGeometry,
  formatBytes,
  formatLiveSnapshotMarkdown,
} from "./liveMetrics";
import {
  useLiveEnvironmentSnapshot,
  type MetricAvailability,
  type StorageMetrics,
} from "./useLiveEnvironmentSnapshot";

interface DebugLiveDashboardProps {
  active: boolean;
  entries: readonly ConsoleLogEntry[];
  onReportChange: (report: string) => void;
}

interface SparklineProps {
  label: string;
  values: readonly (number | null)[];
  formatTick: (value: number) => string;
}

interface InstrumentCardProps {
  label: string;
  value: string;
  detail: string;
  values: readonly (number | null)[];
  formatTick: (value: number) => string;
  chartLabel: string;
  glassy: boolean;
}

interface MetricSectionProps {
  title: string;
  glassy: boolean;
  children: ReactNode;
}

interface MetricRowProps {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}

const SPARKLINE_WIDTH = 200;
const SPARKLINE_HEIGHT = 56;
const SPARKLINE_PADDING = 5;

function Sparkline({ label, values, formatTick }: SparklineProps) {
  const gradientId = useId();
  const geometry = buildSparklineGeometry(
    values,
    SPARKLINE_WIDTH,
    SPARKLINE_HEIGHT,
    SPARKLINE_PADDING
  );

  return (
    <div className="relative" aria-hidden={false}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-12 w-full"
        focusable="false"
      >
        <title>{label}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--os-color-link)"
              stopOpacity="0.3"
            />
            <stop
              offset="100%"
              stopColor="var(--os-color-link)"
              stopOpacity="0.02"
            />
          </linearGradient>
        </defs>
        {geometry ? (
          <>
            <polygon points={geometry.area} fill={`url(#${gradientId})`} />
            <line
              x1="0"
              y1={geometry.averageY}
              x2={SPARKLINE_WIDTH}
              y2={geometry.averageY}
              stroke="var(--os-color-separator)"
              strokeWidth="1"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={geometry.line}
              fill="none"
              stroke="var(--os-color-link)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          <line
            x1="0"
            y1={SPARKLINE_HEIGHT / 2}
            x2={SPARKLINE_WIDTH}
            y2={SPARKLINE_HEIGHT / 2}
            stroke="var(--os-color-separator)"
            strokeWidth="1"
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {geometry ? (
        <>
          {/* Live marker — positioned in screen space so it stays a perfect
              circle despite the non-uniform SVG scaling. */}
          <span
            className="pointer-events-none absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--os-color-link)] ring-2 ring-os-panel-bg"
            style={{
              left: `${(geometry.last.x / SPARKLINE_WIDTH) * 100}%`,
              top: `${(geometry.last.y / SPARKLINE_HEIGHT) * 100}%`,
            }}
            aria-hidden
          />
          <span
            className="pointer-events-none absolute right-1 top-0 font-os-mono text-[8px] leading-none tabular-nums text-os-text-secondary"
            aria-hidden
          >
            {formatTick(geometry.maximum)}
          </span>
          <span
            className="pointer-events-none absolute bottom-0 right-1 font-os-mono text-[8px] leading-none tabular-nums text-os-text-secondary"
            aria-hidden
          >
            {formatTick(geometry.minimum)}
          </span>
        </>
      ) : null}
    </div>
  );
}

function InstrumentCard({
  label,
  value,
  detail,
  values,
  formatTick,
  chartLabel,
  glassy,
}: InstrumentCardProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        "min-w-0 rounded-os border p-2",
        "border-[color:var(--os-color-separator)]",
        glassy ? "bg-os-input-bg" : "bg-os-panel-bg"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate font-os-ui text-[10px] font-medium text-os-text-secondary">
          {label}
        </h3>
        <span className="shrink-0 font-os-mono text-[15px] font-semibold tabular-nums text-os-text-primary">
          {value}
        </span>
      </div>
      <div className="mt-1.5">
        <Sparkline values={values} formatTick={formatTick} label={chartLabel} />
      </div>
      <p className="mt-1 truncate font-os-ui text-[9px] text-os-text-secondary">
        {detail}
      </p>
    </section>
  );
}

function MetricSection({ title, glassy, children }: MetricSectionProps) {
  return (
    <section className="mt-2.5">
      <h3 className="mb-1 px-0.5 font-os-ui text-[10px] font-semibold text-os-text-secondary">
        {title}
      </h3>
      <dl
        className={cn(
          "overflow-hidden rounded-os border border-[color:var(--os-color-separator)]",
          glassy ? "bg-os-input-bg" : "bg-os-panel-bg"
        )}
      >
        {children}
      </dl>
    </section>
  );
}

function MetricRow({ label, value, valueClassName }: MetricRowProps) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 border-b border-[color:var(--os-color-separator)] px-2.5 py-1 last:border-b-0">
      <dt className="font-os-ui text-[10px] text-os-text-secondary">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate text-right font-os-mono text-[10px] tabular-nums text-os-text-primary",
          valueClassName
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function formatStorage(
  storage: MetricAvailability<StorageMetrics>,
  locale: string,
  unavailableLabel: string,
  loadingLabel: string
): string {
  if (storage.kind === "pending") return loadingLabel;
  if (storage.kind === "unavailable") return unavailableLabel;
  return `${formatBytes(storage.value.usedBytes, locale)} / ${formatBytes(
    storage.value.quotaBytes,
    locale
  )}`;
}

export function DebugLiveDashboard({
  active,
  entries,
  onReportChange,
}: DebugLiveDashboardProps) {
  const { t, i18n } = useTranslation();
  const flags = useThemeFlags();
  const snapshot = useLiveEnvironmentSnapshot({ active, entries });
  const locale = i18n.resolvedLanguage || i18n.language || "en";
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
    [locale]
  );
  const tickFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale]
  );
  const formatFpsTick = useMemo(
    () => (value: number) => tickFormatter.format(value),
    [tickFormatter]
  );
  const formatLogRateTick = useMemo(
    () => (value: number) => tickFormatter.format(value),
    [tickFormatter]
  );
  const fpsValues = useMemo(
    () => snapshot.history.map((point) => point.fps),
    [snapshot.history]
  );
  const logRateValues = useMemo(
    () => snapshot.history.map((point) => point.logRate),
    [snapshot.history]
  );

  const unavailableLabel = t("debug.live.unavailable");
  const loadingLabel = t("debug.live.loading");
  const fpsValue =
    snapshot.fps === null
      ? "—"
      : `${numberFormatter.format(snapshot.fps)} ${t("debug.live.fpsUnit")}`;
  const frameTime =
    snapshot.frameTimeMs === null
      ? unavailableLabel
      : t("debug.live.frameTime", {
          value: numberFormatter.format(snapshot.frameTimeMs),
        });
  const heapValue =
    snapshot.heap.kind === "available"
      ? snapshot.heap.value.limitBytes !== null
        ? `${formatBytes(snapshot.heap.value.usedBytes, locale)} / ${formatBytes(
            snapshot.heap.value.limitBytes,
            locale
          )}`
        : formatBytes(snapshot.heap.value.usedBytes, locale)
      : unavailableLabel;
  const runtimeLabel = t(`debug.live.runtime.${snapshot.runtime}`);
  const themeName = getTheme(flags.currentTheme).name;
  const themeValue = t("debug.live.themeValue", {
    theme: themeName,
    mode: flags.isDarkMode
      ? t("debug.live.darkMode")
      : t("debug.live.lightMode"),
  });
  const storageValue = formatStorage(
    snapshot.storage,
    locale,
    unavailableLabel,
    loadingLabel
  );
  const viewportValue = t("debug.live.viewportValue", {
    width: snapshot.viewportWidth,
    height: snapshot.viewportHeight,
    dpr: numberFormatter.format(snapshot.devicePixelRatio),
  });
  const networkValue = snapshot.online
    ? t("debug.live.online")
    : t("debug.live.offline");

  const realtimeState = useRealtimeConnectionStatus();
  const isAdmin = useIsRyoAdmin();
  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const autoSyncEnabled = useCloudSyncStore((s) => s.autoSyncEnabled);
  const isCheckingRemote = useCloudSyncStore((s) => s.isCheckingRemote);
  const lastCheckedAt = useCloudSyncStore((s) => s.lastCheckedAt);
  const syncLastError = useCloudSyncStore((s) => s.lastError);
  const categoryStatus = useCloudSyncStore((s) => s.categoryStatus);

  // Channel names are not reactive; re-read each sample tick so the count stays
  // roughly fresh without binding to the realtime internals.
  const channelCount = useMemo(
    () => getRealtimeChannelNames().length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.sampledAt]
  );
  const realtimeProvider = useMemo(() => getRealtimeProvider(), []);
  const realtimeStateLabel = t(`debug.live.realtimeState.${realtimeState}`);
  const realtimeValue = t("debug.live.realtimeValue", {
    state: realtimeStateLabel,
    count: channelCount,
  });
  const realtimeReportValue = t("debug.live.realtimeReport", {
    state: realtimeStateLabel,
    provider: realtimeProvider,
    count: channelCount,
  });
  const realtimeColorClass =
    realtimeState === "connected"
      ? "text-green-600"
      : realtimeState === "connecting"
        ? "text-amber-500"
        : "text-red-500";

  const isSyncingNow =
    isCheckingRemote ||
    Object.values(categoryStatus).some(
      (status) => status.isUploading || status.isDownloading
    );
  const syncStatusLabel = isSyncingNow
    ? t("debug.live.syncSyncing")
    : syncLastError
      ? t("debug.live.syncError")
      : autoSyncEnabled
        ? t("debug.live.syncAuto")
        : t("debug.live.syncOff");
  const cloudSyncValue = syncStatusLabel;
  const cloudSyncReportValue = lastCheckedAt
    ? t("debug.live.syncReport", {
        status: syncStatusLabel,
        checkedAt: new Date(lastCheckedAt).toLocaleString(locale),
      })
    : syncStatusLabel;
  const cloudSyncColorClass = syncLastError
    ? "text-red-500"
    : isSyncingNow
      ? "text-amber-500"
      : undefined;

  const sessionValue = username
    ? isAuthenticated
      ? isAdmin
        ? t("debug.live.sessionAdmin", { username })
        : username
      : t("debug.live.sessionSignedOut", { username })
    : t("debug.live.sessionGuest");

  const report = useMemo(
    () =>
      formatLiveSnapshotMarkdown({
        sampledAt: snapshot.sampledAt,
        locale,
        runtime: runtimeLabel,
        appVersion: `ryOS ${packageInfo.version}`,
        theme: themeValue,
        viewport: viewportValue,
        network: networkValue,
        fps: snapshot.fps,
        frameTimeMs: snapshot.frameTimeMs,
        domNodeCount: snapshot.domNodeCount,
        heap: snapshot.heap.kind === "available" ? heapValue : null,
        storage: snapshot.storage.kind === "available" ? storageValue : null,
        realtime: realtimeReportValue,
        cloudSync: cloudSyncReportValue,
        session: sessionValue,
        totalLogs: snapshot.bufferedLogCount,
        logRate: snapshot.logRate,
        errors: snapshot.errorCount,
        warnings: snapshot.warnCount,
        history: snapshot.history,
        labels: {
          title: t("debug.live.reportTitle"),
          environment: t("debug.live.environment"),
          performance: t("debug.live.performance"),
          logging: t("debug.live.logging"),
          history: t("debug.live.historySummary"),
          metric: t("debug.live.metric"),
          value: t("debug.live.value"),
          services: t("debug.live.services"),
          realtimeConnection: t("debug.live.realtime"),
          cloudSync: t("debug.live.cloudSync"),
          session: t("debug.live.session"),
          runtime: t("debug.live.runtimeLabel"),
          appVersion: t("debug.live.appVersion"),
          locale: t("debug.live.locale"),
          theme: t("debug.live.theme"),
          viewport: t("debug.live.viewport"),
          network: t("debug.live.network"),
          fps: t("debug.live.fps"),
          frameTime: t("debug.live.frameTimeLabel"),
          domNodes: t("debug.live.domNodes"),
          jsHeap: t("debug.live.jsHeap"),
          storage: t("debug.live.storage"),
          totalLogs: t("debug.live.totalLogs"),
          logRate: t("debug.live.logRate"),
          errors: t("debug.live.errors"),
          warnings: t("debug.live.warnings"),
          current: t("debug.live.current"),
          minimum: t("debug.live.minimum"),
          maximum: t("debug.live.maximum"),
          average: t("debug.live.average"),
          unavailable: unavailableLabel,
        },
      }),
    [
      cloudSyncReportValue,
      heapValue,
      locale,
      networkValue,
      realtimeReportValue,
      runtimeLabel,
      sessionValue,
      snapshot,
      storageValue,
      t,
      themeValue,
      unavailableLabel,
      viewportValue,
    ]
  );

  useEffect(() => {
    onReportChange(report);
  }, [onReportChange, report]);

  return (
    <div
      role="region"
      aria-label={t("debug.live.dashboardLabel")}
      className="h-full overflow-auto px-2 py-2 text-os-text-primary"
    >
      <div className="mb-2 flex items-center justify-between gap-2 font-os-ui text-[9px] text-os-text-secondary">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full",
              active && snapshot.pageVisible ? "bg-green-500" : "bg-amber-500"
            )}
            aria-hidden
          />
          {active && snapshot.pageVisible
            ? t("debug.live.sampling")
            : t("debug.live.samplingPaused")}
        </span>
        <span>{t("debug.live.historyWindow", { count: 45 })}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <InstrumentCard
          label={t("debug.live.fps")}
          value={fpsValue}
          detail={frameTime}
          values={fpsValues}
          formatTick={formatFpsTick}
          chartLabel={t("debug.live.fpsChartAria", { value: fpsValue })}
          glassy={flags.isAquaGlass}
        />
        <InstrumentCard
          label={t("debug.live.logRate")}
          value={t("debug.live.logsPerSecond", {
            count: snapshot.logRate,
          })}
          detail={t("debug.live.bufferedLogs", {
            count: snapshot.bufferedLogCount,
          })}
          values={logRateValues}
          formatTick={formatLogRateTick}
          chartLabel={t("debug.live.logRateChartAria", {
            count: snapshot.logRate,
          })}
          glassy={flags.isAquaGlass}
        />
      </div>

      <MetricSection title={t("debug.live.performance")} glassy={flags.isAquaGlass}>
        <MetricRow label={t("debug.live.jsHeap")} value={heapValue} />
        <MetricRow
          label={t("debug.live.domNodes")}
          value={numberFormatter.format(snapshot.domNodeCount)}
        />
        <MetricRow label={t("debug.live.storage")} value={storageValue} />
      </MetricSection>

      <MetricSection title={t("debug.live.logging")} glassy={flags.isAquaGlass}>
        <MetricRow
          label={t("debug.live.totalLogs")}
          value={numberFormatter.format(snapshot.bufferedLogCount)}
        />
        <MetricRow
          label={t("debug.live.logHealth")}
          value={t("debug.live.logHealthValue", {
            errors: snapshot.errorCount,
            warnings: snapshot.warnCount,
          })}
          valueClassName={
            snapshot.errorCount > 0
              ? "text-red-500"
              : snapshot.warnCount > 0
                ? "text-amber-500"
                : undefined
          }
        />
      </MetricSection>

      <MetricSection title={t("debug.live.services")} glassy={flags.isAquaGlass}>
        <MetricRow
          label={t("debug.live.realtime")}
          value={realtimeValue}
          valueClassName={realtimeColorClass}
        />
        <MetricRow
          label={t("debug.live.cloudSync")}
          value={cloudSyncValue}
          valueClassName={cloudSyncColorClass}
        />
        <MetricRow label={t("debug.live.session")} value={sessionValue} />
      </MetricSection>

      <MetricSection
        title={t("debug.live.environment")}
        glassy={flags.isAquaGlass}
      >
        <MetricRow
          label={t("debug.live.network")}
          value={
            <span
              role="status"
              aria-live="off"
              className={snapshot.online ? "text-green-600" : "text-red-500"}
            >
              {networkValue}
            </span>
          }
        />
        <MetricRow label={t("debug.live.viewport")} value={viewportValue} />
        <MetricRow label={t("debug.live.runtimeLabel")} value={runtimeLabel} />
        <MetricRow
          label={t("debug.live.appVersion")}
          value={`ryOS ${packageInfo.version}`}
        />
        <MetricRow label={t("debug.live.locale")} value={locale} />
        <MetricRow label={t("debug.live.theme")} value={themeValue} />
      </MetricSection>
    </div>
  );
}
