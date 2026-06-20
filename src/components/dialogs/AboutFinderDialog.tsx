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

  const memoryUsage = useMemo(() => {
    const totalMemory = 32; // 32MB total memory
    const systemUsage = 8.5; // System takes about 8.5MB
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

    // Calculate memory usage for system and open apps (limited to 4)
    const appUsages: AppMemoryUsage[] = [
      {
        name: t("common.aboutThisMac.system"),
        memoryMB: systemUsage,
        percentage: (systemUsage / totalMemory) * 100,
      },
      ...openApps.map((app, index) => {
        const memory = 1.5 + index * 0.5; // Simulate different memory usage per app
        return {
          name: getTranslatedAppName(app.id),
          memoryMB: memory,
          percentage: (memory / totalMemory) * 100,
        };
      }),
    ];

    return appUsages;
  }, [instances, isAdmin, t]);

  const totalUsedMemory = useMemo(() => {
    return memoryUsage.reduce((acc, app) => acc + app.memoryMB, 0);
  }, [memoryUsage]);

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
                <div>{t("common.aboutThisMac.builtInMemory")}: 32{t("common.aboutThisMac.mb")}</div>
                <div>{t("common.aboutThisMac.virtualMemory")}: {t("common.aboutThisMac.virtualMemoryOff")}</div>
                <div>
                  {t("common.aboutThisMac.largestUnusedBlock")}: {(32 - totalUsedMemory).toFixed(1)}{t("common.aboutThisMac.mb")}
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
              <div className="flex flex-row items-center gap-1" key={app.name}>
                <div className="flex justify-between w-full">
                  <div className="w-1/2 truncate">{app.name}</div>
                  <div className="w-1/3">{app.memoryMB.toFixed(1)} {t("common.aboutThisMac.mb")}</div>
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
            <DialogHeader>{t("common.aboutThisMac.title")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
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
