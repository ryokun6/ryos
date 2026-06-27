import { AirDropView } from "../AirDropView";
import { FinderFileListContent, type FinderFileListContentProps } from "./FinderFileListContent";
import type { TFunction } from "i18next";
import { formatStorageSize } from "@/stores/useFinderStore";

export interface FinderLegacyContentAreaProps {
  t: TFunction;
  isAirDropView: boolean;
  sortedFilesCount: number;
  storageSpaceAvailable: number;
  fileListContentProps: FinderFileListContentProps;
  handleAirDropSendFile: (
    recipient: string,
    fileName: string,
    filePath: string,
    fileType: string
  ) => void | Promise<void>;
  promptVerifyToken: () => void;
}

export function FinderLegacyContentArea({
  t,
  isAirDropView,
  sortedFilesCount,
  storageSpaceAvailable,
  fileListContentProps,
  handleAirDropSendFile,
  promptVerifyToken,
}: FinderLegacyContentAreaProps) {
  return (
    <>
      {isAirDropView ? (
        <div className="flex-1 bg-gradient-to-b from-neutral-100 to-neutral-200">
          <AirDropView
            onSendFile={handleAirDropSendFile}
            onRequestLogin={promptVerifyToken}
          />
        </div>
      ) : (
        <FinderFileListContent
          {...fileListContentProps}
          listClassName="flex-1 bg-white"
        />
      )}
      <div className="os-status-bar os-status-bar-text flex items-center justify-between px-2 py-1 text-[10px] font-geneva-12 bg-neutral-100 border-t border-neutral-300">
        <span>
          {sortedFilesCount}{" "}
          {sortedFilesCount !== 1
            ? t("apps.finder.statusBar.items")
            : t("apps.finder.statusBar.item")}
        </span>
        <span>
          {formatStorageSize(storageSpaceAvailable)}{" "}
          {t("apps.finder.statusBar.available")}
        </span>
      </div>
    </>
  );
}
