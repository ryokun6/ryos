import { useCallback, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { SquaresFour } from "@phosphor-icons/react";
import type { AppProps, BooksInitialData } from "@/apps/base/types";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { appMetadata } from "../../metadata";
import { useBooksLogic } from "../../hooks/useBooksLogic";
import { BooksMenuBar } from "../BooksMenuBar";
import { BooksShelfView } from "../BooksShelfView";
import {
  BooksReaderPane,
  createInitialBooksNavigationState,
  type BooksNavigationState,
  type BooksReaderPaneHandle,
} from "../BooksReaderPane";
import { BookCloseZoom } from "../BookCloseZoom";
import { BooksCustomizePanel } from "../BooksCustomizePanel";

export function BooksAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<BooksInitialData>) {
  const {
    t,
    translatedHelpItems,
    isWindowsTheme,
    isMacOSTheme,
    isDarkMode,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    library,
    viewMode,
    activeBook,
    activeBookTitle,
    openOriginRect,
    closingBook,
    openBook,
    closeBook,
    finishClosing,
    deleteBook,
    moveBookToTop,
    moveBookToBottom,
    settings,
    updateSettings,
    shelfView,
    setShelfView,
    progressByPath,
    saveProgress,
    handleImport,
    fileInputRef,
    handleFileInputChange,
  } = useBooksLogic({ isWindowOpen, isForeground, instanceId, initialData });

  // Positioning box for the transient closing-zoom overlay.
  const contentRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<BooksReaderPaneHandle>(null);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
  // Narrow windows (mobile / small desktop windows) get a bottom-sheet
  // Customize panel instead of the floating top-right card.
  const [isCompactPanel, setIsCompactPanel] = useState(false);
  useResizeObserverWithRef(contentRef, (entry) => {
    setIsCompactPanel(entry.contentRect.width < 500);
  });
  const [readerNavigationState, setReaderNavigationState] =
    useState<BooksNavigationState>(createInitialBooksNavigationState);
  const handleReaderNavigationStateChange = useCallback(
    (state: BooksNavigationState) => setReaderNavigationState(state),
    []
  );
  const [isSpeaking, setIsSpeaking] = useState(false);
  const handleSpeechStateChange = useCallback(
    (speaking: boolean) => setIsSpeaking(speaking),
    []
  );

  const menuBar = (
    <BooksMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onImport={handleImport}
      onBackToShelf={closeBook}
      onShowCustomize={() => setIsCustomizeOpen(true)}
      isReading={viewMode === "reader"}
      settings={settings}
      updateSettings={updateSettings}
      navigationState={readerNavigationState}
      onGoToPreviousPage={() => readerRef.current?.goToPreviousPage()}
      onGoToNextPage={() => readerRef.current?.goToNextPage()}
      onGoToChapter={(href) => readerRef.current?.goToChapter(href)}
      isSpeaking={isSpeaking}
      onStartSpeaking={() => readerRef.current?.startSpeaking()}
      onStopSpeaking={() => readerRef.current?.stopSpeaking()}
    />
  );

  if (!isWindowOpen) return null;

  const isReading = viewMode === "reader";
  // macOS X notitlebar uses a dark glass titlebar: light icon + shadow.
  // Classic/Windows themes use a dark icon with no shadow.
  const isDarkTitlebar = isMacOSTheme;
  const shelfButton = (
    <button
      type="button"
      aria-label={t("apps.books.reader.backToShelf")}
      title={t("apps.books.reader.backToShelf")}
      onClick={(e) => {
        e.stopPropagation();
        if (isReading) closeBook();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className={`shrink-0 w-5 h-5 min-h-5 max-h-5 flex items-center justify-center transition-colors ${
        !isReading
          ? "text-transparent cursor-default"
          : isDarkTitlebar
            ? "text-white/80 hover:text-white cursor-pointer"
            : "text-neutral-600 hover:text-neutral-800 cursor-pointer"
      }`}
      style={{
        filter:
          isReading && isDarkTitlebar
            ? "drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6))"
            : undefined,
      }}
      disabled={!isReading}
    >
      <SquaresFour size={14} weight="bold" />
    </button>
  );

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        // Shelf has its own header, so the window titlebar shows nothing there;
        // while reading, the book title appears in hover-revealed chrome.
        title: isReading && activeBook ? activeBookTitle || activeBook.name : "",
        onClose,
        isForeground,
        appId: "books",
        material: "notitlebar",
        disableTitlebarAutoHide: !isReading,
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
        titleBarRightContent: shelfButton,
      }}
      leading={
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileInputChange}
          accept=".epub,application/epub+zip"
          className="hidden"
        />
      }
      trailing={
        <AppHelpAboutDialogs
          appId="books"
          helpItems={translatedHelpItems}
          metadata={appMetadata}
          isHelpOpen={isHelpDialogOpen}
          onHelpOpenChange={setIsHelpDialogOpen}
          isAboutOpen={isAboutDialogOpen}
          onAboutOpenChange={setIsAboutDialogOpen}
        />
      }
    >
      <div
        ref={contentRef}
        className="books-app-shell relative flex h-full w-full flex-col overflow-hidden bg-os-window-bg font-os-ui"
      >
        {viewMode === "reader" && activeBook ? (
          <BooksReaderPane
            ref={readerRef}
            key={activeBook.path}
            entry={activeBook}
            settings={settings}
            osIsDark={isDarkMode}
            originRect={openOriginRect}
            initialCfi={progressByPath[activeBook.path]?.cfi}
            initialPercentage={progressByPath[activeBook.path]?.percentage}
            onProgress={(cfi, percentage) =>
              saveProgress(activeBook.path, cfi, percentage)
            }
            onNavigationStateChange={handleReaderNavigationStateChange}
            onSpeechStateChange={handleSpeechStateChange}
          />
        ) : (
          <BooksShelfView
            library={library}
            progressByPath={progressByPath}
            shelfView={shelfView}
            onSetShelfView={setShelfView}
            onOpenBook={(entry, originRect) =>
              openBook(entry.path, originRect)
            }
            onImport={handleImport}
            onDeleteBook={deleteBook}
            onMoveToTop={moveBookToTop}
            onMoveToBottom={moveBookToBottom}
          />
        )}
        {/* Floating reading-appearance customization panel (View ▸ Theme ▸ Customize…). */}
        <AnimatePresence>
          {isCustomizeOpen && (
            <BooksCustomizePanel
              settings={settings}
              updateSettings={updateSettings}
              osIsDark={isDarkMode}
              compact={isCompactPanel}
              onClose={() => setIsCustomizeOpen(false)}
            />
          )}
        </AnimatePresence>
        {/* Reverse zoom: full-bleed cover shrinks back onto the shelf book. */}
        {viewMode === "shelf" && closingBook && (
          <BookCloseZoom
            key={closingBook.path}
            entry={closingBook}
            containerRef={contentRef}
            settings={settings}
            osIsDark={isDarkMode}
            onDone={finishClosing}
          />
        )}
      </div>
    </AppWindowShell>
  );
}
