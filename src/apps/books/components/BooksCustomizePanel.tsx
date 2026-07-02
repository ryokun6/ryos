import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import { useResizeObserverWithRef } from "@/hooks/useResizeObserver";
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
  normalizeBooksCustomColor,
  type BooksReaderSettings,
  type BooksThemeOverride,
} from "@/stores/useBooksStore";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  applyFontPreviewStack,
  BOOK_FONTS,
  BOOK_THEME_PRESET_IDS,
  buildAccentReadingPalette,
  buildCustomReadingPalette,
  getBookFontCssStack,
  getReadingPalette,
  resolveOsAccentBaseHex,
} from "../utils/booksReader";
import {
  isChineseBookLanguage,
  isCjkBookLanguage,
} from "../utils/booksLanguage";

interface BooksCustomizePanelProps {
  settings: BooksReaderSettings;
  updateSettings: (partial: Partial<BooksReaderSettings>) => void;
  osIsDark: boolean;
  /** Bottom-sheet layout for narrow windows / mobile. */
  compact: boolean;
  /** EPUB package language; gates CJK-only layout controls. */
  bookLanguage?: string | null;
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

/** Width (px) of the fade masking overflowing content on scrollable rows. */
const SCROLL_FADE_PX = 20;

/**
 * Horizontally scrollable chip/swatch row that fades out its clipped edges:
 * the fade only shows on a side that has more content scrolled out of view,
 * so the ends of the row stay crisp.
 */
function ScrollFadeRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft < maxScroll - 1;
    setFade((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right }
    );
  }, []);

  useLayoutEffect(() => {
    updateFade();
  }, [updateFade]);
  useResizeObserverWithRef(scrollRef, updateFade);

  const maskImage =
    fade.left && fade.right
      ? `linear-gradient(to right, transparent, black ${SCROLL_FADE_PX}px, black calc(100% - ${SCROLL_FADE_PX}px), transparent)`
      : fade.left
        ? `linear-gradient(to right, transparent, black ${SCROLL_FADE_PX}px)`
        : fade.right
          ? `linear-gradient(to right, black calc(100% - ${SCROLL_FADE_PX}px), transparent)`
          : undefined;

  return (
    <div
      ref={scrollRef}
      onScroll={updateFade}
      className={cn(
        "flex w-full overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      style={{ maskImage, WebkitMaskImage: maskImage }}
    >
      {children}
    </div>
  );
}

/** Checkerboard used to preview a transparent (glassy) background. */
const TRANSPARENT_SWATCH_STYLE: CSSProperties = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "repeating-conic-gradient(rgba(0,0,0,0.16) 0% 25%, transparent 0% 50%)",
  backgroundSize: "8px 8px",
};

/** Circular color well backed by a native color picker. */
function ColorWell({
  color,
  transparent = false,
  onChange,
  ariaLabel,
}: {
  color: string;
  /** Render a checkerboard instead of the (kept) color. */
  transparent?: boolean;
  onChange: (hex: string) => void;
  ariaLabel: string;
}) {
  return (
    <span
      title={ariaLabel}
      className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-black/20 os-dark:border-white/25"
      style={transparent ? TRANSPARENT_SWATCH_STYLE : { background: color }}
    >
      <input
        type="color"
        value={color}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </span>
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
  bookLanguage = null,
  onClose,
}: BooksCustomizePanelProps) {
  const { t, i18n } = useTranslation();
  const uiLanguage = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const supportsVerticalText = isCjkBookLanguage(bookLanguage);
  const supportsChineseScript = isChineseBookLanguage(bookLanguage);
  const isVerticalText =
    supportsVerticalText && settings.textLayout === "vertical";
  // Facing-page columns don't apply on narrow (mobile) layouts or vertical text.
  const showColumns = !compact && !isVerticalText;
  const accentBaseHex = useThemeStore((state) => resolveOsAccentBaseHex(state));

  const autoPalette = getReadingPalette(osIsDark ? "dark" : "light");
  const accentPalette = buildAccentReadingPalette(accentBaseHex, osIsDark);
  const customPalette = buildCustomReadingPalette(settings, osIsDark);
  const customBackground = normalizeBooksCustomColor(
    settings.customThemeBackground,
    "#fdfdfb"
  );
  const customText = normalizeBooksCustomColor(
    settings.customThemeText,
    "#1c1c1c"
  );
  const isCustomTheme = settings.themeOverride === "custom";
  const themeSwatches: {
    id: BooksThemeOverride;
    label: string;
    background: string;
    text: string;
    showGlyph: boolean;
    /** Checkerboard preview for a transparent (glassy) custom background. */
    transparent?: boolean;
    /** Rainbow ring marking the editable custom swatch. */
    custom?: boolean;
    /** Outer ring tinted with the live OS accent color. */
    accent?: boolean;
  }[] = [
    {
      id: "auto" as const,
      label: t("apps.books.theme.auto"),
      // Follows the OS light/dark setting.
      background: autoPalette.background,
      text: autoPalette.text,
      showGlyph: true,
    },
    {
      id: "accent" as const,
      label: t("apps.books.theme.accent"),
      background: accentPalette.background,
      text: accentPalette.text,
      showGlyph: true,
      accent: true,
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
    {
      id: "custom" as const,
      label: t("apps.books.theme.custom"),
      background: customBackground,
      text: customPalette.text,
      showGlyph: true,
      transparent: settings.customThemeTransparent,
      custom: true,
    },
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
        "books-customize-panel absolute z-[60] flex flex-col gap-2 overflow-y-auto overscroll-contain p-3",
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

      {supportsVerticalText ? (
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
      ) : null}

      {supportsChineseScript ? (
        <Row label={t("apps.books.menu.chineseScript")}>
          <Segmented
            ariaLabel={t("apps.books.menu.chineseScript")}
            value={settings.chineseScript}
            options={[
              {
                value: "original" as const,
                label: t("apps.books.chineseScript.original"),
              },
              {
                value: "simplified" as const,
                label: t("apps.books.chineseScript.simplified"),
              },
              {
                value: "traditional" as const,
                label: t("apps.books.chineseScript.traditional"),
              },
            ]}
            onChange={(value) => updateSettings({ chineseScript: value })}
          />
        </Row>
      ) : null}

      {showColumns ? (
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
      ) : null}

      <Row label={t("apps.books.menu.font")}>
        <ScrollFadeRow className="gap-1 pb-0.5">
          {BOOK_FONTS.map((font) => {
            const stack = getBookFontCssStack(font.id, uiLanguage);
            const selected = settings.fontId === font.id;
            return (
              <button
                key={font.id}
                type="button"
                aria-pressed={selected}
                onClick={() => updateSettings({ fontId: font.id })}
                // Recreated every render, so React re-runs it whenever the
                // resolved stack changes (e.g. UI language switch).
                ref={(el) => {
                  applyFontPreviewStack(el, stack);
                }}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] transition-colors",
                  selected
                    ? "bg-os-selection-bg text-os-selection-text"
                    : "bg-black/[0.07] hover:bg-black/15 os-dark:bg-white/10 os-dark:hover:bg-white/20"
                )}
              >
                {t(`apps.books.fonts.${font.id}`)}
              </button>
            );
          })}
        </ScrollFadeRow>
      </Row>

      <Row label={t("apps.books.customize.colors")}>
        {/* Scroll container clips at its padding edge, so pad it (and pull the
            padding back out with negative margins) to keep the selection ring
            from being cut off at the row edges. */}
        <ScrollFadeRow className="-m-1 gap-1.5 p-1">
          {themeSwatches.map((swatch) => {
            const selected = settings.themeOverride === swatch.id;
            if (swatch.custom || swatch.accent) {
              // Custom: rainbow ring. Accent: live OS accent ring.
              return (
                <button
                  key={swatch.id}
                  type="button"
                  title={swatch.label}
                  aria-label={swatch.label}
                  aria-pressed={selected}
                  onClick={() => updateSettings({ themeOverride: swatch.id })}
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full p-[2.5px] transition-shadow",
                    selected &&
                      "ring-2 ring-[color:var(--os-color-selection-bg)] ring-offset-1 ring-offset-[color:var(--os-color-window-bg)]"
                  )}
                  style={{
                    background: swatch.accent
                      ? accentBaseHex
                      : "conic-gradient(#f43f5e, #f59e0b, #84cc16, #22d3ee, #6366f1, #d946ef, #f43f5e)",
                  }}
                >
                  <span
                    className="flex h-full w-full items-center justify-center rounded-full text-[11px] font-medium"
                    style={
                      swatch.transparent
                        ? { ...TRANSPARENT_SWATCH_STYLE, color: swatch.text }
                        : { background: swatch.background, color: swatch.text }
                    }
                  >
                    A
                  </span>
                </button>
              );
            }
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
        </ScrollFadeRow>
      </Row>

      {/* Custom color editor: pick foreground/background, or go transparent
          so the window material (glass) shows through. */}
      {isCustomTheme && (
        <>
          <Row label={t("apps.books.customize.background")}>
            <div className="flex w-full items-center gap-1.5">
              <ColorWell
                color={customBackground}
                transparent={settings.customThemeTransparent}
                ariaLabel={t("apps.books.customize.background")}
                onChange={(hex) =>
                  updateSettings({
                    customThemeBackground: normalizeBooksCustomColor(
                      hex,
                      customBackground
                    ),
                    // Picking a color implies an opaque page again.
                    customThemeTransparent: false,
                  })
                }
              />
              <button
                type="button"
                aria-pressed={settings.customThemeTransparent}
                onClick={() =>
                  updateSettings({
                    customThemeTransparent: !settings.customThemeTransparent,
                  })
                }
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] transition-colors",
                  settings.customThemeTransparent
                    ? "bg-os-selection-bg text-os-selection-text"
                    : "bg-black/[0.07] hover:bg-black/15 os-dark:bg-white/10 os-dark:hover:bg-white/20"
                )}
              >
                {t("apps.books.customize.transparent")}
              </button>
            </div>
          </Row>
          <Row label={t("apps.books.customize.textColor")}>
            <ColorWell
              color={customText}
              ariaLabel={t("apps.books.customize.textColor")}
              onChange={(hex) =>
                updateSettings({
                  customThemeText: normalizeBooksCustomColor(hex, customText),
                })
              }
            />
          </Row>
        </>
      )}
    </motion.div>
  );
}
