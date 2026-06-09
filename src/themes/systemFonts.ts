export const THEME_DEFAULT_SYSTEM_FONT = "theme-default";

export const SYSTEM_FONT_OPTIONS = [
  {
    id: THEME_DEFAULT_SYSTEM_FONT,
    label: "Theme Default",
    cssValue: null,
  },
  {
    id: "lucida-grande",
    label: "Lucida Grande",
    cssValue:
      '"LucidaGrande", "Lucida Grande", "AquaKana", "Hiragino Sans", "Hiragino Sans GB", "Heiti SC", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  },
  {
    id: "geneva",
    label: "Geneva",
    cssValue:
      '"Geneva-12", "Geneva", "ArkPixel", "SerenityOS-Emoji", system-ui, -apple-system, sans-serif',
  },
  {
    id: "chicago",
    label: "Chicago",
    cssValue:
      '"ChicagoKare", "Chicago", "ArkPixel", "SerenityOS-Emoji", system-ui, -apple-system, sans-serif',
  },
  {
    id: "ms-sans-serif",
    label: "MS Sans Serif",
    cssValue:
      '"Pixelated MS Sans Serif", "MS Sans Serif", "ArkPixel", "SerenityOS-Emoji", Tahoma, Arial, sans-serif',
  },
  {
    id: "helvetica-neue",
    label: "Helvetica Neue",
    cssValue:
      '"Helvetica Neue", "HelveticaNeue", Helvetica, Arial, ui-sans-serif, system-ui, sans-serif',
  },
  {
    id: "myriad-pro",
    label: "Myriad Pro",
    cssValue:
      '"MyriadPro", "Myriad Pro", "Gill Sans", "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  },
  {
    id: "system",
    label: "System",
    cssValue:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
] as const;

export type SystemFontId = (typeof SYSTEM_FONT_OPTIONS)[number]["id"];

export function isSystemFontId(value: unknown): value is SystemFontId {
  return (
    typeof value === "string" &&
    SYSTEM_FONT_OPTIONS.some((option) => option.id === value)
  );
}

export function getSystemFontCssValue(font: SystemFontId): string | null {
  return SYSTEM_FONT_OPTIONS.find((option) => option.id === font)?.cssValue ?? null;
}
