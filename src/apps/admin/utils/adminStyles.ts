import { cn } from "@/lib/utils";

/** Main content pane — tracks `--os-color-window-bg` in light and dark. */
export const adminSurfaceClass = "bg-os-window-bg text-os-text-primary";

/** Recessed sidebar / secondary panel surface. */
export const adminSidebarClass = "bg-os-panel-bg text-os-text-primary";

/** Card / panel shell with theme-aware border. */
export const adminCardClass =
  "overflow-hidden rounded border border-os-separator bg-os-window-bg";

/** Card header band (dashboard sections, server card, etc.). */
export const adminCardHeaderClass =
  "border-b border-os-separator bg-os-panel-bg px-3 py-2";

/** Detail panel header (user profile, song detail). */
export const adminDetailHeaderClass =
  "flex items-center gap-2 border-b border-os-separator bg-os-panel-bg px-3 py-2";

/** Uppercase section labels in cards and profile panels. */
export const adminSectionLabelClass =
  "text-[10px] uppercase tracking-wide text-os-text-disabled";

/** Collapsible section headers in profile / song panels. */
export const adminSectionHeaderClass =
  "!text-[11px] uppercase tracking-wide text-os-text-secondary";

/** Theme-aware vertical list dividers. */
export const adminListDividerClass =
  "divide-y divide-[color:var(--os-color-separator)]";

/** Table header cell background. */
export const adminTableHeadClass =
  "font-normal bg-os-panel-bg/80 text-os-text-secondary";

/** Subtle row hover — remapped in dark `.window-body`, explicit for Aqua dark. */
export const adminRowHoverClass =
  "hover:bg-neutral-100/50 os-mac-aqua-dark:hover:bg-white/8 transition-colors";

/** Alternating row tint (manual index-based striping). */
export const adminAltRowBgClass =
  "bg-[color:var(--os-color-list-row-alt-bg)]";

/** Zebra-striped data table row. */
export const adminTableRowClass = cn(
  "border-none group",
  "odd:bg-[color:var(--os-color-list-row-alt-bg)]",
  adminRowHoverClass,
);

/** Ghost icon button in admin tables / lists. */
export const adminGhostIconBtnClass = cn(
  "text-os-text-secondary hover:text-os-text-primary",
  "os-mac-aqua-dark:hover:bg-white/8",
);

/** Load-more / secondary action text button. */
export const adminLoadMoreBtnClass =
  "h-7 text-[11px] text-os-text-secondary hover:text-os-text-primary";

/** Avatar / thumbnail placeholder well. */
export const adminAvatarWellClass =
  "bg-os-panel-bg text-os-text-secondary";

/** Progress / chart track background. */
export const adminTrackBgClass = "bg-os-panel-bg";
