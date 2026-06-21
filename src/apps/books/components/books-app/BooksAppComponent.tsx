import { LayoutGroup } from "motion/react";
import type { AppProps, BooksInitialData } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { getTranslatedAppName } from "@/utils/i18n";
import { appMetadata } from "../../metadata";
import { useBooksLogic } from "../../hooks/useBooksLogic";
import { BooksMenuBar } from "../BooksMenuBar";
import { BooksShelfView } from "../BooksShelfView";
import { BooksReaderPane } from "../BooksReaderPane";

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
    isDarkMode,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    library,
    viewMode,
    activeBook,
    openBook,
    closeBook,
    settings,
    updateSettings,
    progressByPath,
    saveProgress,
    handleImport,
    fileInputRef,
    handleFileInputChange,
  } = useBooksLogic({ isWindowOpen, isForeground, instanceId, initialData });

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

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: getTranslatedAppName("books"),
        onClose,
        isForeground,
        appId: "books",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
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
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-os-window-bg font-os-ui">
        <LayoutGroup>
          {viewMode === "reader" && activeBook ? (
            <>
              <BooksReaderPane
                key={activeBook.path}
                entry={activeBook}
                settings={settings}
                osIsDark={isDarkMode}
                initialCfi={progressByPath[activeBook.path]?.cfi}
                onProgress={(cfi, percentage) =>
                  saveProgress(activeBook.path, cfi, percentage)
                }
              />
              <button
                type="button"
                onClick={closeBook}
                className="absolute left-2 top-2 z-40 rounded-full bg-black/45 px-3 py-1 text-xs font-os-ui text-white backdrop-blur transition-colors hover:bg-black/65"
              >
                {t("apps.books.reader.backToShelf")}
              </button>
            </>
          ) : (
            <BooksShelfView
              library={library}
              progressByPath={progressByPath}
              onOpenBook={(entry) => openBook(entry.path)}
              onImport={handleImport}
            />
          )}
        </LayoutGroup>
      </div>
    </AppWindowShell>
  );
}
