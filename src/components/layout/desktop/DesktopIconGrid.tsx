import type { AnyApp } from "@/apps/base/types";
import type { AppId } from "@/config/appRegistry";
import { memo, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { OsIconLabel } from "@/components/shared/OsIconLabel";
import { getAppIconPath } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";
import type { FileSystemItem } from "@/stores/useFilesStore";
import { cn } from "@/lib/utils";
import { OS_SHELL_TEXT_SCALE_CLASS } from "@/lib/themeChrome";
import { prefetchAppChunk } from "@/config/lazyAppComponent";
import {
  getDesktopAppItemId,
  getDesktopShortcutItemId,
} from "./desktopConstants";
import type { DesktopItemId } from "./desktopTypes";

export interface DesktopIconGridProps {
  isWindowsTheme: boolean;
  isMacOSTheme: boolean;
  isDesktopApp: boolean;
  currentTheme: string;
  macintoshHdName: string;
  trashName: string;
  trashIcon: string;
  desktopShortcuts: FileSystemItem[];
  displayedApps: AnyApp[];
  getDisplayName: (shortcut: FileSystemItem) => string;
  getShortcutIcon: (shortcut: FileSystemItem) => string;
  /** Stable selection list — per-icon `isSelected` is derived so memo skips. */
  selectedItemIds: DesktopItemId[];
  onDesktopItemClick: (
    itemId: DesktopItemId,
    event: ReactMouseEvent<HTMLDivElement>
  ) => void;
  onFinderOpen: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onIconContextMenu: (appId: string, e: ReactMouseEvent) => void;
  onShortcutContextMenu: (shortcutPath: string, e: ReactMouseEvent) => void;
  onShortcutPointerDown: (shortcut: FileSystemItem) => void;
  onShortcutDoubleClick: (
    shortcut: FileSystemItem,
    e: ReactMouseEvent<HTMLDivElement>
  ) => void;
  onAppDoubleClick: (app: AnyApp, e: ReactMouseEvent<HTMLDivElement>) => void;
  onTrashDoubleClick: (e: ReactMouseEvent<HTMLDivElement>) => void;
}

const DesktopMacintoshHdIcon = memo(function DesktopMacintoshHdIcon({
  name,
  isWindowsTheme,
  isSelected,
  onDesktopItemClick,
  onFinderOpen,
  onIconContextMenu,
}: {
  name: string;
  isWindowsTheme: boolean;
  isSelected: boolean;
  onDesktopItemClick: DesktopIconGridProps["onDesktopItemClick"];
  onFinderOpen: DesktopIconGridProps["onFinderOpen"];
  onIconContextMenu: DesktopIconGridProps["onIconContextMenu"];
}) {
  return (
    <div data-desktop-item-id={getDesktopAppItemId("macintosh-hd")}>
      <OsIconLabel
        name={name}
        isDirectory={true}
        icon={
          isWindowsTheme ? "/icons/default/pc.png" : "/icons/default/disk.png"
        }
        onClick={(e) =>
          onDesktopItemClick(getDesktopAppItemId("macintosh-hd"), e)
        }
        onDoubleClick={onFinderOpen}
        onPointerDown={() => prefetchAppChunk("finder")}
        onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) =>
          onIconContextMenu("macintosh-hd", e)
        }
        isSelected={isSelected}
        size="large"
      />
    </div>
  );
});

const DesktopShortcutIcon = memo(function DesktopShortcutIcon({
  shortcut,
  displayName,
  icon,
  isSelected,
  onDesktopItemClick,
  onShortcutDoubleClick,
  onShortcutPointerDown,
  onShortcutContextMenu,
}: {
  shortcut: FileSystemItem;
  displayName: string;
  icon: string;
  isSelected: boolean;
  onDesktopItemClick: DesktopIconGridProps["onDesktopItemClick"];
  onShortcutDoubleClick: DesktopIconGridProps["onShortcutDoubleClick"];
  onShortcutPointerDown: DesktopIconGridProps["onShortcutPointerDown"];
  onShortcutContextMenu: DesktopIconGridProps["onShortcutContextMenu"];
}) {
  return (
    <div
      data-desktop-item-id={getDesktopShortcutItemId(shortcut.path)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData(
          "application/json",
          JSON.stringify({
            path: shortcut.path,
            name: shortcut.name,
            appId: shortcut.appId,
            aliasType: shortcut.aliasType,
            aliasTarget: shortcut.aliasTarget,
          })
        );
        const dragImage = e.currentTarget.cloneNode(true) as HTMLElement;
        dragImage.style.position = "absolute";
        dragImage.style.top = "-1000px";
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(
          dragImage,
          e.nativeEvent.offsetX,
          e.nativeEvent.offsetY
        );
        setTimeout(() => document.body.removeChild(dragImage), 0);
      }}
    >
      <OsIconLabel
        name={displayName}
        isDirectory={
          shortcut.aliasType === "file" &&
          shortcut.aliasTarget === "/Applications"
        }
        icon={icon}
        onClick={(e) =>
          onDesktopItemClick(getDesktopShortcutItemId(shortcut.path), e)
        }
        onDoubleClick={(e) => onShortcutDoubleClick(shortcut, e)}
        onPointerDown={() => onShortcutPointerDown(shortcut)}
        onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) =>
          onShortcutContextMenu(shortcut.path, e)
        }
        isSelected={isSelected}
        size="large"
      />
    </div>
  );
});

const DesktopAppIcon = memo(function DesktopAppIcon({
  app,
  isWindowsTheme,
  currentTheme,
  isSelected,
  onDesktopItemClick,
  onAppDoubleClick,
  onIconContextMenu,
}: {
  app: AnyApp;
  isWindowsTheme: boolean;
  currentTheme: string;
  isSelected: boolean;
  onDesktopItemClick: DesktopIconGridProps["onDesktopItemClick"];
  onAppDoubleClick: DesktopIconGridProps["onAppDoubleClick"];
  onIconContextMenu: DesktopIconGridProps["onIconContextMenu"];
}) {
  return (
    <div data-desktop-item-id={getDesktopAppItemId(app.id)}>
      <OsIconLabel
        name={getTranslatedAppName(app.id as AppId)}
        isDirectory={false}
        icon={
          isWindowsTheme && app.id === "pc"
            ? `/icons/${currentTheme}/games.png`
            : getAppIconPath(app.id)
        }
        onClick={(e) => onDesktopItemClick(getDesktopAppItemId(app.id), e)}
        onDoubleClick={(e) => onAppDoubleClick(app, e)}
        onPointerDown={() => prefetchAppChunk(app.id)}
        onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) =>
          onIconContextMenu(app.id, e)
        }
        isSelected={isSelected}
        size="large"
      />
    </div>
  );
});

const DesktopTrashIcon = memo(function DesktopTrashIcon({
  name,
  trashIcon,
  isSelected,
  onDesktopItemClick,
  onTrashDoubleClick,
  onIconContextMenu,
}: {
  name: string;
  trashIcon: string;
  isSelected: boolean;
  onDesktopItemClick: DesktopIconGridProps["onDesktopItemClick"];
  onTrashDoubleClick: DesktopIconGridProps["onTrashDoubleClick"];
  onIconContextMenu: DesktopIconGridProps["onIconContextMenu"];
}) {
  return (
    <div data-desktop-item-id={getDesktopAppItemId("trash")}>
      <OsIconLabel
        name={name}
        isDirectory={true}
        icon={trashIcon}
        onClick={(e) => onDesktopItemClick(getDesktopAppItemId("trash"), e)}
        onDoubleClick={onTrashDoubleClick}
        onPointerDown={() => prefetchAppChunk("finder")}
        onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) => {
          onIconContextMenu("trash", e);
        }}
        isSelected={isSelected}
        size="large"
      />
    </div>
  );
});

export const DesktopIconGrid = memo(function DesktopIconGrid({
  isWindowsTheme,
  isMacOSTheme,
  isDesktopApp,
  currentTheme,
  macintoshHdName,
  trashName,
  trashIcon,
  desktopShortcuts,
  displayedApps,
  getDisplayName,
  getShortcutIcon,
  selectedItemIds,
  onDesktopItemClick,
  onFinderOpen,
  onIconContextMenu,
  onShortcutContextMenu,
  onShortcutPointerDown,
  onShortcutDoubleClick,
  onAppDoubleClick,
  onTrashDoubleClick,
}: DesktopIconGridProps) {
  const selectedSet = useMemo(
    () => new Set(selectedItemIds),
    [selectedItemIds]
  );

  return (
    <div
      className={cn(
        "flex flex-col relative z-[1]",
        isMacOSTheme && OS_SHELL_TEXT_SCALE_CLASS,
        isWindowsTheme
          ? "items-start pt-2" // Reserve space via height, not padding, to avoid clipping
          : "items-end pt-8" // Account for top menubar - keep right alignment for other themes
      )}
      style={
        isWindowsTheme
          ? {
              // Exclude menubar, safe area, and an extra visual buffer to prevent clipping
              // Add extra top padding for desktop traffic lights on Windows themes
              height:
                "calc(100% - (30px + var(--sat-safe-area-bottom) + 48px))",
              paddingTop: isDesktopApp ? 36 : undefined,
              paddingLeft: "calc(0.25rem + env(safe-area-inset-left, 0px))",
              paddingRight: "calc(0.5rem + env(safe-area-inset-right, 0px))",
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }
          : {
              height: "calc(100% - 2rem)",
              padding: "1rem",
              paddingTop: "2rem",
              paddingLeft: "calc(1rem + env(safe-area-inset-left, 0px))",
              paddingRight: "calc(1rem + env(safe-area-inset-right, 0px))",
              paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
            }
      }
    >
      <div
        className={
          isWindowsTheme
            ? "flex flex-col flex-wrap justify-start content-start h-full gap-x-3 gap-y-3"
            : "flex flex-col flex-wrap-reverse justify-start content-start h-full gap-x-3 gap-y-3"
        }
      >
        <DesktopMacintoshHdIcon
          name={macintoshHdName}
          isWindowsTheme={isWindowsTheme}
          isSelected={selectedSet.has(getDesktopAppItemId("macintosh-hd"))}
          onDesktopItemClick={onDesktopItemClick}
          onFinderOpen={onFinderOpen}
          onIconContextMenu={onIconContextMenu}
        />
        {desktopShortcuts.map((shortcut) => (
          <DesktopShortcutIcon
            key={shortcut.path}
            shortcut={shortcut}
            displayName={getDisplayName(shortcut)}
            icon={getShortcutIcon(shortcut)}
            isSelected={selectedSet.has(
              getDesktopShortcutItemId(shortcut.path)
            )}
            onDesktopItemClick={onDesktopItemClick}
            onShortcutDoubleClick={onShortcutDoubleClick}
            onShortcutPointerDown={onShortcutPointerDown}
            onShortcutContextMenu={onShortcutContextMenu}
          />
        ))}
        {desktopShortcuts.length === 0 &&
          displayedApps.map((app) => (
            <DesktopAppIcon
              key={app.id}
              app={app}
              isWindowsTheme={isWindowsTheme}
              currentTheme={currentTheme}
              isSelected={selectedSet.has(getDesktopAppItemId(app.id))}
              onDesktopItemClick={onDesktopItemClick}
              onAppDoubleClick={onAppDoubleClick}
              onIconContextMenu={onIconContextMenu}
            />
          ))}
        {!isMacOSTheme && (
          <DesktopTrashIcon
            name={trashName}
            trashIcon={trashIcon}
            isSelected={selectedSet.has(getDesktopAppItemId("trash"))}
            onDesktopItemClick={onDesktopItemClick}
            onTrashDoubleClick={onTrashDoubleClick}
            onIconContextMenu={onIconContextMenu}
          />
        )}
      </div>
    </div>
  );
});
