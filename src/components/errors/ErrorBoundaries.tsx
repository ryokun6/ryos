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
import { useThemeStore } from "@/stores/useThemeStore";
import {
  reportRuntimeCrash,
  RYOS_ERROR_BOUNDARY_TEST_EVENT,
  type RuntimeCrashTestDetail,
} from "@/utils/errorReporting";

type CrashDialogScope = "app" | "desktop";

interface ErrorBoundaryBaseProps {
  children: React.ReactNode;
  fallback: (error: Error) => React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface ErrorBoundaryBaseState {
  error: Error | null;
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

  const bodyTextClasses = cn(
    "leading-[1.45] text-black",
    isXpTheme
      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
      : isMacTheme
        ? "text-[13px]"
        : "font-geneva-12 text-[12px]",
  );

  const buttonVariant = isMacTheme ? "default" : "retro";

  const dialogBody = (
    <div
      className={cn(isXpTheme ? "p-2 px-4" : "p-5")}
    >
      <div className="flex items-start gap-3">
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

          <div className="flex justify-end pt-0.5">
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
    </div>
  );

  return (
    <Dialog
      open={true}
      modal={scope === "desktop"}
      onOpenChange={(open) => {
        if (!open) {
          onAction();
        }
      }}
    >
      <DialogContent
        overlayClassName={
          scope === "app"
            ? "bg-transparent pointer-events-none"
            : "bg-black/25"
        }
        className={cn("max-w-[420px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          actionButtonRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>{titleBarLabel}</DialogHeader>
            <div className="window-body">{dialogBody}</div>
          </>
        ) : isMacTheme ? (
          <>
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
