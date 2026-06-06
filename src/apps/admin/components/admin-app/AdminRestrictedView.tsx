import type { ReactNode } from "react";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { Warning, WifiSlash } from "@phosphor-icons/react";
import type { AppProps } from "../../../base/types";
import type { TFunction } from "i18next";
import { cn } from "@/lib/utils";
import { adminSurfaceClass } from "../../utils/adminStyles";

export type AdminRestrictedVariant = "accessDenied" | "offline";

export interface AdminRestrictedViewProps
  extends Pick<
    AppProps,
    | "isWindowOpen"
    | "onClose"
    | "isForeground"
    | "skipInitialSound"
    | "instanceId"
    | "onNavigateNext"
    | "onNavigatePrevious"
  > {
  variant: AdminRestrictedVariant;
  t: TFunction;
  username: string | null | undefined;
  isXpTheme: boolean;
  menuBar: ReactNode;
}

export function AdminRestrictedView({
  variant,
  t,
  username,
  isWindowOpen,
  isXpTheme,
  menuBar,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AdminRestrictedViewProps) {
  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isXpTheme={isXpTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: t("apps.admin.title"),
        onClose,
        isForeground,
        appId: "admin",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
      }}
    >
      <div className={cn("flex flex-col items-center justify-center h-full gap-3 p-8 text-center", adminSurfaceClass)}>
        {variant === "accessDenied" ? (
          <Warning className="size-10 text-neutral-400" weight="bold" />
        ) : (
          <WifiSlash className="size-10 text-neutral-400" weight="bold" />
        )}
        <h2 className="text-sm font-bold">
          {variant === "accessDenied"
            ? t("apps.admin.accessDenied.title")
            : t("apps.admin.offline.title", "Offline")}
        </h2>
        <p className="text-xs text-neutral-500 max-w-xs">
          {variant === "accessDenied"
            ? t("apps.admin.accessDenied.description")
            : t(
                "apps.admin.offline.description",
                "Admin requires an internet connection to manage data.",
              )}
        </p>
        {variant === "accessDenied" && !username && (
          <p className="text-[11px] text-neutral-400">
            {t("apps.admin.accessDenied.loginPrompt")}
          </p>
        )}
      </div>
    </AppWindowShell>
  );
}
