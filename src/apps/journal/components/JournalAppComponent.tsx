import { useRef, useState } from "react";
import type { AppProps } from "@/apps/base/types";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { cn } from "@/lib/utils";
import { appMetadata } from "../metadata";
import { useJournalLogic } from "../hooks/useJournalLogic";
import { CompareView } from "./CompareView";
import { FreeformCanvas } from "./FreeformCanvas";
import { GeneratedView } from "./GeneratedView";
import { JournalDrawer } from "./JournalDrawer";
import { JournalMenuBar } from "./JournalMenuBar";
import { JournalToolbar } from "./JournalToolbar";

const MOBILE_BREAKPOINT = 760;

export function JournalAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const l = useJournalLogic();
  const { t, isWindowsTheme, isMacOSTheme, isSystem7Theme, journal } = l;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(1120);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useResizeObserverWithRef(containerRef, (entry) => {
    setContainerWidth(entry.contentRect.width);
  });
  const isMobileLayout = containerWidth < MOBILE_BREAKPOINT;
  const menuBar = <JournalMenuBar l={l} onClose={onClose} />;

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: t("apps.journal.title"),
        onClose,
        isForeground,
        appId: "journal",
        skipInitialSound,
        instanceId,
        drawer: (
          <JournalDrawer
            l={l}
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
          />
        ),
      }}
    >
      <div
        ref={containerRef}
        className={cn(
          "flex size-full flex-col overflow-hidden font-os-ui text-os-text-primary",
          isMacOSTheme ? "bg-transparent" : isSystem7Theme ? "bg-white" : "bg-os-window-bg"
        )}
      >
        <JournalToolbar
          l={l}
          isMobileLayout={isMobileLayout}
          drawerOpen={drawerOpen}
          onToggleDrawer={() => setDrawerOpen((open) => !open)}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          {journal.view === "compare" ? (
            <CompareView l={l} isMobileLayout={isMobileLayout} />
          ) : journal.view === "freeform" ? (
            <FreeformCanvas
              positions={journal.positions}
              texts={journal.texts}
              interactive
              onMove={l.api.moveFragment}
            />
          ) : (
            <GeneratedView l={l} isMobileLayout={isMobileLayout} />
          )}
        </div>
      </div>
      <AppHelpAboutDialogs
        appId="journal"
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
