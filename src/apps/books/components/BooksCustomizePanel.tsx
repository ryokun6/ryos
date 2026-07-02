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
  onClose: () => void;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-[11px] font-medium text-os-text-secondary">
      {children}
    </span>
  );
}

function SegmentedControl<T extends string>({
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
      className="flex w-full overflow-hidden rounded-[6px] border border-os-input-border"
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "min-w-0 flex-1 truncate px-2 py-1 text-[11px] transition-colors",
            index > 0 && "border-l border-os-input-border",
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

function SliderRow({
  label,
  valueText,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueText: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <SectionLabel>{label}</SectionLabel>
        <span className="text-[11px] tabular-nums text-os-text-secondary">
          {valueText}
        </span>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
      />
    </section>
  );
}

/**
 * Floating reading-appearance panel (View ▸ Theme ▸ Customize…): sliders for
 * text size / line spacing / margins, quick toggles for text direction and
 * columns, font chips, and the full set of reading color presets.
 */
export function BooksCustomizePanel({
  settings,
  updateSettings,
  osIsDark,
  onClose,
}: BooksCustomizePanelProps) {
  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en";

  const themeSwatches: {
    id: BooksThemeOverride;
    label: string;
    background: string;
    text: string;
  }[] = [
    {
      id: "auto" as const,
      label: t("apps.books.theme.auto"),
      // Split swatch: follows the OS light/dark setting.
      background: `linear-gradient(135deg, ${
        getReadingPalette("light").background
      } 50%, ${getReadingPalette("dark").background} 50%)`,
      text: osIsDark
        ? getReadingPalette("dark").text
        : getReadingPalette("light").text,
    },
    ...BOOK_THEME_PRESET_IDS.map((id) => {
      const palette = getReadingPalette(id);
      return {
        id: id as BooksThemeOverride,
        label: t(`apps.books.theme.${id}`),
        background: palette.background,
        text: palette.text,
      };
    }),
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      role="dialog"
      aria-label={t("apps.books.customize.title")}
      className={cn(
        "absolute right-3 top-10 z-[60] flex w-[276px] max-w-[calc(100%-1.5rem)] flex-col gap-3",
        "max-h-[calc(100%-3.5rem)] overflow-y-auto overscroll-contain p-3",
        "rounded-os bg-os-window-bg font-os-ui text-os-text-primary shadow-os-window",
        "border-[length:var(--os-metrics-border-width)] border-os-window",
        "os-theme-win98:shadow-none"
      )}
    >
      <div className="flex items-center justify-between">
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

      <SliderRow
        label={t("apps.books.menu.textSize")}
        valueText={`${settings.fontSizePct}%`}
        min={BOOKS_FONT_SIZE_MIN}
        max={BOOKS_FONT_SIZE_MAX}
        step={5}
        value={settings.fontSizePct}
        onChange={(value) => updateSettings({ fontSizePct: value })}
      />

      <SliderRow
        label={t("apps.books.customize.lineSpacing")}
        valueText={`${settings.lineHeight.toFixed(2)}×`}
        min={BOOKS_LINE_HEIGHT_MIN}
        max={BOOKS_LINE_HEIGHT_MAX}
        step={BOOKS_LINE_HEIGHT_STEP}
        value={settings.lineHeight}
        onChange={(value) =>
          updateSettings({ lineHeight: Math.round(value * 100) / 100 })
        }
      />

      <SliderRow
        label={t("apps.books.customize.margins")}
        valueText={`${settings.gutterPx}px`}
        min={BOOKS_GUTTER_MIN}
        max={BOOKS_GUTTER_MAX}
        step={BOOKS_GUTTER_STEP}
        value={settings.gutterPx}
        onChange={(value) => updateSettings({ gutterPx: value })}
      />

      <section className="flex flex-col gap-1.5">
        <SectionLabel>{t("apps.books.menu.textLayout")}</SectionLabel>
        <SegmentedControl
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
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionLabel>{t("apps.books.menu.columns")}</SectionLabel>
        <SegmentedControl
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
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionLabel>{t("apps.books.menu.font")}</SectionLabel>
        <div className="grid grid-cols-2 gap-1.5">
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
                  "truncate rounded-[6px] border px-2 py-1.5 text-[12px] transition-colors",
                  selected
                    ? "border-transparent bg-os-selection-bg text-os-selection-text"
                    : "border-os-input-border hover:bg-black/5 os-dark:hover:bg-white/10"
                )}
                style={{ fontFamily: stack ?? undefined }}
              >
                {font.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionLabel>{t("apps.books.customize.colors")}</SectionLabel>
        <div className="grid grid-cols-5 gap-1.5">
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
                  "flex aspect-square w-full items-center justify-center rounded-full border border-black/20 text-[13px] font-medium transition-shadow os-dark:border-white/25",
                  selected &&
                    "ring-2 ring-[color:var(--os-color-selection-bg)] ring-offset-1 ring-offset-[color:var(--os-color-window-bg)]"
                )}
                style={{ background: swatch.background, color: swatch.text }}
              >
                A
              </button>
            );
          })}
        </div>
      </section>
    </motion.div>
  );
}
