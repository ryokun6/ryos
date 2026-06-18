import { useMemo } from "react";
import { Menubar } from "@/components/ui/menubar";
import { appRegistry } from "@/config/appRegistry";
import type { AnyApp } from "@/apps/base/types";
import { useAppStore, useAppStoreShallow } from "@/stores/useAppStore";
import {
  getDockInstancesSignature,
  getDockInstancesSnapshot,
} from "./dock/dockInstancesSnapshot";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useFilesStore } from "@/stores/useFilesStore";
import type { MenuBarProps } from "./menu-bar/menuBarTypes";
import { WindowsTaskbar } from "./menu-bar/WindowsTaskbar";
import { MacTopMenuBar } from "./menu-bar/MacTopMenuBar";

export type { MenuBarProps } from "./menu-bar/menuBarTypes";

export function MenuBar({ children, inWindowFrame = false }: MenuBarProps) {
  const apps: AnyApp[] = useMemo(() => Object.values(appRegistry), []);

  const { currentTheme, isWindowsTheme } = useThemeFlags();

  if (inWindowFrame && isWindowsTheme) {
    return (
      <Menubar
        className="flex items-center border-none bg-transparent space-x-0 rounded-none"
        style={{
          fontFamily: isWindowsTheme ? "var(--font-ms-sans)" : "var(--os-font-ui)",
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

  if (isWindowsTheme && !inWindowFrame) {
    return (
      <WindowsTaskbarWithState
        apps={apps}
        currentTheme={currentTheme}
        isWindowsTheme={isWindowsTheme}
      />
    );
  }

  return <MacTopMenuBar>{children}</MacTopMenuBar>;
}

function WindowsTaskbarWithState({
  apps,
  currentTheme,
  isWindowsTheme,
}: {
  apps: AnyApp[];
  currentTheme: string;
  isWindowsTheme: boolean;
}) {
  const {
    dockInstancesSignature,
    bringInstanceToForeground,
    restoreInstance,
    foregroundInstanceId,
  } = useAppStoreShallow((s) => ({
    dockInstancesSignature: getDockInstancesSignature(s.instances),
    bringInstanceToForeground: s.bringInstanceToForeground,
    restoreInstance: s.restoreInstance,
    foregroundInstanceId: s.foregroundInstanceId,
  }));
  const instances = useMemo(
    () => getDockInstancesSnapshot(useAppStore.getState().instances),
    // The signature string is a deliberate cache key (same pattern as
    // MacDock): the snapshot is rebuilt only when a taskbar-relevant field
    // changes, not on every geometry/focus write to the instances map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dockInstancesSignature]
  );
  const getFileItem = useFilesStore((s) => s.getItem);

  return (
    <WindowsTaskbar
      apps={apps}
      instances={instances}
      foregroundInstanceId={foregroundInstanceId}
      bringInstanceToForeground={bringInstanceToForeground}
      restoreInstance={restoreInstance}
      getFileItem={getFileItem}
      currentTheme={currentTheme}
      isWindowsTheme={isWindowsTheme}
    />
  );
}
