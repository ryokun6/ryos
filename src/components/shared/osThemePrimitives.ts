import { cn } from "@/lib/utils";

type ThemeSurfaceFlags = {
  isMacOSTheme: boolean;
  isSystem7Theme: boolean;
  isXpTheme: boolean;
  isWin98?: boolean;
};

type DrawerPlacement = "right" | "left" | "bottom" | "top";

export function osCardClassName(
  flags: ThemeSurfaceFlags,
  options: {
    embed?: "chat" | "panel";
    className?: string;
  } = {}
): string {
  const { isMacOSTheme, isSystem7Theme, isXpTheme, isWin98 = false } = flags;
  const { embed = "chat", className } = options;

  return cn(
    "flex flex-col overflow-hidden font-geneva-12",
    embed === "chat" && "my-1",
    isMacOSTheme &&
      "maps-place-card-aqua rounded-[0.5rem] border-transparent text-os-text-primary",
    !isMacOSTheme &&
      isSystem7Theme &&
      cn(
        "rounded",
        "border-2 border-black bg-white text-black shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]"
      ),
    !isMacOSTheme &&
      !isSystem7Theme &&
      isXpTheme &&
      !isWin98 &&
      cn(
        "rounded-[0.4rem]",
        "border-2 border-os-window bg-os-window-bg text-os-text-primary"
      ),
    !isMacOSTheme &&
      !isSystem7Theme &&
      isWin98 &&
      cn(
        "rounded-none",
        windowsBevelClassName("raised"),
        "bg-os-window-bg text-os-text-primary"
      ),
    !isMacOSTheme &&
      !isSystem7Theme &&
      !isXpTheme &&
      !isWin98 &&
      cn(
        "rounded",
        "border border-black/30 bg-white text-black shadow-md"
      ),
    className
  );
}

export function osDrawerSurfaceClassName(
  flags: ThemeSurfaceFlags,
  placement: DrawerPlacement
): string {
  const { isMacOSTheme, isSystem7Theme, isXpTheme, isWin98 = false } = flags;

  return cn(
    "flex flex-1 flex-col overflow-hidden min-h-0",
    isMacOSTheme &&
      cn(
        "os-drawer-metal",
        placement === "right" && "rounded-r-[0.45rem]",
        placement === "left" && "rounded-l-[0.45rem]",
        placement === "bottom" && "rounded-b-[0.45rem]",
        placement === "top" && "rounded-t-[0.45rem]"
      ),
    !isMacOSTheme &&
      isSystem7Theme &&
      (placement === "right"
        ? "bg-white border-2 border-black border-l-0 shadow-[2px_2px_0_0_rgba(0,0,0,0.5)]"
        : placement === "left"
          ? "bg-white border-2 border-black border-r-0 rounded-l shadow-[-2px_2px_0_0_rgba(0,0,0,0.5)]"
          : placement === "bottom"
            ? "bg-white border-2 border-black border-t-0 rounded-b shadow-[2px_4px_0_0_rgba(0,0,0,0.45)]"
            : "bg-white border-2 border-black border-b-0 rounded-t shadow-[2px_-4px_0_0_rgba(0,0,0,0.45)]"),
    !isMacOSTheme &&
      isXpTheme &&
      !isWin98 &&
      (placement === "right"
        ? "bg-os-window-bg border-[3px] border-l-0 border-os-window rounded-r-[0.5rem]"
        : placement === "left"
          ? "bg-os-window-bg border-[3px] border-r-0 border-os-window rounded-l-[0.5rem]"
          : placement === "bottom"
            ? "bg-os-window-bg border-[3px] border-t-0 border-os-window rounded-b-[0.5rem]"
            : "bg-os-window-bg border-[3px] border-b-0 border-os-window rounded-t-[0.5rem]"),
    !isMacOSTheme &&
      isWin98 &&
      (placement === "right"
        ? "bg-os-window-bg border-2 border-l-0 border-t-white border-r-os-separator border-b-os-separator"
        : placement === "left"
          ? "bg-os-window-bg border-2 border-r-0 border-t-white border-l-white border-b-os-separator"
          : placement === "bottom"
            ? "bg-os-window-bg border-2 border-t-0 border-l-white border-r-os-separator border-b-os-separator"
            : "bg-os-window-bg border-2 border-b-0 border-l-white border-r-os-separator border-t-white")
  );
}

export function osToolbarSurfaceClassName(
  flags: Pick<
    ThemeSurfaceFlags,
    "isMacOSTheme" | "isSystem7Theme" | "isXpTheme"
  > & { isWin98?: boolean },
  options: {
    border?: "none" | "top" | "bottom";
    className?: string;
  } = {}
): string {
  const { isMacOSTheme, isSystem7Theme, isXpTheme, isWin98 = false } = flags;
  const { border = "none", className } = options;

  return cn(
    border === "top" && "border-t",
    border === "bottom" && "border-b",
    isMacOSTheme && "bg-transparent border-black/25",
    !isMacOSTheme &&
      isSystem7Theme &&
      "bg-[#e0e0e0] border-black/10 text-black",
    !isMacOSTheme &&
      isXpTheme &&
      !isWin98 &&
      "bg-os-window-bg border-os-separator text-os-text-primary",
    !isMacOSTheme &&
      isWin98 &&
      "bg-os-window-bg border-os-separator text-os-text-primary",
    className
  );
}

export function windowsBevelClassName(
  variant: "raised" | "sunken" = "raised"
): string {
  return variant === "sunken"
    ? "border-2 border-t-os-separator border-l-os-separator border-b-white border-r-white"
    : "border-2 border-t-white border-l-white border-b-os-separator border-r-os-separator";
}
