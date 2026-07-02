import type { ReactNode } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { X } from "@phosphor-icons/react";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  BOOKS_FONT_SIZE_MAX,
  BOOKS_FONT_SIZE_MIN,
  BOOKS_GUTTER_MAX,
  BOOKS_GUTTER_MIN,
  BOOKS_GUTTER_STEP,
  BOOKS_LINE_HEIGHT_MAX,
  BOOKS_LINE_HEIGHT_MIN,
  BOOKS_LINE_HEIGHT_STEP,
  type BooksReaderSettings,
  type BooksThemeOverride,
} from "@/stores/useBooksStore";
import {
  BOOK_FONTS,
  BOOK_THEME_PRESET_IDS,
  getBookFontCssStack,
  getReadingPalette,
} from "../utils/booksReader";

interface BooksCustomizePanelProps {
  settings: BooksReaderSettings;
  updateSettings: (partial: Partial<BooksReaderSettings>) => void;
  osIsDark: boolean;
  /** Bottom-sheet layout for narrow windows / mobile. */
  compact: boolean;
  onClose: () => void;
}

/** Uniform "label — control — value" row so every setting reads the same. */
function Row({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center gap-2">
      <span
        title={label}
        className="w-[72px] shrink-0 truncate text-[11px] text-os-text-secondary"
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      {value !== undefined && (
        <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-os-text-secondary">
          {value}
        </span>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-full rounded-[6px] bg-black/[0.07] p-0.5 os-dark:bg-white/10"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-w-0 flex-1 truncate rounded-[5px] px-2 py-1 text-[11px] transition-colors",
            value === option.value
              ? "bg-os-selection-bg text-os-selection-text"
              : "hover:bg-black/5 os-dark:hover:bg-white/10"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Floating reading-appearance panel (View ▸ Theme ▸ Customize…): sliders for
 * text size / line spacing / margins, quick toggles for text direction and
 * columns, font chips, and the full set of reading color presets. Renders as
 * a top-right card on wide windows and a bottom sheet on narrow ones.
 */
export function BooksCustomizePanel({
  settings,
  updateSettings,
  osIsDark,
  compact,
  onClose,
}: BooksCustomizePanelProps) {
  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en";

  const autoPalette = getReadingPalette(osIsDark ? "dark" : "light");
  const themeSwatches: {
    id: BooksThemeOverride;
    label: string;
    background: string;
    text: string;
    /** The Auto swatch is a plain solid dot; presets preview their text color. */
    showGlyph: boolean;
  }[] = [
    {
      id: "auto" as const,
      label: t("apps.books.theme.auto"),
      // Solid swatch that follows the OS light/dark setting.
      background: autoPalette.background,
      text: autoPalette.text,
      showGlyph: false,
    },
    ...BOOK_THEME_PRESET_IDS.map((id) => {
      const palette = getReadingPalette(id);
      return {
        id: id as BooksThemeOverride,
        label: t(`apps.books.theme.${id}`),
        background: palette.background,
        text: palette.text,
        showGlyph: true,
      };
    }),
  ];

  return (
    <motion.div
      initial={compact ? { y: "100%" } : { opacity: 0, y: -6, scale: 0.98 }}
      animate={compact ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
      exit={compact ? { y: "100%" } : { opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      role="dialog"
      aria-label={t("apps.books.customize.title")}
      className={cn(
        "absolute z-[60] flex flex-col gap-2 overflow-y-auto overscroll-contain p-3",
        "bg-os-window-bg font-os-ui text-os-text-primary",
        compact
          ? "inset-x-0 bottom-0 max-h-[75%] rounded-t-[10px] border-t border-os-window pb-4 shadow-[0_-6px_24px_rgba(0,0,0,0.25)]"
          : cn(
              "right-3 top-10 w-[320px] max-w-[calc(100%-1.5rem)]",
              "max-h-[calc(100%-3.5rem)] rounded-os shadow-os-window",
              "border-[length:var(--os-metrics-border-width)] border-os-window",
              "os-theme-win98:shadow-none"
            )
      )}
    >
      <div className="mb-0.5 flex items-center justify-between">
        <span className="text-[12px] font-semibold">
          {t("apps.books.customize.title")}
        </span>
        <button
          type="button"
          aria-label={t("common.menu.close")}
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-os-text-secondary transition-colors hover:bg-black/10 hover:text-os-text-primary os-dark:hover:bg-white/15"
        >
          <X size={12} weight="bold" />
        </button>
      </div>

      <Row
        label={t("apps.books.menu.textSize")}
        value={`${settings.fontSizePct}%`}
      >
        <Slider
          aria-label={t("apps.books.menu.textSize")}
          min={BOOKS_FONT_SIZE_MIN}
          max={BOOKS_FONT_SIZE_MAX}
          step={5}
          value={[settings.fontSizePct]}
          onValueChange={([next]) => updateSettings({ fontSizePct: next })}
        />
      </Row>

      <Row
        label={t("apps.books.customize.lineSpacing")}
        value={settings.lineHeight.toFixed(2)}
      >
        <Slider
          aria-label={t("apps.books.customize.lineSpacing")}
          min={BOOKS_LINE_HEIGHT_MIN}
          max={BOOKS_LINE_HEIGHT_MAX}
          step={BOOKS_LINE_HEIGHT_STEP}
          value={[settings.lineHeight]}
          onValueChange={([next]) =>
            updateSettings({ lineHeight: Math.round(next * 100) / 100 })
          }
        />
      </Row>

      <Row
        label={t("apps.books.customize.margins")}
        value={`${settings.gutterPx}px`}
      >
        <Slider
          aria-label={t("apps.books.customize.margins")}
          min={BOOKS_GUTTER_MIN}
          max={BOOKS_GUTTER_MAX}
          step={BOOKS_GUTTER_STEP}
          value={[settings.gutterPx]}
          onValueChange={([next]) => updateSettings({ gutterPx: next })}
        />
      </Row>

      <Row label={t("apps.books.menu.textLayout")}>
        <Segmented
          ariaLabel={t("apps.books.menu.textLayout")}
          value={settings.textLayout}
          options={[
            {
              value: "book" as const,
              label: t("apps.books.textLayout.horizontal"),
            },
            {
              value: "vertical" as const,
              label: t("apps.books.textLayout.vertical"),
            },
          ]}
          onChange={(value) => updateSettings({ textLayout: value })}
        />
      </Row>

      <Row label={t("apps.books.menu.columns")}>
        <Segmented
          ariaLabel={t("apps.books.menu.columns")}
          value={settings.columnMode}
          options={[
            { value: "auto" as const, label: t("apps.books.columns.auto") },
            {
              value: "single" as const,
              label: t("apps.books.columns.single"),
            },
            {
              value: "double" as const,
              label: t("apps.books.columns.double"),
            },
          ]}
          onChange={(value) => updateSettings({ columnMode: value })}
        />
      </Row>

      <Row label={t("apps.books.menu.font")}>
        <div className="flex w-full gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {BOOK_FONTS.map((font) => {
            const stack = getBookFontCssStack(font.id, uiLanguage);
            const selected = settings.fontId === font.id;
            return (
              <button
                key={font.id}
                type="button"
                aria-pressed={selected}
                onClick={() => updateSettings({ fontId: font.id })}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] transition-colors",
                  selected
                    ? "bg-os-selection-bg text-os-selection-text"
                    : "bg-black/[0.07] hover:bg-black/15 os-dark:bg-white/10 os-dark:hover:bg-white/20"
                )}
                style={{ fontFamily: stack ?? undefined }}
              >
                {font.label}
              </button>
            );
          })}
        </div>
      </Row>

      <Row label={t("apps.books.customize.colors")}>
        <div className="flex w-full flex-wrap gap-1.5">
          {themeSwatches.map((swatch) => {
            const selected = settings.themeOverride === swatch.id;
            return (
              <button
                key={swatch.id}
                type="button"
                title={swatch.label}
                aria-label={swatch.label}
                aria-pressed={selected}
                onClick={() => updateSettings({ themeOverride: swatch.id })}
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-black/20 text-[12px] font-medium transition-shadow os-dark:border-white/25",
                  selected &&
                    "ring-2 ring-[color:var(--os-color-selection-bg)] ring-offset-1 ring-offset-[color:var(--os-color-window-bg)]"
                )}
                style={{ background: swatch.background, color: swatch.text }}
              >
                {swatch.showGlyph ? "A" : null}
              </button>
            );
          })}
        </div>
      </Row>
    </motion.div>
  );
}
