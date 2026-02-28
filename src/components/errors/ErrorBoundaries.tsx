import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { cn } from "@/lib/utils";
import type { AppId } from "@/config/appRegistry";
import { useThemeStore } from "@/stores/useThemeStore";
import { reportRuntimeCrash } from "@/utils/errorReporting";

type CrashDialogScope = "app" | "desktop";

interface ErrorBoundaryBaseProps {
  children: React.ReactNode;
  fallback: (error: Error) => React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryBaseState {
  error: Error | null;
}

interface BoundaryTestEventDetail {
  scope: CrashDialogScope;
  appId?: AppId;
  instanceId?: string;
  message?: string;
}

interface CrashDialogProps {
  scope: CrashDialogScope;
  titleBarLabel: string;
  heading: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  error: Error;
}

export interface AppErrorBoundaryProps {
  children: React.ReactNode;
  appId: AppId;
  appName: string;
  instanceId: string;
  onRelaunch: () => void;
  onCrash?: () => void;
}

export interface DesktopErrorBoundaryProps {
  children: React.ReactNode;
}

export const RYOS_ERROR_BOUNDARY_TEST_EVENT = "ryos:error-boundary-test";

class ErrorBoundaryBase extends React.Component<
  ErrorBoundaryBaseProps,
  ErrorBoundaryBaseState
> {
  state: ErrorBoundaryBaseState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryBaseState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error);
    }

    return this.props.children;
  }
}

function BoundaryTestCrash({
  scope,
  appId,
  instanceId,
}: {
  scope: CrashDialogScope;
  appId?: AppId;
  instanceId?: string;
}) {
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!import.meta.env.DEV) {
      return undefined;
    }

    const handleBoundaryTestCrash = (event: Event) => {
      const detail = (event as CustomEvent<BoundaryTestEventDetail>).detail;
      if (detail.scope !== scope) {
        return;
      }

      if (scope === "app") {
        if (detail.instanceId && detail.instanceId !== instanceId) {
          return;
        }

        if (detail.appId && detail.appId !== appId) {
          return;
        }

        if (!detail.instanceId && !detail.appId) {
          return;
        }
      }

      setMessage(detail.message ?? `[ryOS] Simulated ${scope} crash`);
    };

    window.addEventListener(
      RYOS_ERROR_BOUNDARY_TEST_EVENT,
      handleBoundaryTestCrash as EventListener,
    );

    return () => {
      window.removeEventListener(
        RYOS_ERROR_BOUNDARY_TEST_EVENT,
        handleBoundaryTestCrash as EventListener,
      );
    };
  }, [appId, instanceId, scope]);

  if (message) {
    throw new Error(message);
  }

  return null;
}

function CrashDialog({
  scope,
  titleBarLabel,
  heading,
  description,
  actionLabel,
  onAction,
  error,
}: CrashDialogProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const { t } = useTranslation();
  const actionButtonRef = React.useRef<HTMLButtonElement>(null);
  const headingId = React.useId();
  const descriptionId = React.useId();

  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";

  React.useEffect(() => {
    actionButtonRef.current?.focus();
  }, []);

  const bodyTextClasses = cn(
    "leading-[1.45] text-black",
    isXpTheme
      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
      : isMacTheme
        ? "text-[13px]"
        : "font-geneva-12 text-[12px]",
  );

  const buttonVariant = isMacTheme ? "default" : "retro";

  const content = (
    <div
      className={cn("flex gap-3", isXpTheme ? "p-4" : "p-5")}
      style={
        isMacTheme
          ? {
              backgroundColor: "var(--os-color-window-bg)",
              backgroundImage: "var(--os-pinstripe-window)",
            }
          : isSystem7Theme
            ? { backgroundColor: "#E3E3E3" }
            : undefined
      }
    >
      <ThemedIcon
        name="warn.png"
        alt={t("common.dialog.close", { defaultValue: "Warning" })}
        className="mt-0.5 h-8 w-8 shrink-0 [image-rendering:pixelated]"
        width={32}
        height={32}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p
          id={headingId}
          className={cn(
            "text-black",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px] font-bold"
              : isMacTheme
                ? "text-[13px] font-semibold"
                : "font-geneva-12 text-[12px] font-bold",
          )}
        >
          {heading}
        </p>

        <p id={descriptionId} className={cn(bodyTextClasses, "mt-0")}>
          {description}
        </p>

        {import.meta.env.DEV ? (
          <div
            className={cn(
              "rounded border border-black/15 bg-black/5 px-2 py-1.5 text-black/80",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                : "font-os-mono text-[10px]",
            )}
          >
            {error.name}: {error.message || "Unknown error"}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button
            ref={actionButtonRef}
            variant={buttonVariant}
            onClick={onAction}
            className={cn(
              !isMacTheme && "h-7",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : isMacTheme
                  ? "text-[13px]"
                  : "font-geneva-12 text-[12px]",
            )}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "fixed inset-0 z-[10040] flex items-center justify-center p-4",
        scope === "desktop"
          ? "bg-black/25 backdrop-blur-[1px]"
          : "pointer-events-none",
      )}
      role="presentation"
    >
      <section
        role="alertdialog"
        aria-modal={scope === "desktop"}
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        className="pointer-events-auto w-full max-w-[420px]"
      >
        {isXpTheme ? (
          <div className="window overflow-hidden">
            <div
              className="title-bar"
              style={currentTheme === "xp" ? { minHeight: "30px" } : undefined}
            >
              <div className="title-bar-text">{titleBarLabel}</div>
            </div>
            <div className="window-body">{content}</div>
          </div>
        ) : isMacTheme ? (
          <div className="overflow-hidden rounded-[0.45rem] border-[length:var(--os-metrics-border-width)] border-os-window bg-os-window-bg shadow-os-window">
            <div
              className="grid h-6 grid-cols-[42px_1fr_42px] items-center border-b border-black/10 px-2"
              style={{ backgroundImage: "var(--os-pinstripe-titlebar)" }}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-[12px] w-[12px] rounded-full bg-[#FF5F57] shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),0_0_0_0.5px_rgba(0,0,0,0.35)]" />
                <span className="h-[12px] w-[12px] rounded-full bg-[#FEBC2E] shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),0_0_0_0.5px_rgba(0,0,0,0.35)]" />
                <span className="h-[12px] w-[12px] rounded-full bg-[#28C840] shadow-[inset_0_1px_1px_rgba(255,255,255,0.65),0_0_0_0.5px_rgba(0,0,0,0.35)]" />
              </div>
              <span
                className="truncate text-center text-[13px] font-medium text-os-titlebar-active-text"
                style={{ textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)" }}
              >
                {titleBarLabel}
              </span>
              <div />
            </div>
            {content}
          </div>
        ) : (
          <div className="overflow-hidden border-[length:var(--os-metrics-border-width)] border-os-window bg-os-window-bg shadow-os-window">
            <div
              className="flex h-os-titlebar items-center border-b-[1.5px] border-b-os-window px-[0.1rem] py-[0.2rem]"
              style={{
                background:
                  "var(--os-color-titlebar-pattern, none) 0 0 / 6.6666666667% 13.3333333333% repeat padding-box content-box, white",
              }}
            >
              <div className="mx-auto bg-os-button-face px-2 py-0 font-geneva-12 text-[12px] text-os-titlebar-active-text">
                {titleBarLabel}
              </div>
            </div>
            {content}
          </div>
        )}
      </section>
    </div>
  );
}

export function AppErrorBoundary({
  children,
  appId,
  appName,
  instanceId,
  onRelaunch,
  onCrash,
}: AppErrorBoundaryProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const { t } = useTranslation();

  return (
    <ErrorBoundaryBase
      fallback={(error) => (
        <CrashDialog
          scope="app"
          titleBarLabel={appName}
          heading={t("common.errorBoundaries.appHeading", {
            appName,
            defaultValue: "{{appName}} quit unexpectedly.",
          })}
          description={t("common.errorBoundaries.appDescription", {
            defaultValue:
              "Relaunch it to open a fresh window. Other open apps will keep running.",
          })}
          actionLabel={t("common.errorBoundaries.relaunch", {
            defaultValue: "Relaunch",
          })}
          onAction={onRelaunch}
          error={error}
        />
      )}
      onError={(error, info) => {
        onCrash?.();
        reportRuntimeCrash(error, {
          scope: "app",
          boundary: "AppErrorBoundary",
          appId,
          appName,
          instanceId,
          componentStack: info.componentStack,
          theme: currentTheme,
        });
      }}
    >
      <BoundaryTestCrash scope="app" appId={appId} instanceId={instanceId} />
      {children}
    </ErrorBoundaryBase>
  );
}

export function DesktopErrorBoundary({
  children,
}: DesktopErrorBoundaryProps) {
  const currentTheme = useThemeStore((state) => state.current);
  const { t } = useTranslation();

  return (
    <ErrorBoundaryBase
      fallback={(error) => (
        <CrashDialog
          scope="desktop"
          titleBarLabel="ryOS"
          heading={t("common.errorBoundaries.desktopHeading", {
            defaultValue: "Desktop quit unexpectedly.",
          })}
          description={t("common.errorBoundaries.desktopDescription", {
            defaultValue:
              "Reload ryOS to restore the Dock, Desktop, and menu bar.",
          })}
          actionLabel={t("common.errorBoundaries.reloadDesktop", {
            defaultValue: "Reload Desktop",
          })}
          onAction={() => window.location.reload()}
          error={error}
        />
      )}
      onError={(error, info) => {
        reportRuntimeCrash(error, {
          scope: "desktop",
          boundary: "DesktopErrorBoundary",
          componentStack: info.componentStack,
          theme: currentTheme,
        });
      }}
    >
      <BoundaryTestCrash scope="desktop" />
      {children}
    </ErrorBoundaryBase>
  );
}
