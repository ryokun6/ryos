import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";

export type RuntimeCrashScope = "app" | "desktop";

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

  console.error("[ryOS] Runtime crash caught by error boundary", {
    ...analyticsPayload,
    componentStack: report.componentStack,
    error,
  });

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
