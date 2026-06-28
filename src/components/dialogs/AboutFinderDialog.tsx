import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { getNonFinderApps } from "@/config/appRegistry";
import { useAppStore } from "@/stores/useAppStore";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";
import { cn } from "@/lib/utils";
import { useMemo, useState, useEffect } from "react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { getTranslatedAppName } from "@/utils/i18n";
import type { AppId } from "@/config/appRegistry";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  getDesktopDownloadUrl,
  getSupportedDesktopDownloadTarget,
} from "@/utils/desktopDownload";
import { getDocsBaseUrl } from "@/utils/runtimeConfig";

interface AboutFinderDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AppMemoryUsage {
  name: string;
  memoryMB: number;
  percentage: number;
}

// Read the real memory metrics the browser exposes:
// - navigator.deviceMemory: the device's approximate total RAM in GB (coarsened
//   for privacy, capped at 8). Available on Chromium-based browsers.
// - performance.memory.usedJSHeapSize: the live JS heap usage (Chromium-only,
//   non-standard) which represents the memory actually consumed by the running
//   ryOS process. jsHeapSizeLimit is used as a total fallback.
// Returns megabytes (or null when a metric is unavailable so callers can fall
// back to the legacy simulated values).
const readRealMemory = (): { totalMB: number | null; usedMB: number | null } => {
  let totalMB: number | null = null;
  let usedMB: number | null = null;

  try {
    if (typeof navigator !== "undefined") {
      const deviceMemoryGB = (
        navigator as Navigator & { deviceMemory?: number }
      ).deviceMemory;
      if (typeof deviceMemoryGB === "number" && deviceMemoryGB > 0) {
        totalMB = deviceMemoryGB * 1024;
      }
    }

    if (typeof performance !== "undefined") {
      const perfMemory = (
        performance as Performance & {
          memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
        }
      ).memory;
      if (perfMemory) {
        if (typeof perfMemory.usedJSHeapSize === "number") {
          usedMB = perfMemory.usedJSHeapSize / (1024 * 1024);
        }
        if (totalMB === null && typeof perfMemory.jsHeapSizeLimit === "number") {
          totalMB = perfMemory.jsHeapSizeLimit / (1024 * 1024);
        }
      }
    }
  } catch {
    // Ignore — callers fall back to simulated values.
  }

  return { totalMB, usedMB };
};

export function AboutFinderDialog({
  isOpen,
  onOpenChange,
}: AboutFinderDialogProps) {
  const { t } = useTranslation();
  const instances = useAppStore((state) => state.instances);
  const launchApp = useAppStore((state) => state.launchApp);
  const { isWindowsTheme, currentTheme } = useThemeFlags();
  const version = useAppStore((state) => state.ryOSVersion);
  const buildNumber = useAppStore((state) => state.ryOSBuildNumber);
  const buildTime = useAppStore((state) => state.ryOSBuildTime);
  const [versionDisplayMode, setVersionDisplayMode] = useState(0); // 0: version, 1: commit, 2: date
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  // Only offer the Mac desktop download on actual Mac browsers. This relies on
  // the shared detector so mobile devices (iPad/iPhone) are excluded too.
  const isMac = useMemo(
    () => getSupportedDesktopDownloadTarget()?.platform === "mac",
    []
  );
  const desktopDownloadUrl = useMemo(
    () =>
      desktopVersion && isMac
        ? getDesktopDownloadUrl(desktopVersion, {
            platform: "mac",
            arch: "aarch64",
          })
        : null,
    [desktopVersion, isMac]
  );

  // Fetch desktop version for download link
  useEffect(() => {
    if (!isMac) return;

    const abortController = new AbortController();
    let isActive = true;

    const loadDesktopVersion = async () => {
      try {
        const response = await abortableFetch("/version.json", {
          cache: "no-store",
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
          signal: abortController.signal,
        });
        const data = await response.json();

        if (!isActive || abortController.signal.aborted) return;
        setDesktopVersion(
          typeof data?.desktopVersion === "string" ? data.desktopVersion : null
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (!isActive || abortController.signal.aborted) return;
        setDesktopVersion(null);
      }
    };

    void loadDesktopVersion();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [isMac]);

  const isAdmin = useIsRyoAdmin();

  // Poll the real memory metrics while the dialog is open so the live JS heap
  // usage stays current. Falls back to simulated values when unavailable.
  const [realMemory, setRealMemory] = useState(() => readRealMemory());
  useEffect(() => {
    if (!isOpen) return;
    const update = () => setRealMemory(readRealMemory());
    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Total physical memory: real device RAM when available, else 32MB (retro
  // default). Kept in MB for consistent math; formatted to GB for display.
  const totalMemoryMB = realMemory.totalMB ?? 32;

  const memoryUsage = useMemo(() => {
    const apps = getNonFinderApps(isAdmin);

    // Derive open app IDs from instances
    const openAppIds = new Set<AppId>();
    Object.values(instances).forEach((instance) => {
      if (instance.isOpen) {
        openAppIds.add(instance.appId);
      }
    });

    // Get only open apps
    const openApps = apps.filter((app) => openAppIds.has(app.id as AppId));

    // Relative weights for the per-process breakdown. The browser can't report
    // per-app memory, so we keep the classic System baseline + per-app weights.
    // When the real used JS heap is known we scale these weights so the bars
    // sum to the actual measured usage; otherwise we use the legacy simulated
    // MB values directly (scale = 1).
    const systemWeight = 8.5;
    const appWeights = openApps.map((_, index) => 1.5 + index * 0.5);
    const totalWeight =
      systemWeight + appWeights.reduce((acc, w) => acc + w, 0);

    const realUsed = realMemory.usedMB;
    const scale =
      realUsed != null && totalWeight > 0 ? realUsed / totalWeight : 1;

    const entries = [
      {
        name: t("common.aboutThisMac.system"),
        memoryMB: systemWeight * scale,
      },
      ...openApps.map((app, index) => ({
        name: getTranslatedAppName(app.id),
        memoryMB: appWeights[index] * scale,
      })),
    ];

    // Bars show each process's share of the memory currently in use, so they
    // stay visible regardless of how large the real total RAM is.
    const used = entries.reduce((acc, e) => acc + e.memoryMB, 0);

    const appUsages: AppMemoryUsage[] = entries.map((e) => ({
      ...e,
      percentage: used > 0 ? (e.memoryMB / used) * 100 : 0,
    }));

    return appUsages;
  }, [instances, isAdmin, t, realMemory]);

  const totalUsedMemory = useMemo(() => {
    return memoryUsage.reduce((acc, app) => acc + app.memoryMB, 0);
  }, [memoryUsage]);

  // Format a megabyte value as GB (>= 1024MB) or MB, matching retro display.
  const formatMemorySize = (mb: number) => {
    if (mb >= 1024) {
      const gb = mb / 1024;
      const rounded = Number.isInteger(gb) ? gb : Math.round(gb * 10) / 10;
      return `${rounded}${t("common.aboutThisMac.gb")}`;
    }
    return `${Math.round(mb)}${t("common.aboutThisMac.mb")}`;
  };

  const aboutFinderSmallClass = cn(
    "about-finder-small",
    isWindowsTheme
      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
      : currentTheme === "macosx"
      ? "font-os-ui text-[13px]"
      : "text-[10px]"
  );

  const dialogContent = (
    <div
      className={cn(
        "about-finder-dialog",
        isWindowsTheme ? "p-2 px-4" : "p-4"
      )}
    >
      <div className="flex">
        {/* Right side with system info */}
        <div className="space-y-3 flex-1 ">
          <div className="flex flex-row items-center space-x-2 p-2 px-4">
            <div className="about-finder-branding flex flex-col w-1/3 items-center">
              <ThemedIcon
                name="mac-classic.png"
                alt="Happy Mac"
                className="size-10 mb-1 mr-0"
              />
              <div
                className={cn(
                  isWindowsTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[16px]"
                    : currentTheme === "macosx"
                    ? "font-apple-garamond text-2xl"
                    : "font-os-ui text-xl"
                )}
              >
                ryOS
                {currentTheme === "system7"
                  ? " 7"
                  : currentTheme === "macosx"
                  ? " X"
                  : currentTheme === "win98"
                  ? " 98"
                  : currentTheme === "xp"
                  ? " XP"
                  : ""}
              </div>
              <div
                className={cn(
                  aboutFinderSmallClass,
                  "cursor-pointer select-none transition-opacity hover:opacity-70 text-neutral-500"
                )}
                style={
                  isWindowsTheme
                    ? {
                        fontFamily:
                          '"Pixelated MS Sans Serif", "ArkPixel", Arial',
                      }
                    : undefined
                }
                onClick={() => setVersionDisplayMode((prev) => (prev + 1) % 3)}
                title={t("common.aboutThisMac.clickToToggle")}
              >
                {versionDisplayMode === 0
                  ? (version || "...")
                  : versionDisplayMode === 1
                  ? (buildNumber || "...")
                  : (buildTime ? new Date(buildTime).toLocaleDateString() : "...")
                }
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <div className={aboutFinderSmallClass}>
                <div>{t("common.aboutThisMac.builtInMemory")}: {formatMemorySize(totalMemoryMB)}</div>
                <div>{t("common.aboutThisMac.virtualMemory")}: {t("common.aboutThisMac.virtualMemoryOff")}</div>
                <div>
                  {t("common.aboutThisMac.largestUnusedBlock")}: {formatMemorySize(Math.max(totalMemoryMB - totalUsedMemory, 0))}
                </div>
              </div>
              <div
                className={cn(
                  "text-neutral-500",
                  isWindowsTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                    : currentTheme === "macosx"
                    ? "font-os-ui text-[11px]"
                    : "font-os-ui text-[10px]"
                )}
                style={
                  isWindowsTheme
                    ? {
                        fontFamily:
                          '"Pixelated MS Sans Serif", "ArkPixel", Arial',
                      }
                    : undefined
                }
              >
                <p>© Ryo Lu. 1992-{new Date().getFullYear()}</p>
                <p>
                  {isMac && desktopDownloadUrl && (
                    <>
                      <a
                        href={desktopDownloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-os-link hover:underline"
                      >
                        {t("apps.control-panels.downloadMacApp")}
                      </a>
                      {" · "}
                    </>
                  )}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      launchApp("internet-explorer", {
                        url: "os.ryo.lu/docs/changelog",
                        year: "current",
                      });
                      onOpenChange(false);
                    }}
                    className="text-os-link hover:underline"
                  >
                    {t("common.aboutThisMac.viewChangelog")}
                  </a>
                  {" · "}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      launchApp("internet-explorer", {
                        url: `${getDocsBaseUrl()}/privacy`,
                        year: "current",
                      });
                      onOpenChange(false);
                    }}
                    className="text-os-link hover:underline"
                  >
                    {t("common.aboutThisMac.privacyPolicy")}
                  </a>
                  {" · "}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      launchApp("internet-explorer", {
                        url: `${getDocsBaseUrl()}/terms`,
                        year: "current",
                      });
                      onOpenChange(false);
                    }}
                    className="text-os-link hover:underline"
                  >
                    {t("common.aboutThisMac.termsOfService")}
                  </a>
                </p>
              </div>
            </div>
          </div>
          <hr
            // Theme-aware divider so dark mode lifts the rule to a faint
            // white-on-dark hairline instead of the bright neutral-300 stripe.
            style={{ borderTopColor: "var(--os-color-separator)" }}
          />

          {/* Memory usage bars */}
          <div className={cn("space-y-2 p-2 px-4 pb-4", aboutFinderSmallClass)}>
            {memoryUsage.map((app) => (
              <div className="flex flex-row items-center gap-3" key={app.name}>
                <div className="flex justify-between w-full gap-2">
                  <div className="flex-1 min-w-0 truncate">{app.name}</div>
                  <div className="shrink-0 whitespace-nowrap text-right">{app.memoryMB.toFixed(1)} {t("common.aboutThisMac.mb")}</div>
                </div>
                <div
                  className={cn(
                    "h-2 w-full",
                    currentTheme === "macosx" ? "aqua-progress" : "bg-neutral-200"
                  )}
                >
                  <div
                    className={cn(
                      "h-full transition-all duration-200",
                      currentTheme === "macosx"
                        ? "aqua-progress-fill"
                        : "bg-blue-500"
                    )}
                    style={{ width: `${app.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[400px]", isWindowsTheme && "p-0 overflow-hidden")}
        style={isWindowsTheme ? { fontSize: "11px" } : undefined}
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">
              {t("common.aboutThisMac.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("common.aboutThisMac.description")}
            </DialogDescription>
            <DialogHeader>{t("common.aboutThisMac.title")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogTitle className="sr-only">
              {t("common.aboutThisMac.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("common.aboutThisMac.description")}
            </DialogDescription>
            <DialogHeader>{t("common.aboutThisMac.title")}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("common.aboutThisMac.title")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("common.aboutThisMac.description")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
