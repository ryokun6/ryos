import {
  useFilesStore,
  type FileSystemItem,
} from "@/stores/useFilesStore";
import { useShallow } from "zustand/react/shallow";

export function getFileMetadata(path: string): FileSystemItem | undefined {
  return useFilesStore.getState().getItem(path);
}

export function updateFileMetadata(
  path: string,
  updates: Partial<FileSystemItem>
): void {
  useFilesStore.getState().updateItemMetadata(path, updates);
}

export function getFileContentUuid(path: string): string | null {
  return getFileMetadata(path)?.uuid ?? null;
}

export function useFileMetadataInPath(path: string): FileSystemItem[] {
  return useFilesStore(useShallow((state) => state.getItemsInPath(path)));
}
