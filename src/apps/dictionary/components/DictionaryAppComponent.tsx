import { useEffect, useRef, useState } from "react";
import type { AppProps, DictionaryInitialData } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { cn } from "@/lib/utils";
import { appMetadata } from "../metadata";
import { useDictionaryLogic } from "../hooks/useDictionaryLogic";
import { SRS_GRADES } from "../utils/srs";
import { DictionaryFlashcardsView } from "./DictionaryFlashcardsView";
import { DictionaryHandwritingPad } from "./DictionaryHandwritingPad";
import { DictionaryFavoritesPanel, DictionaryLookupPanel } from "./DictionaryMainPanels";
import { DictionaryMenuBar } from "./DictionaryMenuBar";
import { DictionarySidebar } from "./DictionarySidebar";
import { DictionaryToolbar } from "./DictionaryToolbar";

const MOBILE_BREAKPOINT = 560;

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function DictionaryAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  initialData,
}: AppProps<DictionaryInitialData>) {
  const l = useDictionaryLogic({ initialData });
  const { t, isWindowsTheme, isMacOSTheme, isSystem7Theme, view } = l;
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(860);
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(null);

  useResizeObserverWithRef(containerRef, (entry) => {
    setContainerWidth(entry.contentRect.width);
  });
  const isMobileLayout = containerWidth < MOBILE_BREAKPOINT;

  const selectedFavorite =
    l.favorites.find((fav) => fav.id === selectedFavoriteId) ?? l.favorites[0] ?? null;

  const { currentCard, isCardFlipped, setIsCardFlipped, gradeCard } = l;
  useEffect(() => {
    if (!isForeground || view !== "flashcards" || !currentCard) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setIsCardFlipped(!isCardFlipped);
        return;
      }
      const gradeIndex = Number(event.key) - 1;
      if (isCardFlipped && gradeIndex >= 0 && gradeIndex < SRS_GRADES.length) {
        event.preventDefault();
        gradeCard(SRS_GRADES[gradeIndex]);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isForeground, view, currentCard, isCardFlipped, setIsCardFlipped, gradeCard]);

  const handleNewLookup = () => {
    l.setView("lookup");
    l.setQuery("");
    window.requestAnimationFrame(() => l.searchInputRef.current?.focus());
  };

  const menuBar = <DictionaryMenuBar l={l} onClose={onClose} onNewLookup={handleNewLookup} />;

  const showSidebar = view !== "flashcards" && l.isSidebarVisible;
  const sidebarClassName = isMobileLayout
    ? "h-[150px] w-full max-w-none shrink-0 basis-auto self-stretch"
    : "w-[210px] shrink-0";

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: t("apps.dictionary.title"),
        onClose,
        isForeground,
        appId: "dictionary",
        material: isMacOSTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
      }}
    >
      <div
        ref={containerRef}
        className={cn(
          "flex size-full flex-col overflow-hidden font-os-ui",
          isMacOSTheme ? "bg-transparent" : isSystem7Theme ? "bg-white" : "bg-[#efede4]"
        )}
      >
        <DictionaryToolbar l={l} isMobileLayout={isMobileLayout} />
        <div
          className={cn(
            "flex min-h-0 flex-1 overflow-hidden",
            isMobileLayout ? "flex-col" : "flex-row",
            !isMobileLayout && isMacOSTheme && "gap-[5px]"
          )}
        >
          {showSidebar ? (
            <DictionarySidebar
              l={l}
              className={sidebarClassName}
              selectedFavoriteId={selectedFavorite?.id ?? null}
              onSelectFavorite={setSelectedFavoriteId}
            />
          ) : null}
          <AppSidebarPanel
            bordered={isMacOSTheme}
            className="flex min-h-0 min-w-0 flex-1 flex-col self-stretch"
          >
            {view === "lookup" && l.isHandwritingOpen ? <DictionaryHandwritingPad l={l} /> : null}
            {view === "flashcards" ? (
              <DictionaryFlashcardsView l={l} />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                {view === "favorites" ? (
                  <DictionaryFavoritesPanel l={l} favorite={selectedFavorite} />
                ) : (
                  <DictionaryLookupPanel l={l} />
                )}
              </div>
            )}
          </AppSidebarPanel>
        </div>
      </div>
      <AppHelpAboutDialogs
        appId="dictionary"
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
