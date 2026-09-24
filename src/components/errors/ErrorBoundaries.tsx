import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { cn } from "@/lib/utils";
import type { AppId } from "@/config/appRegistry";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import {
  reportRuntimeCrash,
  RYOS_ERROR_BOUNDARY_TEST_EVENT,
  truncateCrashUserAgent,
  type RuntimeCrashTestDetail,
} from "@/utils/errorReporting";
import { isIosWebKit } from "@/utils/device";

type CrashDialogScope = "app" | "desktop";

interface ErrorBoundaryBaseProps {
  children: React.ReactNode;
  fallback: (error: Error, componentStack: string | null) => React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryBaseState {
  error: Error | null;
  componentStack: string | null;
}

interface CrashDialogProps {
  scope: CrashDialogScope;
  titleBarLabel: string;
  heading: string;
  description: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  error: Error;
}

export interface AppErrorBoundaryProps {
  children: React.ReactNode;
  appId: AppId;
  appName: string;
  instanceId: string;
  onRelaunch: () => void;
  onQuit: () => void;
  onCrash?: () => void;
}

export interface DesktopErrorBoundaryProps {
  children: React.ReactNode;
}

export interface IsolatingErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

class ErrorBoundaryBase extends React.Component<
  ErrorBoundaryBaseProps,
  ErrorBoundaryBaseState
> {
  state: ErrorBoundaryBaseState = {
    error: null,
    componentStack: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryBaseState {
    return { error, componentStack: null };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.setState({ componentStack: info.componentStack ?? null });
    this.props.onError?.(error, info);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.state.componentStack);
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
    const handleBoundaryTestCrash = (event: Event) => {
      const detail = (event as CustomEvent<RuntimeCrashTestDetail>).detail;
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

/**
 * Catches render/lifecycle throws without using CrashDialog / Dialog / useSound.
 * Used around lyrics, wallpaper, and the crash-dialog fallback so a secondary
 * throw cannot escalate into DesktopErrorBoundary.
 */
export function IsolatingErrorBoundary({
  children,
  fallback = null,
  onError,
}: IsolatingErrorBoundaryProps) {
  return (
    <ErrorBoundaryBase
      fallback={() => fallback}
      onError={onError}
    >
      {children}
    </ErrorBoundaryBase>
  );
}

export function StaticCrashFallback({
  heading,
  description,
  primaryActionLabel,
  onPrimaryAction,
  error,
  componentStack,
  appId,
  appName,
  timestamp,
  userAgent,
}: {
  heading: string;
  description: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  error: Error;
  componentStack?: string | null;
  appId?: string;
  appName?: string;
  timestamp?: string;
  userAgent?: string;
}) {
  const resolvedTimestamp = timestamp ?? new Date().toISOString();
  const resolvedUserAgent = truncateCrashUserAgent(
    userAgent ??
      (typeof navigator !== "undefined" ? navigator.userAgent : ""),
  );
  const errorLabel = `${error.name}: ${error.message || "Unknown error"}`;
  const stack = error.stack?.trim() || "";
  const resolvedComponentStack = componentStack?.trim() || "";

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/25 p-3"
    >
      <div className="flex max-h-[90dvh] w-full max-w-[420px] flex-col overflow-hidden rounded bg-white p-4 text-black shadow">
        <p className="shrink-0 text-[13px] font-semibold">{heading}</p>
        <p className="mt-1.5 shrink-0 text-[13px] leading-[1.45]">{description}</p>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <p className="select-text text-[12px] font-semibold leading-[1.4] [-webkit-user-select:text]">
            {errorLabel}
          </p>
          {appId ? (
            <p className="mt-1 select-text text-[11px] text-black/70 [-webkit-user-select:text]">
              appId: {appId}
              {appName ? ` (${appName})` : ""}
            </p>
          ) : null}
          <p className="mt-1 select-text break-all text-[11px] text-black/70 [-webkit-user-select:text]">
            {resolvedTimestamp}
            {resolvedUserAgent ? ` · ${resolvedUserAgent}` : ""}
          </p>
          {stack ? (
            <>
              <p className="mt-2 text-[11px] font-semibold">stack</p>
              <pre className="mt-1 max-h-[28vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.4] select-text [-webkit-user-select:text]">
                {stack}
              </pre>
            </>
          ) : null}
          {resolvedComponentStack ? (
            <>
              <p className="mt-2 text-[11px] font-semibold">componentStack</p>
              <pre className="mt-1 max-h-[22vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-[1.4] select-text [-webkit-user-select:text]">
                {resolvedComponentStack}
              </pre>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 justify-end pt-3">
          <button
            type="button"
            onClick={onPrimaryAction}
            className="rounded border border-black/20 bg-neutral-100 px-3 py-1 text-[13px]"
          >
            {primaryActionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function CrashDialog({
  scope,
  titleBarLabel,
  heading,
  description,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  error,
}: CrashDialogProps) {
  const {
    isWindowsTheme,
    isMacOSTheme: isMacTheme,
  } = useThemeFlags();
  const { t } = useTranslation();
  const primaryActionButtonRef = React.useRef<HTMLButtonElement>(null);
  const secondaryActionButtonRef = React.useRef<HTMLButtonElement>(null);
  const headingId = React.useId();
  const descriptionId = React.useId();

  const bodyTextClasses = cn(
    "leading-[1.45] text-black",
    isWindowsTheme
      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
      : isMacTheme
        ? "text-[13px]"
        : "font-geneva-12 text-[12px]",
  );

  const primaryButtonVariant = isMacTheme ? "default" : "retro";
  const secondaryButtonVariant = isMacTheme ? "secondary" : "retro";
  const handleDismissCrashDialog = onSecondaryAction ?? onPrimaryAction;

  const dialogBody = (
    <div
      className={cn(isWindowsTheme ? "p-2 px-4" : "p-5")}
    >
      <div className="flex items-start gap-3">
        <ThemedIcon
          name="warn.png"
          alt={t("common.dialog.close", { defaultValue: "Warning" })}
          className="mt-0.5 size-8 shrink-0 [image-rendering:pixelated]"
          width={32}
          height={32}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p
            id={headingId}
            className={cn(
              "text-black",
              isWindowsTheme
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
                isWindowsTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                  : "font-os-mono text-[10px]",
              )}
            >
              {error.name}: {error.message || "Unknown error"}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-0.5">
            {secondaryActionLabel && onSecondaryAction ? (
              <Button
                ref={secondaryActionButtonRef}
                variant={secondaryButtonVariant}
                onClick={onSecondaryAction}
                className={cn(
                  !isMacTheme && "h-7",
                  isWindowsTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                    : isMacTheme
                      ? "text-[13px]"
                      : "font-geneva-12 text-[12px]",
                )}
              >
                {secondaryActionLabel}
              </Button>
            ) : null}
            <Button
              ref={primaryActionButtonRef}
              variant={primaryButtonVariant}
              onClick={onPrimaryAction}
              className={cn(
                !isMacTheme && "h-7",
                isWindowsTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                  : isMacTheme
                    ? "text-[13px]"
                    : "font-geneva-12 text-[12px]",
              )}
            >
              {primaryActionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog
      open={true}
      modal={scope === "desktop"}
      onOpenChange={(open) => {
        if (!open) {
          handleDismissCrashDialog();
        }
      }}
    >
      {scope === "app" ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[49] bg-black/20"
          onClick={handleDismissCrashDialog}
        />
      ) : null}
      <DialogContent
        overlayClassName={
          scope === "app"
            ? "bg-black/20 pointer-events-none"
            : "bg-black/25"
        }
        className={cn("max-w-[420px]", isWindowsTheme && "p-0 overflow-hidden")}
        style={isWindowsTheme ? { fontSize: "11px" } : undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          primaryActionButtonRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">{titleBarLabel}</DialogTitle>
            <DialogDescription className="sr-only">{description}</DialogDescription>
            <DialogHeader>{titleBarLabel}</DialogHeader>
            <div className="window-body">{dialogBody}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogTitle className="sr-only">{titleBarLabel}</DialogTitle>
            <DialogDescription className="sr-only">{description}</DialogDescription>
            <DialogHeader>{titleBarLabel}</DialogHeader>
            {dialogBody}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {titleBarLabel}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {description}
              </DialogDescription>
            </DialogHeader>
            {dialogBody}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function AppErrorBoundary({
  children,
  appId,
  appName,
  instanceId,
  onRelaunch,
  onQuit,
  onCrash,
}: AppErrorBoundaryProps) {
  const { currentTheme } = useThemeFlags();
  const { t } = useTranslation();

  return (
    <ErrorBoundaryBase
      fallback={(error, componentStack) => {
        const heading = t("common.errorBoundaries.appHeading", {
          appName,
          defaultValue: "{{appName}} quit unexpectedly.",
        });
        const description = t("common.errorBoundaries.appDescription", {
          defaultValue:
            "Relaunch it to open a fresh window, or quit this crashed window. Other open apps will keep running.",
        });
        const primaryActionLabel = t("common.errorBoundaries.relaunch", {
          defaultValue: "Relaunch",
        });
        const staticFallback = (
          <StaticCrashFallback
            heading={heading}
            description={description}
            primaryActionLabel={primaryActionLabel}
            onPrimaryAction={onRelaunch}
            error={error}
            componentStack={componentStack}
            appId={appId}
            appName={appName}
          />
        );
        // iOS WebKit: never mount Dialog/useSound in a crash fallback.
        // CrashDialog itself can throw and escalate into DesktopErrorBoundary.
        if (isIosWebKit()) {
          return staticFallback;
        }
        return (
          <IsolatingErrorBoundary fallback={staticFallback}>
            <CrashDialog
              scope="app"
              titleBarLabel={appName}
              heading={heading}
              description={description}
              primaryActionLabel={primaryActionLabel}
              onPrimaryAction={onRelaunch}
              secondaryActionLabel={t("common.dock.quit", {
                defaultValue: "Quit",
              })}
              onSecondaryAction={onQuit}
              error={error}
            />
          </IsolatingErrorBoundary>
        );
      }}
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
  const { currentTheme } = useThemeFlags();
  const { t } = useTranslation();

  return (
    <ErrorBoundaryBase
      fallback={(error, componentStack) => {
        const heading = t("common.errorBoundaries.desktopHeading", {
          defaultValue: "Desktop quit unexpectedly.",
        });
        const description = t("common.errorBoundaries.desktopDescription", {
          defaultValue:
            "Reload ryOS to restore the Dock, Desktop, and menu bar.",
        });
        const primaryActionLabel = t("common.errorBoundaries.reloadDesktop", {
          defaultValue: "Reload Desktop",
        });
        const reloadDesktop = () => window.location.reload();
        const staticFallback = (
          <StaticCrashFallback
            heading={heading}
            description={description}
            primaryActionLabel={primaryActionLabel}
            onPrimaryAction={reloadDesktop}
            error={error}
            componentStack={componentStack}
          />
        );
        if (isIosWebKit()) {
          return staticFallback;
        }
        return (
          <IsolatingErrorBoundary fallback={staticFallback}>
            <CrashDialog
              scope="desktop"
              titleBarLabel="ryOS"
              heading={heading}
              description={description}
              primaryActionLabel={primaryActionLabel}
              onPrimaryAction={reloadDesktop}
              error={error}
            />
          </IsolatingErrorBoundary>
        );
      }}
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
