import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";

export function AdminPanelHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  const { isMacOSTheme: isMacOSXTheme, isWindowsTheme: isXpTheme } =
    useThemeFlags();

  return (
    <div
      className={cn(
        "flex flex-shrink-0 items-center gap-2 border-b px-2 py-1.5",
        isXpTheme
          ? "border-[#919b9c]"
          : isMacOSXTheme
            ? "border-black/10"
            : "border-black/20"
      )}
      style={
        isMacOSXTheme
          ? { backgroundImage: "var(--os-pinstripe-window)" }
          : undefined
      }
    >
      <span className="shrink-0 text-[12px] font-medium">{title}</span>
      {actions ? (
        <div className="ml-auto flex min-w-0 items-center gap-1">{actions}</div>
      ) : null}
    </div>
  );
}
