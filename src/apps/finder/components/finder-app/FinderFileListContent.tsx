import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { FileList, type FileItem, type FileListProps } from "../FileList";
import type { TFunction } from "i18next";

export interface FinderFileListContentProps {
  t: TFunction;
  isLoading: boolean;
  error: string | null | undefined;
  sortedFiles: FileItem[];
  listClassName?: string;
  listStyle?: CSSProperties;
  fileListProps: Pick<
    FileListProps,
    | "viewType"
    | "selectedFile"
    | "selectedFiles"
    | "selectionAnchorPath"
    | "currentPath"
    | "canDropFiles"
    | "onFileOpen"
    | "onFileSelect"
    | "getFileType"
    | "onFileDrop"
    | "onDropToCurrentDirectory"
    | "onRenameRequest"
    | "onItemContextMenu"
  >;
}

export function FinderFileListContent({
  t,
  isLoading,
  error,
  sortedFiles,
  listClassName,
  listStyle,
  fileListProps,
}: FinderFileListContentProps) {
  const { viewType } = fileListProps;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        {t("apps.finder.messages.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        {error}
      </div>
    );
  }

  return (
    <div
      className={cn(
        listClassName,
        viewType === "list" ? "overflow-auto" : "overflow-y-auto overflow-x-hidden"
      )}
      style={listStyle}
    >
      <FileList files={sortedFiles} {...fileListProps} />
    </div>
  );
}
