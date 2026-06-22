import { useRef } from "react";
import { SquaresFour } from "@phosphor-icons/react";
import type { AppProps, BooksInitialData } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { getTranslatedAppName } from "@/utils/i18n";
import { appMetadata } from "../../metadata";
import { useBooksLogic } from "../../hooks/useBooksLogic";
import { BooksMenuBar } from "../BooksMenuBar";
import { BooksShelfView } from "../BooksShelfView";
import { BooksReaderPane } from "../BooksReaderPane";
import { BookCloseZoom } from "../BookCloseZoom";

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

  const menuBar = (
    <BooksMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onImport={handleImport}
      onBackToShelf={closeBook}
      isReading={viewMode === "reader"}
      settings={settings}
      updateSettings={updateSettings}
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
        title:
          isReading && activeBook
            ? activeBookTitle || activeBook.name
            : getTranslatedAppName("books"),
        onClose,
        isForeground,
        appId: "books",
        material: "notitlebar",
        disableTitlebarAutoHide: true,
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
        className="relative flex h-full w-full flex-col overflow-hidden bg-os-window-bg font-os-ui"
      >
        {viewMode === "reader" && activeBook ? (
          <BooksReaderPane
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
