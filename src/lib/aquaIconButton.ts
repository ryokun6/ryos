import { cn } from "@/lib/utils";

/** Overrides `.aqua-button` default `padding: 0 16px` for icon + label pills. */
export const AQUA_ICON_BUTTON_PADDING_CLASS =
  "!gap-1.5 !pl-2.5 !pr-3.5 !py-0 min-h-0";

/** Hook for macOS theme rules in `themes.css` (`.admin-force-font`). */
export const AQUA_ICON_BUTTON_ADMIN_MARKER_CLASS = "admin-aqua-icon-button";

export const AQUA_ICON_BUTTON_CHROME_CLASS = cn(
  AQUA_ICON_BUTTON_PADDING_CLASS,
  AQUA_ICON_BUTTON_ADMIN_MARKER_CLASS,
  "text-[12px] leading-none"
);

export const AQUA_ICON_BUTTON_PHOSPHOR_SIZE = 16;

export const AQUA_ICON_BUTTON_ICON_CLASS = "h-4 w-4 shrink-0";

const AQUA_ICON_BUTTON_PADDING_CLASS_SM =
  "!gap-1 !pl-2 !pr-2.5 !py-0 min-h-0";

export const AQUA_ICON_BUTTON_CHROME_CLASS_SM = cn(
  AQUA_ICON_BUTTON_PADDING_CLASS_SM,
  AQUA_ICON_BUTTON_ADMIN_MARKER_CLASS,
  "text-[12px] leading-none"
);

export const AQUA_ICON_BUTTON_ICON_CLASS_SM = "h-3.5 w-3.5 shrink-0";

export function adminAquaIconButtonClass(
  variant: "secondary" | "primary" | "orange" = "secondary",
  size: "md" | "sm" = "md"
) {
  return cn(
    "aqua-button",
    variant,
    "flex items-center",
    size === "md" ? "h-7" : "h-6",
    size === "md" ? AQUA_ICON_BUTTON_CHROME_CLASS : AQUA_ICON_BUTTON_CHROME_CLASS_SM
  );
}
