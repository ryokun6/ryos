import { useState, useEffect, useRef, useMemo } from "react";
import { AppleMenu } from "./AppleMenu";
import { useAppContext } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { StartMenu } from "./StartMenu";
import { useAppStoreShallow } from "@/stores/helpers";
import { Slider } from "@/components/ui/slider";
import { Volume1, Volume2, VolumeX, Settings, ChevronUp } from "lucide-react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeStore } from "@/stores/useThemeStore";
import { getAppIconPath, appRegistry } from "@/config/appRegistry";
import { ThemedIcon } from "@/components/shared/ThemedIcon";

// Helper function to get app name
const getAppName = (appId: string): string => {
  const app = appRegistry[appId as keyof typeof appRegistry];
  return app?.name || appId;
};

const finderHelpItems = [
  {
    icon: "🔍",
    title: "Browse Files",
    description: "Navigate through your files and folders",
  },
  {
    icon: "📁",
    title: "Create Folders",
    description: "Organize your files with new folders",
  },
  {
    icon: "🗑️",
    title: "Delete Files",
    description: "Remove unwanted files and folders",
  },
];

const finderMetadata = {
  name: "Finder",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/mac.png",
};

interface MenuBarProps {
  children?: React.ReactNode;
  inWindowFrame?: boolean; // Add prop to indicate if MenuBar is inside a window
}

function Clock() {
  const [time, setTime] = useState(new Date());
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    // Initial check
    handleResize();

    // Add resize event listener
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Format the display based on theme and viewport width
  let displayTime;

  if (isXpTheme) {
    // For XP/98 themes: time with AM/PM (e.g., "1:34 AM")
    displayTime = time.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } else if (viewportWidth < 420) {
    // For small screens: just time without AM/PM (e.g., "1:34")
    const timeString = time.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    displayTime = timeString.replace(/\s?(AM|PM)$/i, "");
  } else if (viewportWidth >= 420 && viewportWidth <= 768) {
    // For medium screens: time with AM/PM (e.g., "1:00 AM")
    displayTime = time.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } else {
    // For larger screens (> 768px): full date and time (e.g., "Wed May 7 1:34 AM")
    const shortWeekday = time.toLocaleDateString([], { weekday: "short" });
    const month = time.toLocaleDateString([], { month: "short" });
    const day = time.getDate();
    const timeString = time.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    displayTime = `${shortWeekday} ${month} ${day} ${timeString}`;
  }

  return (
    <div
      className={isXpTheme ? "" : "ml-auto mr-2"}
      style={{
        textShadow:
          currentTheme === "macosx"
            ? "0 2px 3px rgba(0, 0, 0, 0.25)"
            : undefined,
      }}
    >
      {displayTime}
    </div>
  );
}

function DefaultMenuItems() {
  const launchApp = useLaunchApp();
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  const handleLaunchFinder = (path: string) => {
    launchApp("finder", { initialPath: path });
  };

  return (
    <>
      {/* File Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-black/10 active:bg-black/20 focus-visible:ring-0"
            style={{ color: "inherit" }}
          >
            File
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => handleLaunchFinder("/")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            New Finder Window
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            New Folder
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Move to Trash
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Empty Trash...
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            Close
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-black/10 active:bg-black/20 focus-visible:ring-0"
            style={{ color: "inherit" }}
          >
            Edit
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Undo
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Cut
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Copy
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Paste
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Clear
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Select All
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* View Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-black/10 active:bg-black/20 focus-visible:ring-0"
            style={{ color: "inherit" }}
          >
            View
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            <span className="pl-4">by Small Icon</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            <span>✓ by Icon</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            <span className="pl-4">by List</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            <span>✓ by Name</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            <span className="pl-4">by Date</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            <span className="pl-4">by Size</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-md h-6 px-3 active:bg-gray-900 active:text-white">
            <span className="pl-4">by Kind</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Go Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-black/10 active:bg-black/20 focus-visible:ring-0"
            style={{ color: "inherit" }}
          >
            Go
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Forward
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => handleLaunchFinder("/Applications")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
          >
            <ThemedIcon
              name="applications.png"
              alt="Applications"
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            Applications
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleLaunchFinder("/Documents")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
          >
            <ThemedIcon
              name="documents.png"
              alt="Documents"
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            Documents
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleLaunchFinder("/Images")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
          >
            <ThemedIcon
              name="images.png"
              alt="Images"
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            Images
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleLaunchFinder("/Music")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
          >
            <ThemedIcon
              name="sounds.png"
              alt="Music"
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            Music
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleLaunchFinder("/Sites")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
          >
            <ThemedIcon
              name="sites.png"
              alt="Sites"
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            Sites
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleLaunchFinder("/Videos")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
          >
            <ThemedIcon
              name="movies.png"
              alt="Videos"
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            Videos
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleLaunchFinder("/Trash")}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
          >
            <ThemedIcon
              name="trash-empty.png"
              alt="Trash"
              className="w-4 h-4 [image-rendering:pixelated]"
            />
            Trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Help Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="default"
            className="h-6 text-md px-2 py-1 border-none hover:bg-black/10 active:bg-black/20 focus-visible:ring-0"
            style={{ color: "inherit" }}
          >
            Help
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={1} className="px-0">
          <DropdownMenuItem
            onClick={() => setIsHelpDialogOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            Finder Help
          </DropdownMenuItem>
          <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
          <DropdownMenuItem
            onClick={() => setIsAboutDialogOpen(true)}
            className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
          >
            About Finder
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appName="Finder"
        helpItems={finderHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={finderMetadata}
      />
    </>
  );
}

function VolumeControl() {
  const { masterVolume, setMasterVolume } = useAppStoreShallow((s) => ({
    masterVolume: s.masterVolume,
    setMasterVolume: s.setMasterVolume,
  }));
  const { play: playVolumeChangeSound } = useSound(Sounds.VOLUME_CHANGE);
  const launchApp = useLaunchApp();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const getVolumeIcon = () => {
    if (masterVolume === 0) {
      return <VolumeX className="h-5 w-5" />;
    }
    if (masterVolume < 0.5) {
      return <Volume1 className="h-5 w-5" />;
    }
    return <Volume2 className="h-5 w-5" />;
  };

  return (
    <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-7 text-md px-1 py-1 border-none focus-visible:ring-0 ${
            isXpTheme
              ? "hover:bg-white/20 active:bg-white/30"
              : "hover:bg-black/10 active:bg-black/20"
          } ${isXpTheme ? "" : "mr-2"}`}
          style={{
            color:
              isXpTheme && currentTheme === "win98" ? "#000000" : "inherit",
          }}
        >
          {getVolumeIcon()}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="center"
        side={isXpTheme ? "top" : "bottom"}
        sideOffset={isXpTheme ? 8 : 1}
        className="p-2 pt-4 w-auto min-w-4 h-40 flex flex-col items-center justify-center"
        style={{ minWidth: "auto" }}
      >
        <Slider
          orientation="vertical"
          min={0}
          max={1}
          step={0.05}
          value={[masterVolume]}
          onValueChange={(v) => setMasterVolume(v[0])}
          onValueCommit={playVolumeChangeSound}
        />
        <Button
          variant="ghost"
          size="icon"
          className="mt-2 h-6 w-6 text-md border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
          onClick={() => {
            launchApp("control-panels", {
              initialData: { defaultTab: "sound" },
            });
            setIsDropdownOpen(false);
          }}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MenuBar({ children, inWindowFrame = false }: MenuBarProps) {
  const { apps } = useAppContext();
  const {
    getForegroundInstance,
    instances,

    bringInstanceToForeground,
    toggleMinimizeInstance,
    foregroundInstanceId, // Add this to get the foreground instance ID
  } = useAppStoreShallow((s) => ({
    getForegroundInstance: s.getForegroundInstance,
    instances: s.instances,

    bringInstanceToForeground: s.bringInstanceToForeground,
    toggleMinimizeInstance: s.toggleMinimizeInstance,
    foregroundInstanceId: s.foregroundInstanceId, // Add this
  }));

  const foregroundInstance = getForegroundInstance();
  const hasActiveApp = !!foregroundInstance;

  // Get current theme
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  // Taskbar overflow handling (used for XP taskbar rendering)
  const runningAreaRef = useRef<HTMLDivElement>(null);
  const [visibleTaskbarIds, setVisibleTaskbarIds] = useState<string[]>([]);
  const [overflowTaskbarIds, setOverflowTaskbarIds] = useState<string[]>([]);

  const allTaskbarIds = useMemo(() => {
    return Object.values(instances)
      .filter((i) => i.isOpen)
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
      .map((i) => i.instanceId);
  }, [instances]);

  useEffect(() => {
    // Only calculate overflow for XP taskbar (not in window frames)
    if (!(isXpTheme && !inWindowFrame)) {
      setVisibleTaskbarIds([]);
      setOverflowTaskbarIds([]);
      return;
    }

    const container = runningAreaRef.current;
    if (!container) return;

    const MIN_WIDTH = 110; // minimum shrink width to preserve readability
    const GAP = 2; // right margin
    const BUTTON_TOTAL_MIN = MIN_WIDTH + GAP;
    const MORE_BTN_WIDTH = 40; // task-like overflow button total width

    const compute = () => {
      const containerWidth = container.clientWidth;
      const countWithoutMore = Math.max(
        0,
        Math.floor(containerWidth / BUTTON_TOTAL_MIN)
      );
      if (allTaskbarIds.length <= countWithoutMore) {
        setVisibleTaskbarIds(allTaskbarIds);
        setOverflowTaskbarIds([]);
        return;
      }
      const countWithMore = Math.max(
        1,
        Math.floor((containerWidth - MORE_BTN_WIDTH) / BUTTON_TOTAL_MIN)
      );
      setVisibleTaskbarIds(allTaskbarIds.slice(0, countWithMore));
      setOverflowTaskbarIds(allTaskbarIds.slice(countWithMore));
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(container);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [isXpTheme, inWindowFrame, allTaskbarIds]);

  // If inside window frame for XP/98, use plain style
  if (inWindowFrame && isXpTheme) {
    return (
      <div
        className="flex items-center h-7 px-1"
        style={{
          fontFamily: isXpTheme ? "var(--font-ms-sans)" : "var(--os-font-ui)",
          fontSize: "11px",
        }}
      >
        {children}
      </div>
    );
  }

  // For XP/98 themes, render taskbar at bottom instead of top menubar
  if (isXpTheme && !inWindowFrame) {
    const taskbarBackground =
      currentTheme === "xp"
        ? "linear-gradient(0deg, #042b8e 0%, #0551f6 6%, #0453ff 51%, #0551f6 63%, #0551f6 81%, #3a8be8 90%, #0453ff 100%)"
        : "#c0c0c0";
    return (
      <div
        className="fixed bottom-0 left-0 right-0 px-0 z-50"
        style={{
          background: taskbarBackground,
          fontFamily: "var(--font-ms-sans)",
          fontSize: "11px",
          color: currentTheme === "xp" ? "#ffffff" : "#000000",
          userSelect: "none",
          width: "100vw",
          height: "calc(30px + env(safe-area-inset-bottom, 0px))",
          position: "fixed",
        }}
      >
        <div
          className="absolute left-0 right-0 flex items-center h-[30px]"
          style={{
            bottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          {/* Start Button */}
          <div className="flex items-center h-full">
            <StartMenu apps={apps} />
          </div>

          {/* Running Apps Area */}
          <div
            ref={runningAreaRef}
            className="flex-1 flex items-center gap-0.5 px-2 overflow-hidden h-full"
          >
            {(() => {
              const idsToRender =
                visibleTaskbarIds.length > 0 || overflowTaskbarIds.length > 0
                  ? visibleTaskbarIds
                  : allTaskbarIds;
              if (idsToRender.length === 0) return null;
              return idsToRender.map((instanceId) => {
                const instance = instances[instanceId];
                if (!instance || !instance.isOpen) return null;

                const isForeground = instanceId === foregroundInstanceId;
                const appIconPath = getAppIconPath(instance.appId);

                return (
                  <button
                    key={instanceId}
                    className="px-2 gap-1 border-t border-y rounded-sm flex items-center justify-start"
                    onClick={() => {
                      // XP/98 behavior: clicking the active taskbar button toggles minimize
                      if (instanceId === foregroundInstanceId) {
                        toggleMinimizeInstance(instanceId);
                      } else {
                        bringInstanceToForeground(instanceId);
                      }
                    }}
                    style={{
                      height: "85%",
                      flex: "0 1 160px",
                      minWidth: "110px",
                      marginTop: "2px",
                      marginRight: "2px",
                      background: isForeground
                        ? currentTheme === "xp"
                          ? "#3980f4"
                          : "#c0c0c0"
                        : currentTheme === "xp"
                        ? "#1658dd"
                        : "#c0c0c0",
                      border:
                        currentTheme === "xp"
                          ? isForeground
                            ? "1px solid #255be1"
                            : "1px solid #255be1"
                          : "none",
                      color: currentTheme === "xp" ? "#ffffff" : "#000000",
                      fontSize: "11px",
                      boxShadow:
                        currentTheme === "xp"
                          ? "2px 2px 5px rgba(255, 255, 255, 0.267) inset"
                          : isForeground
                          ? "inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px grey"
                          : "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf",
                      transition: "all 0.1s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (currentTheme === "xp") {
                        if (isForeground) {
                          e.currentTarget.style.background = "#4a92f9";
                          e.currentTarget.style.borderColor = "#2c64e3";
                        } else {
                          e.currentTarget.style.background = "#2a6ef1";
                          e.currentTarget.style.borderColor = "#1e56c9";
                        }
                      } else if (currentTheme === "win98" && !isForeground) {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentTheme === "xp") {
                        if (isForeground) {
                          e.currentTarget.style.background = "#3980f4";
                          e.currentTarget.style.borderColor = "#255be1";
                        } else {
                          e.currentTarget.style.background = "#1658dd";
                          e.currentTarget.style.borderColor = "#255be1";
                        }
                      } else if (currentTheme === "win98" && !isForeground) {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                  >
                    <ThemedIcon
                      name={appIconPath}
                      alt=""
                      className="w-4 h-4 flex-shrink-0 [image-rendering:pixelated]"
                    />
                    <span className="truncate text-xs">
                      {instance.title || getAppName(instance.appId)}
                    </span>
                  </button>
                );
              });
            })()}

            {/* Overflow menu button */}
            {overflowTaskbarIds.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="px-1 border-t border-y rounded-sm flex items-center justify-center"
                    style={{
                      height: "85%",
                      width: "36px",
                      marginTop: "2px",
                      marginRight: "2px",
                      background: currentTheme === "xp" ? "#1658dd" : "#c0c0c0",
                      border:
                        currentTheme === "xp" ? "1px solid #255be1" : "none",
                      color: currentTheme === "xp" ? "#ffffff" : "#000000",
                      fontSize: "11px",
                      boxShadow:
                        currentTheme === "xp"
                          ? "2px 2px 5px rgba(255, 255, 255, 0.267) inset"
                          : "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf",
                      transition: "all 0.1s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (currentTheme === "xp") {
                        e.currentTarget.style.background = "#2a6ef1";
                        e.currentTarget.style.borderColor = "#1e56c9";
                      } else if (currentTheme === "win98") {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                    onMouseDown={(e) => {
                      if (currentTheme === "xp") {
                        e.currentTarget.style.background = "#4a92f9";
                        e.currentTarget.style.borderColor = "#2c64e3";
                      } else if (currentTheme === "win98") {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px grey";
                      }
                    }}
                    onMouseUp={(e) => {
                      if (currentTheme === "xp") {
                        // return to hover shade; mouseleave will handle base
                        e.currentTarget.style.background = "#2a6ef1";
                        e.currentTarget.style.borderColor = "#1e56c9";
                      } else if (currentTheme === "win98") {
                        // return to raised hover state
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentTheme === "xp") {
                        e.currentTarget.style.background = "#1658dd";
                        e.currentTarget.style.borderColor = "#255be1";
                      } else if (currentTheme === "win98") {
                        e.currentTarget.style.boxShadow =
                          "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
                      }
                    }}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  side={isXpTheme ? "top" : "bottom"}
                  sideOffset={4}
                  className="px-0"
                >
                  {overflowTaskbarIds.map((instanceId) => {
                    const instance = instances[instanceId];
                    if (!instance || !instance.isOpen) return null;
                    const appIconPath = getAppIconPath(instance.appId);
                    return (
                      <DropdownMenuItem
                        key={instanceId}
                        onClick={() => bringInstanceToForeground(instanceId)}
                        className="text-md h-6 px-3 active:bg-gray-900 active:text-white flex items-center gap-2"
                      >
                        <ThemedIcon
                          name={appIconPath}
                          alt=""
                          className="w-4 h-4 [image-rendering:pixelated]"
                        />
                        <span className="truncate text-xs">
                          {instance.title || getAppName(instance.appId)}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* System Tray */}
          <div
            className="flex items-center gap-1 px-2 text-white border box-border flex items-center justify-end text-sm"
            style={{
              height: currentTheme === "win98" ? "85%" : "100%",
              marginTop: currentTheme === "win98" ? "2px" : "0px",
              marginRight: currentTheme === "win98" ? "4px" : "0px",
              background:
                currentTheme === "xp"
                  ? "linear-gradient(0deg, #0a5bc6 0%, #1198e9 6%, #1198e9 51%, #1198e9 63%, #1198e9 77%, #19b9f3 85%, #19b9f3 93%, #075dca 97%)"
                  : "#c0c0c0", // Flat gray for Windows 98
              boxShadow:
                currentTheme === "xp"
                  ? "2px -0px 3px #20e2fc inset"
                  : "inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px grey", // Windows 98 inset
              borderTop:
                currentTheme === "xp" ? "1px solid #075dca" : "transparent",
              borderBottom:
                currentTheme === "xp" ? "1px solid #0a5bc6" : "transparent",
              borderRight:
                currentTheme === "xp" ? "transparent" : "transparent",
              borderLeft:
                currentTheme === "xp" ? "1px solid #000000" : "transparent",
              paddingTop: currentTheme === "xp" ? "1px" : "0px",
            }}
          >
            <div className="hidden sm:flex">
              <VolumeControl />
            </div>
            <div
              className={`text-xs ${isXpTheme ? "font-bold" : "font-normal"} ${
                isXpTheme ? "" : "px-2"
              }`}
              style={{
                color:
                  currentTheme === "win98"
                    ? "#000000"
                    : isXpTheme
                    ? "#ffffff"
                    : "#000000",
                textShadow:
                  currentTheme === "xp"
                    ? "1px 1px 1px rgba(0,0,0,0.5)"
                    : currentTheme === "win98"
                    ? "none"
                    : currentTheme === "macosx"
                    ? "0 2px 3px rgba(0, 0, 0, 0.25)"
                    : "none",
              }}
            >
              <Clock />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Default Mac-style top menubar
  return (
    <div
      className="fixed top-0 left-0 right-0 flex border-b-[length:var(--os-metrics-border-width)] border-os-menubar px-2 h-os-menubar items-center font-os-ui"
      style={{
        background:
          currentTheme === "macosx"
            ? "rgba(248, 248, 248, 0.85)"
            : "var(--os-color-menubar-bg)",
        backgroundImage:
          currentTheme === "macosx" ? "var(--os-pinstripe-menubar)" : undefined,
        backdropFilter: currentTheme === "macosx" ? "blur(20px)" : undefined,
        WebkitBackdropFilter:
          currentTheme === "macosx" ? "blur(20px)" : undefined,
        boxShadow:
          currentTheme === "macosx"
            ? "0 2px 8px rgba(0, 0, 0, 0.15)"
            : undefined,
        fontFamily: "var(--os-font-ui)",
        color: "var(--os-color-menubar-text)",
      }}
    >
      <AppleMenu apps={apps} />
      {hasActiveApp ? children : <DefaultMenuItems />}
      <div className="ml-auto flex items-center">
        <div className="hidden sm:flex">
          <VolumeControl />
        </div>
        <Clock />
      </div>
    </div>
  );
}
