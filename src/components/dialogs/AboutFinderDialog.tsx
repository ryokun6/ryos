import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import { getNonFinderApps } from "@/config/appRegistry";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { cn } from "@/lib/utils";
import { useMemo, useState, useEffect } from "react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { getTranslatedAppName } from "@/utils/i18n";
import type { AppId } from "@/config/appRegistry";
import { abortableFetch } from "@/utils/abortableFetch";

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
  const currentTheme = useThemeStore((state) => state.current);
  const version = useAppStore((state) => state.ryOSVersion);
  const buildNumber = useAppStore((state) => state.ryOSBuildNumber);
  const buildTime = useAppStore((state) => state.ryOSBuildTime);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98" || currentTheme === "win7";
  const [versionDisplayMode, setVersionDisplayMode] = useState(0); // 0: version, 1: commit, 2: date
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const isMac = useMemo(() => 
    typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'), 
    []
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
          typeof data?.desktopVersion === "string" ? data.desktopVersion : "1.0.1"
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (!isActive || abortController.signal.aborted) return;
        setDesktopVersion("1.0.1"); // fallback
      }
    };

    void loadDesktopVersion();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [isMac]);

  // Get current username for admin check
  const username = useChatsStore((state) => state.username);
  const isAdmin = username?.toLowerCase() === "ryo";

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

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-4"}>
      <div className="flex">
        {/* Right side with system info */}
        <div className="space-y-3 flex-1 ">
          <div className="flex flex-row items-center space-x-2 p-2 px-4">
            <div className="flex flex-col w-1/3 items-center">
              <ThemedIcon
                name="mac-classic.png"
                alt="Happy Mac"
                className="w-10 h-10 mb-1 mr-0"
              />
              <div
                className={cn(
                  isXpTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[16px]"
                    : "font-apple-garamond text-2xl "
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
                  "cursor-pointer select-none transition-opacity hover:opacity-70 text-gray-500",
                  isXpTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                    : "font-geneva-12 text-[10px]"
                )}
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

            <div
              className={cn(
                "space-y-4",
                isXpTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                  : "font-geneva-12 text-[10px]"
              )}
              style={{
                fontFamily: isXpTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isXpTheme ? "10px" : undefined,
              }}
            >
              <div>
                <div>{t("common.aboutThisMac.builtInMemory")}: 32{t("common.aboutThisMac.mb")}</div>
                <div>{t("common.aboutThisMac.virtualMemory")}: {t("common.aboutThisMac.virtualMemoryOff")}</div>
                <div>
                  {t("common.aboutThisMac.largestUnusedBlock")}: {(32 - totalUsedMemory).toFixed(1)}{t("common.aboutThisMac.mb")}
                </div>
                <div
                  className={cn(
                    "text-[10px] text-gray-500 mt-2",
                    isXpTheme
                      ? "font-['Pixelated_MS_Sans_Serif',Arial]"
                      : "font-geneva-12"
                  )}
                  style={{
                    fontFamily: isXpTheme
                      ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                      : undefined,
                  }}
                >
                  <p>© Ryo Lu. 1992-{new Date().getFullYear()}</p>
                  {isMac && desktopVersion && (
                    <p>
                      <a 
                        href={`https://github.com/ryokun6/ryos/releases/download/v${desktopVersion}/ryOS_${desktopVersion}_aarch64.dmg`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {t("apps.control-panels.downloadMacApp")}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          <hr className="border-gray-300" />

          {/* Memory usage bars */}
          <div
            className={cn(
              "space-y-2 p-2 px-4 pb-4",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                : "font-geneva-12 text-[10px]"
            )}
            style={{
              fontFamily: isXpTheme
                      ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "10px" : undefined,
            }}
          >
            {memoryUsage.map((app, index) => (
              <div className="flex flex-row items-center gap-1" key={index}>
                <div className="flex justify-between w-full">
                  <div className="w-1/2 truncate">{app.name}</div>
                  <div className="w-1/3">{app.memoryMB.toFixed(1)} {t("common.aboutThisMac.mb")}</div>
                </div>
                <div
                  className={cn(
                    "h-2 w-full",
                    currentTheme === "macosx" ? "aqua-progress" : "bg-gray-200"
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
        className={cn("max-w-[400px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
      >
        {isXpTheme ? (
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
