import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getNonFinderApps } from "@/config/appRegistry";
import { useAppContext } from "@/contexts/AppContext";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { BUILD_VERSION, BUILD_TIME, COMMIT_SHA_SHORT } from "@/config/buildVersion";

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
  const { appStates } = useAppContext();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const [versionDisplayMode, setVersionDisplayMode] = useState(0); // 0: version, 1: commit, 2: date

  const memoryUsage = useMemo(() => {
    const totalMemory = 32; // 32MB total memory
    const systemUsage = 8.5; // System takes about 8.5MB
    const apps = getNonFinderApps();

    // Get only open apps
    const openApps = apps.filter((app) => appStates[app.id]?.isOpen);

    // Calculate memory usage for system and open apps (limited to 4)
    const appUsages: AppMemoryUsage[] = [
      {
        name: "System",
        memoryMB: systemUsage,
        percentage: (systemUsage / totalMemory) * 100,
      },
      ...openApps.map((app, index) => {
        const memory = 1.5 + index * 0.5; // Simulate different memory usage per app
        return {
          name: app.name,
          memoryMB: memory,
          percentage: (memory / totalMemory) * 100,
        };
      }),
    ];

    return appUsages;
  }, [appStates]);

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
                title="Click to toggle"
              >
                {versionDisplayMode === 0
                  ? BUILD_VERSION
                  : versionDisplayMode === 1
                  ? COMMIT_SHA_SHORT
                  : new Date(BUILD_TIME).toLocaleDateString()
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
                  ? '"Pixelated MS Sans Serif", Arial'
                  : undefined,
                fontSize: isXpTheme ? "10px" : undefined,
              }}
            >
              <div>
                <div>Built-in Memory: 32MB</div>
                <div>Virtual Memory: Off</div>
                <div>
                  Largest Unused Block: {(32 - totalUsedMemory).toFixed(1)}MB
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
                      ? '"Pixelated MS Sans Serif", Arial'
                      : undefined,
                  }}
                >
                  © Ryo Lu. 1992-{new Date().getFullYear()}
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
                ? '"Pixelated MS Sans Serif", Arial'
                : undefined,
              fontSize: isXpTheme ? "10px" : undefined,
            }}
          >
            {memoryUsage.map((app, index) => (
              <div className="flex flex-row items-center gap-1" key={index}>
                <div className="flex justify-between w-full">
                  <div className="w-1/2 truncate">{app.name}</div>
                  <div className="w-1/3">{app.memoryMB.toFixed(1)} MB</div>
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
            <DialogHeader>About This Computer</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>About This Computer</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                About This Computer
              </DialogTitle>
              <DialogDescription className="sr-only">
                Information about ryOS on this computer
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
