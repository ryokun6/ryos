import { useTranslation } from "react-i18next";
import { AppMenuBarShell } from "@/components/shared/menubar/AppMenuBarShell";
import {
  AppMenuBarMenus,
  type MenuDescriptor,
} from "@/components/shared/menubar/AppMenuBarMenus";
import { useAppMenuBarChrome } from "@/hooks/useAppMenuBarChrome";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import {
  BOOK_FONTS,
  type BookFontOption,
} from "../utils/booksReader";
import { buildBooksMenuLayout } from "../utils/booksMenuLayout";
import {
  BOOKS_FONT_SIZE_MAX,
  BOOKS_FONT_SIZE_MIN,
  BOOKS_FONT_SIZE_STEP,
  BOOKS_SPEECH_RATE_OPTIONS,
  normalizeBooksSpeechRate,
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
  isSpeaking: boolean;
  onStartSpeaking: () => void;
  onStopSpeaking: () => void;
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
  isSpeaking,
  onStartSpeaking,
  onStopSpeaking,
}: BooksMenuBarProps) {
  const { t } = useTranslation();
  const isCompactMenu = useMediaQuery("(max-width: 768px)");
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
          label: t("apps.books.menu.textLayout"),
          items: [
            {
              type: "radioGroup",
              value: settings.textLayout,
              onValueChange: (value) => {
                if (value === "book" || value === "vertical") {
                  updateSettings({ textLayout: value });
                }
              },
              options: [
                { label: t("apps.books.textLayout.book"), value: "book" },
                {
                  label: t("apps.books.textLayout.vertical"),
                  value: "vertical",
                },
              ],
            },
          ],
        },
        {
          type: "submenu",
          label: t("apps.books.menu.chineseScript"),
          items: [
            {
              type: "radioGroup",
              value: settings.chineseScript,
              onValueChange: (value) =>
                updateSettings({
                  chineseScript:
                    value as BooksReaderSettings["chineseScript"],
                }),
              options: [
                {
                  label: t("apps.books.chineseScript.original"),
                  value: "original",
                },
                {
                  label: t("apps.books.chineseScript.simplified"),
                  value: "simplified",
                },
                {
                  label: t("apps.books.chineseScript.traditional"),
                  value: "traditional",
                },
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

  const speechRateLabels: Record<string, string> = {
    "0.8": t("apps.books.speechRate.slow"),
    "1": t("apps.books.speechRate.normal"),
    "1.2": t("apps.books.speechRate.fast"),
    "1.5": t("apps.books.speechRate.veryFast"),
  };
  const speechMenu: MenuDescriptor = {
    label: t("apps.books.menu.speech"),
    items: [
      {
        type: "action",
        label: t("apps.books.menu.startSpeaking"),
        onClick: onStartSpeaking,
        disabled: !canNavigateReader || isSpeaking,
      },
      {
        type: "action",
        label: t("apps.books.menu.stopSpeaking"),
        onClick: onStopSpeaking,
        disabled: !isSpeaking,
      },
      { type: "separator" },
      {
        type: "submenu",
        label: t("apps.books.menu.speechRate"),
        items: [
          {
            type: "radioGroup",
            value: String(normalizeBooksSpeechRate(settings.speechRate)),
            onValueChange: (value) => {
              const rate = Number(value);
              if (Number.isFinite(rate) && rate > 0) {
                updateSettings({ speechRate: rate });
              }
            },
            options: BOOKS_SPEECH_RATE_OPTIONS.map((rate) => ({
              label: speechRateLabels[String(rate)] ?? `${rate}×`,
              value: String(rate),
            })),
          },
        ],
      },
    ],
  };

  const goMenu: MenuDescriptor = {
    label: t("common.menu.go"),
    items: [
      {
        type: "action",
        label: t("apps.books.menu.previousPage"),
        onClick: onGoToPreviousPage,
        disabled: !canNavigateReader || !navigationState.canGoPreviousPage,
      },
      {
        type: "action",
        label: t("apps.books.menu.nextPage"),
        onClick: onGoToNextPage,
        disabled: !canNavigateReader || !navigationState.canGoNextPage,
      },
      { type: "separator" },
      {
        type: "submenu",
        label: t("apps.books.menu.chapters"),
        disabled: !canNavigateReader || chapters.length === 0,
        className:
          "data-[state=open]:bg-[var(--os-color-selection-bg)] data-[state=open]:text-[var(--os-color-selection-text)]",
        contentClassName:
          "max-w-[260px] sm:max-w-[320px] max-h-[400px] overflow-y-auto",
        items: [
          {
            type: "radioGroup",
            value:
              navigationState.currentChapterIndex >= 0
                ? String(navigationState.currentChapterIndex)
                : "",
            onValueChange: (value) => {
              const index = Number(value);
              const chapter = chapters[index];
              if (chapter) onGoToChapter(chapter.href);
            },
            options: chapters.map((chapter, index) => ({
              value: String(index),
              label: (
                <span
                  className="truncate min-w-0"
                  style={{ paddingLeft: `${chapter.depth * 12}px` }}
                >
                  {chapter.label}
                </span>
              ),
              className:
                "text-md h-6 pr-3 truncate max-w-[260px] sm:max-w-[320px]",
            })),
          },
        ],
      },
    ],
  };
  const menus = buildBooksMenuLayout({
    fileMenu,
    viewMenu,
    speechMenu,
    goMenu,
    isCompact: isCompactMenu,
  });

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
      <AppMenuBarMenus menus={menus} />
    </AppMenuBarShell>
  );
}
