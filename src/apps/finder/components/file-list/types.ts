import type { LaunchOriginRect } from "@/stores/useAppStore";
import type { ViewType } from "../FinderMenuBar";

export interface FileItem {
  name: string;
  isDirectory: boolean;
  path: string;
  icon?: string;
  appId?: string;
  content?: string | Blob;
  contentUrl?: string;
  size?: number;
  modifiedAt?: Date;
  type?: string;
  aliasType?: "file" | "app";
  aliasTarget?: string;
  originalPath?: string;
  deletedAt?: number;
  status?: "active" | "trashed";
}

export interface FileListProps {
  files: FileItem[];
  onFileOpen: (file: FileItem, launchOrigin?: LaunchOriginRect) => void;
  onFileSelect: (
    file: FileItem | undefined,
    options?: {
      selectedPaths?: string[];
      anchorPath?: string | null;
    }
  ) => void;
  selectedFile?: FileItem;
  selectedFiles?: string[];
  selectionAnchorPath?: string | null;
  viewType?: ViewType;
  getFileType: (file: FileItem) => string;
  onFileDrop?: (sourceFile: FileItem, targetFolder: FileItem) => void;
  onDropToCurrentDirectory?: (sourceFile: FileItem) => void;
  canDropFiles?: boolean;
  currentPath?: string;
  onRenameRequest?: (file: FileItem) => void;
  onItemContextMenu?: (file: FileItem, e: React.MouseEvent) => void;
}

export interface ListRowItemProps {
  file: FileItem;
  selectedFiles: string[];
  dropTargetPath: string | null;
  onItemContextMenu?: (file: FileItem, e: React.MouseEvent) => void;
  onFileOpen: (file: FileItem, launchOrigin?: LaunchOriginRect) => void;
  onFileSelect: (
    file: FileItem,
    event: React.MouseEvent<HTMLElement>,
    options?: { allowRename?: boolean }
  ) => void;
  onDragStart: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragEnd: () => void;
  getIconPath: (file: FileItem) => string;
  getDisplayName: (file: FileItem) => string;
  getFileType: (file: FileItem) => string;
  getListIconAlt: (file: FileItem) => string;
  shouldShowThumbnail: (file: FileItem) => boolean;
  isImageFile: (file: FileItem) => boolean;
}

export interface GridItemProps {
  file: FileItem;
  selectedFiles: string[];
  dropTargetPath: string | null;
  viewType: ViewType;
  onItemContextMenu?: (file: FileItem, e: React.MouseEvent) => void;
  onFileOpen: (file: FileItem, launchOrigin?: LaunchOriginRect) => void;
  onFileSelect: (
    file: FileItem,
    event: React.MouseEvent<HTMLElement>,
    options?: { allowRename?: boolean }
  ) => void;
  onDragStart: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLElement>, file: FileItem) => void;
  onDragEnd: () => void;
  getDisplayName: (file: FileItem) => string;
  shouldShowThumbnail: (file: FileItem) => boolean;
  isImageFile: (file: FileItem) => boolean;
}
