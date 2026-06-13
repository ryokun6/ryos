import type { AnyApp } from "@/apps/base/types";
import type { AppId } from "@/config/appRegistry";
import type { MouseEvent as ReactMouseEvent } from "react";
import { FileIcon } from "@/apps/finder/components/FileIcon";
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
  isXpTheme: boolean;
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
  isItemSelected: (itemId: DesktopItemId) => boolean;
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

export function DesktopIconGrid({
  isXpTheme,
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
  isItemSelected,
  onDesktopItemClick,
  onFinderOpen,
  onIconContextMenu,
  onShortcutContextMenu,
  onShortcutPointerDown,
  onShortcutDoubleClick,
  onAppDoubleClick,
  onTrashDoubleClick,
}: DesktopIconGridProps) {
  return (
    <div
      className={cn(
        "flex flex-col relative z-[1]",
        isMacOSTheme && OS_SHELL_TEXT_SCALE_CLASS,
        isXpTheme
          ? "items-start pt-2" // Reserve space via height, not padding, to avoid clipping
          : "items-end pt-8" // Account for top menubar - keep right alignment for other themes
      )}
      style={
        isXpTheme
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
          isXpTheme
            ? "flex flex-col flex-wrap justify-start content-start h-full gap-x-3 gap-y-3"
            : "flex flex-col flex-wrap-reverse justify-start content-start h-full gap-x-3 gap-y-3"
        }
      >
        <div data-desktop-item-id={getDesktopAppItemId("macintosh-hd")}>
          <FileIcon
            name={macintoshHdName}
            isDirectory={true}
            icon={
              isXpTheme ? "/icons/default/pc.png" : "/icons/default/disk.png"
            }
            onClick={(e) =>
              onDesktopItemClick(getDesktopAppItemId("macintosh-hd"), e)
            }
            onDoubleClick={onFinderOpen}
            onPointerDown={() => prefetchAppChunk("finder")}
            onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) =>
              onIconContextMenu("macintosh-hd", e)
            }
            isSelected={isItemSelected(getDesktopAppItemId("macintosh-hd"))}
            size="large"
          />
        </div>
        {/* Display desktop shortcuts */}
        {desktopShortcuts.map((shortcut) => (
          <div
            key={shortcut.path}
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
              // Set drag image
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
            <FileIcon
              name={getDisplayName(shortcut)}
              isDirectory={
                shortcut.aliasType === "file" &&
                shortcut.aliasTarget === "/Applications"
              }
              icon={getShortcutIcon(shortcut)}
              onClick={(e) =>
                onDesktopItemClick(
                  getDesktopShortcutItemId(shortcut.path),
                  e
                )
              }
              onDoubleClick={(e) => onShortcutDoubleClick(shortcut, e)}
              onPointerDown={() => onShortcutPointerDown(shortcut)}
              onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) =>
                onShortcutContextMenu(shortcut.path, e)
              }
              isSelected={isItemSelected(
                getDesktopShortcutItemId(shortcut.path)
              )}
              size="large"
            />
          </div>
        ))}
        {/* Display regular app icons (only if not using shortcuts) */}
        {desktopShortcuts.length === 0 &&
          displayedApps.map((app) => (
            <div
              key={app.id}
              data-desktop-item-id={getDesktopAppItemId(app.id)}
            >
              <FileIcon
                name={getTranslatedAppName(app.id as AppId)}
                isDirectory={false}
                icon={
                  isXpTheme && app.id === "pc"
                    ? `/icons/${currentTheme}/games.png`
                    : getAppIconPath(app.id)
                }
                onClick={(e) =>
                  onDesktopItemClick(getDesktopAppItemId(app.id), e)
                }
                onDoubleClick={(e) => onAppDoubleClick(app, e)}
                onPointerDown={() => prefetchAppChunk(app.id)}
                onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) =>
                  onIconContextMenu(app.id, e)
                }
                isSelected={isItemSelected(getDesktopAppItemId(app.id))}
                size="large"
              />
            </div>
          ))}
        {/* Display Trash icon at the end for non-macOS X themes */}
        {!isMacOSTheme && (
          <div data-desktop-item-id={getDesktopAppItemId("trash")}>
            <FileIcon
              name={trashName}
              isDirectory={true}
              icon={trashIcon}
              onClick={(e) =>
                onDesktopItemClick(getDesktopAppItemId("trash"), e)
              }
              onDoubleClick={onTrashDoubleClick}
              onPointerDown={() => prefetchAppChunk("finder")}
              onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) => {
                onIconContextMenu("trash", e);
              }}
              isSelected={isItemSelected(getDesktopAppItemId("trash"))}
              size="large"
            />
          </div>
        )}
      </div>
    </div>
  );
}
