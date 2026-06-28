import { cn } from "@/lib/utils";
import { osSubtleIconButtonClassName } from "@/components/shared/osThemePrimitives";

/** Main content pane — transparent; window frost shows through (see themes.css). */
export const adminMainPaneClass =
  "admin-main-pane os-sidebar bg-transparent text-os-text-primary";

/** Nested split pane / fallback surface on the right. */
export const adminSurfaceClass = "bg-transparent text-os-text-primary";

/** Recessed sidebar / secondary panel surface. */
export const adminSidebarClass = "bg-white/90 text-os-text-primary";

/** Toolbar band above list views — transparent on macOS (see themes.css). */
export const adminToolbarClass = "admin-toolbar";

/** Compact toolbar segment (range toggles, filters) — interaction states in themes.css. */
export const adminToolbarSegmentClass =
  "admin-toolbar-segment h-7 px-2 text-[12px] rounded-none transition-none focus-visible:outline-none focus-visible:ring-0";

/** Card / panel shell with theme-aware border. */
export const adminCardClass =
  "admin-card overflow-hidden rounded border border-black/10 bg-transparent os-mac-aqua-dark:border-white/10";

/** Card header band (dashboard sections, server card, etc.). */
export const adminCardHeaderClass =
  "admin-card-header border-b border-black/10 bg-transparent px-3 py-1 text-[11px] leading-tight os-mac-aqua-dark:border-white/10";

/** Detail panel header (user profile, song detail). */
export const adminDetailHeaderClass =
  "admin-detail-header flex items-center gap-2 border-b border-black/10 bg-transparent px-3 py-1.5 text-[11px] leading-tight os-mac-aqua-dark:border-white/10";

/** Uppercase section labels in cards and profile panels. */
export const adminSectionLabelClass =
  "text-[10px] uppercase tracking-wide text-os-text-disabled";

/** Collapsible section headers in profile / song panels. */
export const adminSectionHeaderClass =
  "!text-[11px] uppercase tracking-wide text-os-text-secondary";

/** Theme-aware vertical list dividers. */
export const adminListDividerClass = "admin-soft-list-dividers";

/** Table header cell — transparent like Finder list columns (dark remap in themes.css). */
export const adminTableHeadClass =
  "font-normal text-os-text-secondary";

/** Subtle row hover — remapped in dark `.window-body`, explicit for Aqua dark. */
export const adminRowHoverClass =
  "hover:bg-neutral-100/50 os-mac-aqua-dark:hover:bg-white/8 transition-colors";

/** Manual alternating row tint (profile sub-tables). */
export const adminAltRowBgClass = "bg-black/5";

/** Zebra-striped data table row — `odd:bg-black/5` matches Finder list view. */
export const adminTableRowClass = cn(
  "admin-zebra-row border-none group",
  "odd:bg-black/5 hover:bg-black/5 transition-colors",
);

/** Ghost icon button in admin tables / lists. */
export const adminGhostIconBtnClass = cn(osSubtleIconButtonClassName());

/** Load-more / secondary action text button. */
export const adminLoadMoreBtnClass =
  "h-7 text-[11px] text-os-text-secondary hover:text-os-text-primary";

/** Avatar / thumbnail placeholder well. */
export const adminAvatarWellClass =
  "bg-os-panel-bg text-os-text-secondary";

/** Progress / chart track background. */
export const adminTrackBgClass = "bg-os-panel-bg";

/** Root shell for Admin → Cursor Agents (scopes semi-transparent amber overrides). */
export const adminCursorAgentsPanelClass = "admin-cursor-agents-panel";

/** Truncation / scan-cap hint banner in the Cursor Agents panel. */
export const adminCursorAgentBannerClass =
  "admin-cursor-agent-banner shrink-0 border-b border-amber-400/20 bg-amber-400/12 px-3 py-1 text-[10px] text-amber-800 os-mac-aqua-dark:border-amber-400/15 os-mac-aqua-dark:bg-amber-400/10 os-mac-aqua-dark:text-amber-200";

/** Running agent row — amber wash; glass theme overrides in aqua-glass.css. */
export const adminCursorAgentRunningRowClass =
  "admin-cursor-agent-running-row !bg-amber-400/18 odd:!bg-amber-400/24 hover:!bg-amber-400/28 os-mac-aqua-dark:!bg-amber-400/14 os-mac-aqua-dark:odd:!bg-amber-400/20 os-mac-aqua-dark:hover:!bg-amber-400/24";

/** Selected agent row (idle) — accent selection fill over zebra stripes. */
export const adminCursorAgentSelectedRowClass =
  "admin-cursor-agent-selected-row !bg-os-selection-bg !text-os-selection-text odd:!bg-os-selection-bg hover:!bg-os-selection-bg [text-shadow:var(--os-color-selection-text-shadow)]";

/** Selected + running — stronger amber wash; overrides global [data-selected] white text. */
export const adminCursorAgentRunningSelectedRowClass =
  "admin-cursor-agent-running-selected-row !bg-amber-500/35 odd:!bg-amber-500/40 hover:!bg-amber-500/45 !text-amber-950 os-mac-aqua-dark:!bg-amber-500/28 os-mac-aqua-dark:odd:!bg-amber-500/32 os-mac-aqua-dark:hover:!bg-amber-500/38 os-mac-aqua-dark:!text-amber-50";
