import { useTranslation } from "react-i18next";
import {
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import {
  MENUBAR_ITEM_CLASS,
  MENUBAR_SEPARATOR_CLASS,
  MENUBAR_TRIGGER_CLASS,
} from "@/components/shared/menubar/menubarStyles";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { cn } from "@/lib/utils";
import {
  BOOK_FONTS,
  type BookFontOption,
} from "../utils/booksReader";
import {
  BOOKS_FONT_SIZE_MAX,
  BOOKS_FONT_SIZE_MIN,
  BOOKS_FONT_SIZE_STEP,
  type BooksReaderSettings,
} from "@/stores/useBooksStore";
import type { BooksNavigationState } from "./BooksReaderPane";

interface BooksMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onImport: () => void;
  onBackToShelf: () => void;
  isReading: boolean;
  settings: BooksReaderSettings;
  updateSettings: (partial: Partial<BooksReaderSettings>) => void;
  navigationState: BooksNavigationState;
  onGoToPreviousPage: () => void;
  onGoToNextPage: () => void;
  onGoToChapter: (href: string) => void;
}

export function BooksMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onImport,
  onBackToShelf,
  isReading,
  settings,
  updateSettings,
  navigationState,
  onGoToPreviousPage,
  onGoToNextPage,
  onGoToChapter,
}: BooksMenuBarProps) {
  const { t } = useTranslation();
  const {
    isShareDialogOpen,
    setIsShareDialogOpen,
    isWindowsTheme,
    isMacOSTheme,
    appId,
    appName,
  } = useAppMenuBarChrome("books");

  const changeFontSize = (delta: number) => {
    const next = Math.min(
      BOOKS_FONT_SIZE_MAX,
      Math.max(BOOKS_FONT_SIZE_MIN, settings.fontSizePct + delta)
    );
    updateSettings({ fontSizePct: next });
  };

  const fileMenu: MenuDescriptor = {
      label: t("common.menu.file"),
      items: [
        {
          type: "action",
          label: t("apps.books.menu.import"),
          onClick: onImport,
        },
        {
          type: "action",
          label: t("apps.books.menu.backToShelf"),
          onClick: onBackToShelf,
          disabled: !isReading,
        },
        { type: "separator" },
        {
          type: "action",
          label: t("common.menu.close"),
          onClick: onClose,
          shortcutId: "close",
        },
      ],
    };

  const viewMenu: MenuDescriptor = {
      label: t("common.menu.view"),
      items: [
        {
          type: "submenu",
          label: t("apps.books.menu.font"),
          items: [
            {
              type: "radioGroup",
              value: settings.fontId,
              onValueChange: (value) => updateSettings({ fontId: value }),
              options: BOOK_FONTS.map((font: BookFontOption) => ({
                label: font.label,
                value: font.id,
              })),
            },
          ],
        },
        {
          type: "submenu",
          label: t("apps.books.menu.textSize"),
          items: [
            {
              type: "action",
              label: t("apps.books.menu.textSizeIncrease"),
              onClick: () => changeFontSize(BOOKS_FONT_SIZE_STEP),
              shortcut: "+",
              disabled: settings.fontSizePct >= BOOKS_FONT_SIZE_MAX,
            },
            {
              type: "action",
              label: t("apps.books.menu.textSizeDecrease"),
              onClick: () => changeFontSize(-BOOKS_FONT_SIZE_STEP),
              shortcut: "−",
              disabled: settings.fontSizePct <= BOOKS_FONT_SIZE_MIN,
            },
            {
              type: "action",
              label: t("apps.books.menu.textSizeReset"),
              onClick: () => updateSettings({ fontSizePct: 100 }),
              disabled: settings.fontSizePct === 100,
            },
          ],
        },
        {
          type: "submenu",
          label: t("apps.books.menu.columns"),
          items: [
            {
              type: "radioGroup",
              value: settings.columnMode,
              onValueChange: (value) =>
                updateSettings({
                  columnMode: value as BooksReaderSettings["columnMode"],
                }),
              options: [
                { label: t("apps.books.columns.auto"), value: "auto" },
                { label: t("apps.books.columns.single"), value: "single" },
                { label: t("apps.books.columns.double"), value: "double" },
              ],
            },
          ],
        },
        {
          type: "submenu",
          label: t("apps.books.menu.theme"),
          items: [
            {
              type: "radioGroup",
              value: settings.themeOverride,
              onValueChange: (value) =>
                updateSettings({
                  themeOverride:
                    value as BooksReaderSettings["themeOverride"],
                }),
              options: [
                { label: t("apps.books.theme.auto"), value: "auto" },
                { label: t("apps.books.theme.light"), value: "light" },
                { label: t("apps.books.theme.sepia"), value: "sepia" },
                { label: t("apps.books.theme.dark"), value: "dark" },
              ],
            },
          ],
        },
      ],
    };

  const chapters = navigationState.chapters;
  const canNavigateReader = isReading && navigationState.isReady;

  return (
    <AppMenuBarShell
      isWindowsTheme={isWindowsTheme}
      isMacOSTheme={isMacOSTheme}
      appId={appId}
      appName={appName}
      isShareDialogOpen={isShareDialogOpen}
      setIsShareDialogOpen={setIsShareDialogOpen}
      helpItemLabel={t("apps.books.menu.booksHelp")}
      aboutItemLabel={t("apps.books.menu.aboutBooks")}
      onShowHelp={onShowHelp}
      onShowAbout={onShowAbout}
    >
      <AppMenuBarMenus menus={[fileMenu, viewMenu]} />
      <MenubarMenu>
        <MenubarTrigger className={MENUBAR_TRIGGER_CLASS}>
          {t("common.menu.go")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onGoToPreviousPage}
            disabled={!canNavigateReader || !navigationState.canGoPreviousPage}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.books.menu.previousPage")}
          </MenubarItem>
          <MenubarItem
            onClick={onGoToNextPage}
            disabled={!canNavigateReader || !navigationState.canGoNextPage}
            className={MENUBAR_ITEM_CLASS}
          >
            {t("apps.books.menu.nextPage")}
          </MenubarItem>
          <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
          <MenubarSub>
            <MenubarSubTrigger
              disabled={!canNavigateReader || chapters.length === 0}
              className={cn(
                MENUBAR_ITEM_CLASS,
                "data-[state=open]:bg-[var(--os-color-selection-bg)] data-[state=open]:text-[var(--os-color-selection-text)]"
              )}
            >
              {t("apps.books.menu.chapters")}
            </MenubarSubTrigger>
            <MenubarSubContent className="px-0 max-w-[260px] sm:max-w-[320px] max-h-[400px] overflow-y-auto">
              {chapters.map((chapter, index) => (
                <MenubarCheckboxItem
                  key={`${chapter.id}-${index}`}
                  checked={index === navigationState.currentChapterIndex}
                  onCheckedChange={() => onGoToChapter(chapter.href)}
                  className={cn(
                    "text-md h-6 pr-3 truncate max-w-[260px] sm:max-w-[320px]"
                  )}
                >
                  <span
                    className="truncate min-w-0"
                    style={{ paddingLeft: `${chapter.depth * 12}px` }}
                  >
                    {chapter.label}
                  </span>
                </MenubarCheckboxItem>
              ))}
            </MenubarSubContent>
          </MenubarSub>
        </MenubarContent>
      </MenubarMenu>
    </AppMenuBarShell>
  );
}
