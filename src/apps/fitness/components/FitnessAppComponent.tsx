import { useRef, useState } from "react";
import type { AppProps, FitnessInitialData } from "@/apps/base/types";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { cn } from "@/lib/utils";
import { appMetadata } from "../metadata";
import { useFitnessLogic } from "../hooks/useFitnessLogic";
import { FitnessBodyView } from "./FitnessBodyView";
import { FitnessExercisesView } from "./FitnessExercisesView";
import { FitnessFoodView } from "./FitnessFoodView";
import { FitnessMenuBar } from "./FitnessMenuBar";
import { FitnessScheduleView } from "./FitnessScheduleView";
import { FitnessToolbar } from "./FitnessToolbar";
import { FitnessSheetContext } from "./FitnessUi";
import { FitnessWorkoutsView } from "./FitnessWorkoutsView";

const MOBILE_BREAKPOINT = 600;

export function FitnessAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  initialData,
}: AppProps<FitnessInitialData>) {
  const l = useFitnessLogic({ initialData });
  const { t, isWindowsTheme, isMacOSTheme, isSystem7Theme, view } = l;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(860);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetHost, setSheetHost] = useState<HTMLDivElement | null>(null);
  useResizeObserverWithRef(containerRef, (entry) => setContainerWidth(entry.contentRect.width));
  const isMobileLayout = containerWidth < MOBILE_BREAKPOINT;
  const sheetVisible = sheetOpen;

  const menuBar = <FitnessMenuBar l={l} onClose={onClose} />;
  const viewProps = { l, isMobileLayout };

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: t("apps.fitness.title"),
        onClose,
        isForeground,
        appId: "fitness",
        material: isMacOSTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
        drawer: (
          <AppDrawer isOpen={sheetVisible}>
            <div
              ref={setSheetHost}
              inert={!sheetVisible}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto text-black dark:text-white"
            />
          </AppDrawer>
        ),
      }}
    >
      <div
        ref={containerRef}
        className={cn(
          "relative flex size-full flex-col overflow-hidden font-os-ui",
          isMacOSTheme ? "bg-transparent" : isSystem7Theme ? "bg-white" : "bg-os-window-bg"
        )}
      >
        <FitnessToolbar
          l={l}
          isMobileLayout={isMobileLayout}
          sheetOpen={sheetVisible}
          onToggleSheet={() => setSheetOpen((open) => !open)}
        />
        <AppSidebarPanel
          bordered={isMacOSTheme}
          className={cn("flex min-h-0 flex-1 flex-col text-black dark:text-white", isMacOSTheme && "mx-[5px] mb-[5px]")}
        >
          <FitnessSheetContext.Provider value={sheetHost}>
            {view === "exercises" ? (
              <FitnessExercisesView {...viewProps} />
            ) : view === "workouts" ? (
              <FitnessWorkoutsView {...viewProps} />
            ) : view === "body" ? (
              <FitnessBodyView {...viewProps} />
            ) : view === "food" ? (
              <FitnessFoodView {...viewProps} />
            ) : (
              <FitnessScheduleView {...viewProps} />
            )}
          </FitnessSheetContext.Provider>
        </AppSidebarPanel>
      </div>
      <AppHelpAboutDialogs
        appId="fitness"
        helpItems={l.translatedHelpItems}
        metadata={appMetadata}
        isHelpOpen={l.isHelpDialogOpen}
        onHelpOpenChange={l.setIsHelpDialogOpen}
        isAboutOpen={l.isAboutDialogOpen}
        onAboutOpenChange={l.setIsAboutDialogOpen}
      />
    </AppWindowShell>
  );
}
