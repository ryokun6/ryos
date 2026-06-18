import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { adminToolbarClass } from "../utils/adminStyles";

export function AdminPanelHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  const { isMacOSTheme: isMacOSXTheme, isWindowsTheme } =
    useThemeFlags();

  return (
    <div
      className={cn(
        adminToolbarClass,
        "flex flex-shrink-0 items-center gap-2 border-b px-2 py-1.5",
        isWindowsTheme
          ? "border-[#919b9c]"
          : isMacOSXTheme
            ? "border-black/10"
            : "border-black/20"
      )}
    >
      <span className="shrink-0 text-[12px] font-medium">{title}</span>
      {actions ? (
        <div className="ml-auto flex min-w-0 items-center gap-1">{actions}</div>
      ) : null}
    </div>
  );
}
