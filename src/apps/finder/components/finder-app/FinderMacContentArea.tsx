import type { CSSProperties } from "react";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { AirDropView } from "../AirDropView";
import { FinderSidebarItem } from "./FinderSidebarItem";
import { FinderFileListContent, type FinderFileListContentProps } from "./FinderFileListContent";
import type { TFunction } from "i18next";

const FinderPanel = AppSidebarPanel;

export interface FinderSidebarEntry {
  name: string;
  icon: string;
  path: string;
  isAirDrop?: boolean;
  divider?: boolean;
}

export interface FinderMacContentAreaProps {
  t: TFunction;
  showSidebar: boolean;
  sidebarItems: FinderSidebarEntry[];
  activeSidebarPath: string;
  isAirDropView: boolean;
  sortedFilesCount: number;
  storageSpaceAvailable: number;
  fileListContentProps: FinderFileListContentProps;
  navigateToAirDrop: () => void;
  navigateAwayFromAirDrop: () => void;
  navigateToPath: (path: string) => void;
  handleAirDropSendFile: (
    recipient: string,
    fileName: string,
    filePath: string,
    fileType: string
  ) => void | Promise<void>;
  promptVerifyToken: () => void;
}

export function FinderMacContentArea({
  t,
  showSidebar,
  sidebarItems,
  activeSidebarPath,
  isAirDropView,
  sortedFilesCount,
  storageSpaceAvailable,
  fileListContentProps,
  navigateToAirDrop,
  navigateAwayFromAirDrop,
  navigateToPath,
  handleAirDropSendFile,
  promptVerifyToken,
}: FinderMacContentAreaProps) {
  return (
    <>
      <div className="flex-1 overflow-hidden flex gap-[5px]">
        {showSidebar && (
          <FinderPanel bordered className="w-[175px] shrink-0 flex flex-col min-h-0">
            <div className="flex-1 overflow-y-auto font-geneva-12 py-1">
              {sidebarItems.map((item) => (
                <div key={item.path}>
                  <FinderSidebarItem
                    name={item.name}
                    icon={item.icon}
                    isActive={activeSidebarPath === item.path}
                    onClick={() => {
                      if (item.isAirDrop) {
                        navigateToAirDrop();
                      } else {
                        navigateAwayFromAirDrop();
                        navigateToPath(item.path);
                      }
                    }}
                  />
                  {item.divider && (
                    <div className="mx-1.5 my-1.5 border-t border-black/15" />
                  )}
                </div>
              ))}
            </div>
          </FinderPanel>
        )}
        <FinderPanel bordered className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {isAirDropView ? (
            <div className="finder-airdrop-surface flex-1 bg-gradient-to-b from-[#e8ecf0] to-[#d1d5db]">
              <AirDropView
                onSendFile={handleAirDropSendFile}
                onRequestLogin={promptVerifyToken}
              />
            </div>
          ) : (
            <FinderFileListContent
              {...fileListContentProps}
              listClassName="flex-1 bg-white/90"
              listStyle={
                {
                  "--os-color-selection-bg":
                    "var(--os-accent-list-gradient, #3875d7)",
                } as CSSProperties
              }
            />
          )}
        </FinderPanel>
      </div>
      <div
        className="os-status-bar os-status-bar-text flex items-center justify-center px-2 pt-1 pb-0 text-[10px] font-geneva-12 bg-transparent border-t border-black/10"
        style={{
          textShadow: "0 1px 0 rgba(255,255,255,0.5)",
          color: "#333",
        }}
      >
        {sortedFilesCount}{" "}
        {sortedFilesCount !== 1
          ? t("apps.finder.statusBar.items")
          : t("apps.finder.statusBar.item")}
        , {Math.round((storageSpaceAvailable / 1024 / 1024) * 10) / 10} MB{" "}
        {t("apps.finder.statusBar.available")}
      </div>
    </>
  );
}
