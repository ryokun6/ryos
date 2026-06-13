import { cn } from "@/lib/utils";
import { osCardClassName } from "./osThemePrimitives";

/** Outer shell for inline chat tool cards (Maps places, Cursor agents, …). */
export function toolInlineCardShellClassName(flags: {
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isXpTheme: boolean;
  isWin98?: boolean;
  /** Chat embed; panel fills parent without outer margin/shadow. */
  embed?: "chat" | "panel";
}): string {
  const { embed = "chat", ...themeFlags } = flags;
  return osCardClassName(themeFlags, { embed });
}

/** Header band for Cursor agent stream card (pinstripe on macOS via CSS). */
export function cursorAgentCardHeaderClassName(flags: {
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isXpTheme: boolean;
  isDarkMode: boolean;
}): string {
  const { isMacOSTheme, isSystem7Theme, isXpTheme, isDarkMode } = flags;
  return cn(
    "flex flex-shrink-0 items-center gap-3 border-b px-3 py-2",
    isMacOSTheme && "cursor-agent-card-header-aqua",
    isMacOSTheme &&
      (isDarkMode
        ? "border-[color:var(--os-color-separator)]"
        : "border-black/10"),
    !isMacOSTheme &&
      isSystem7Theme &&
      "border-black bg-[#DDDDDD]",
    !isMacOSTheme &&
      !isSystem7Theme &&
      isXpTheme &&
      "border-[#919b9c] bg-gradient-to-b from-[#3A6EA5] to-[#1E4A8C] text-white",
    !isMacOSTheme &&
      !isSystem7Theme &&
      !isXpTheme &&
      "border-black/20 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800/90"
  );
}

export function toolInlineCardListClassName(flags: {
  isMacOSTheme: boolean;
  isDarkMode: boolean;
}): string {
  const { isMacOSTheme, isDarkMode } = flags;
  return cn(
    "divide-y",
    isMacOSTheme && isDarkMode
      ? "divide-[color:var(--os-color-separator)]"
      : "divide-black/10"
  );
}

export function toolInlineCardListRowClassName(flags: {
  isMacOSTheme: boolean;
  isDarkMode: boolean;
}): string {
  const { isMacOSTheme, isDarkMode } = flags;
  return cn(
    "flex w-full items-center gap-2.5 px-2.5 py-2 text-left",
    isMacOSTheme && isDarkMode
      ? "hover:bg-white/10 active:bg-white/14"
      : "hover:bg-black/5 active:bg-black/10",
    "focus:outline-none focus-visible:ring-1",
    isMacOSTheme && isDarkMode
      ? "focus-visible:ring-white/35"
      : "focus-visible:ring-black/30"
  );
}
