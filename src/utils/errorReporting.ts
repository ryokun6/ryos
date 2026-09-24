import { APP_ANALYTICS, track } from "@/utils/analytics";

export type RuntimeCrashScope = "app" | "desktop";

export interface RuntimeCrashTestDetail {
  scope: RuntimeCrashScope;
  appId?: string;
  appName?: string;
  instanceId?: string;
  message?: string;
}

export const RYOS_ERROR_BOUNDARY_TEST_EVENT = "ryos:error-boundary-test";

export interface RuntimeCrashContext {
  scope: RuntimeCrashScope;
  boundary: "AppErrorBoundary" | "DesktopErrorBoundary";
  appId?: string;
  appName?: string;
  instanceId?: string;
  componentStack?: string | null;
  theme?: string | null;
  userAgent?: string;
}

export interface RuntimeCrashReport extends RuntimeCrashContext {
  error: Error;
  timestamp: string;
}

export interface RuntimeErrorReporter {
  reportError: (report: RuntimeCrashReport) => void | Promise<void>;
}

declare global {
  interface Window {
    __RYOS_ERROR_REPORTER__?: RuntimeErrorReporter;
    reportError?: (error: unknown) => void;
  }
}

let configuredErrorReporter: RuntimeErrorReporter | null = null;

export function setRuntimeErrorReporter(
  reporter: RuntimeErrorReporter | null,
): void {
  configuredErrorReporter = reporter;
}

export function getRuntimeErrorReporter(): RuntimeErrorReporter | null {
  if (configuredErrorReporter) {
    return configuredErrorReporter;
  }

  if (typeof window !== "undefined") {
    return window.__RYOS_ERROR_REPORTER__ ?? null;
  }

  return null;
}

export const CRASH_USER_AGENT_MAX_LENGTH = 180;

export function truncateCrashUserAgent(
  userAgent: string,
  maxLength = CRASH_USER_AGENT_MAX_LENGTH,
): string {
  if (userAgent.length <= maxLength) {
    return userAgent;
  }
  return `${userAgent.slice(0, maxLength)}…`;
}

export function formatCrashDiagnosticDump(input: {
  error: Error;
  componentStack?: string | null;
  appId?: string | null;
  appName?: string | null;
  userAgent?: string | null;
  timestamp?: string;
  boundary?: string | null;
}): string {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const rawUa =
    input.userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const userAgent = rawUa ? truncateCrashUserAgent(rawUa) : "";
  const lines = [
    input.boundary ? `boundary: ${input.boundary}` : null,
    `${input.error.name}: ${input.error.message || "Unknown error"}`,
    input.appId ? `appId: ${input.appId}` : null,
    input.appName ? `appName: ${input.appName}` : null,
    `time: ${timestamp}`,
    userAgent ? `ua: ${userAgent}` : null,
    "",
    "stack:",
    input.error.stack?.trim() || "(none)",
    "",
    "componentStack:",
    input.componentStack?.trim() || "(none)",
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
}

export function reportRuntimeCrash(
  error: Error,
  context: RuntimeCrashContext,
): void {
  const report: RuntimeCrashReport = {
    ...context,
    error,
    timestamp: new Date().toISOString(),
    userAgent:
      context.userAgent ??
      (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
  };

  const analyticsPayload = {
    boundary: report.boundary,
    scope: report.scope,
    appId: report.appId,
    appName: report.appName,
    instanceId: report.instanceId,
    errorName: error.name,
    errorMessage: error.message,
    theme: report.theme,
  };

  const diagnosticDump = formatCrashDiagnosticDump({
    error,
    componentStack: report.componentStack,
    appId: report.appId,
    appName: report.appName,
    userAgent: report.userAgent,
    timestamp: report.timestamp,
    boundary: report.boundary,
  });
  console.error(`[ryOS] Runtime crash caught by error boundary\n${diagnosticDump}`);

  try {
    track(
      report.scope === "desktop"
        ? APP_ANALYTICS.DESKTOP_CRASH
        : APP_ANALYTICS.APP_CRASH,
      analyticsPayload,
    );
  } catch (analyticsError) {
    console.error("[ryOS] Failed to track runtime crash analytics", analyticsError);
  }

  const reporter = getRuntimeErrorReporter();
  if (reporter) {
    void Promise.resolve(reporter.reportError(report)).catch(
      (reporterError: unknown) => {
        console.error("[ryOS] Optional error reporter failed", reporterError);
      },
    );
  }

  if (typeof window !== "undefined" && typeof window.reportError === "function") {
    try {
      window.reportError(error);
    } catch (browserError) {
      console.error("[ryOS] window.reportError failed", browserError);
    }
  }
}

export function triggerRuntimeCrashTest(detail: RuntimeCrashTestDetail): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<RuntimeCrashTestDetail>(RYOS_ERROR_BOUNDARY_TEST_EVENT, {
      detail,
    }),
  );
}
