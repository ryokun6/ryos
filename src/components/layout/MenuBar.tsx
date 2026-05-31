import { useMemo } from "react";
import { Menubar } from "@/components/ui/menubar";
import { appRegistry } from "@/config/appRegistry";
import type { AnyApp } from "@/apps/base/types";
import { useAppStoreShallow } from "@/stores/helpers";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useFilesStore } from "@/stores/useFilesStore";
import type { MenuBarProps } from "./menu-bar/menuBarTypes";
import { WindowsTaskbar } from "./menu-bar/WindowsTaskbar";
import { MacTopMenuBar } from "./menu-bar/MacTopMenuBar";

export type { MenuBarProps } from "./menu-bar/menuBarTypes";

export function MenuBar({ children, inWindowFrame = false }: MenuBarProps) {
  const apps: AnyApp[] = useMemo(() => Object.values(appRegistry), []);
  const {
    instances,
    bringInstanceToForeground,
    restoreInstance,
    foregroundInstanceId,
  } = useAppStoreShallow((s) => ({
    instances: s.instances,
    bringInstanceToForeground: s.bringInstanceToForeground,
    restoreInstance: s.restoreInstance,
    foregroundInstanceId: s.foregroundInstanceId,
  }));

  const { currentTheme, isWindowsTheme: isXpTheme } = useThemeFlags();
  const getFileItem = useFilesStore((s) => s.getItem);

  if (inWindowFrame && isXpTheme) {
    return (
      <Menubar
        className="flex items-center border-none bg-transparent space-x-0 rounded-none"
        style={{
          fontFamily: isXpTheme ? "var(--font-ms-sans)" : "var(--os-font-ui)",
          fontSize: "11px",
          paddingLeft: "6px",
          paddingRight: "2px",
          height: "28px",
          minHeight: "28px",
          maxHeight: "28px",
        }}
      >
        {children}
      </Menubar>
    );
  }

  if (isXpTheme && !inWindowFrame) {
    return (
      <WindowsTaskbar
        apps={apps}
        instances={instances}
        foregroundInstanceId={foregroundInstanceId}
        bringInstanceToForeground={bringInstanceToForeground}
        restoreInstance={restoreInstance}
        getFileItem={getFileItem}
        currentTheme={currentTheme}
        isXpTheme={isXpTheme}
      />
    );
  }

  return <MacTopMenuBar>{children}</MacTopMenuBar>;
}
