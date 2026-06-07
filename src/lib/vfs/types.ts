export type { FileSystemItem } from "@/stores/useFilesStore";

/** Content blob stored in IndexedDB (keyed by file UUID). */
export interface DocumentContent {
  name: string;
  content: string | Blob;
  contentUrl?: string;
}

/** Display-layer file item used by Finder and open-with routing. */
export interface VfsDisplayFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  icon?: string;
  type?: string;
  appId?: string;
  content?: string | Blob;
  contentUrl?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  originalPath?: string;
  deletedAt?: number;
  status?: "active" | "trashed";
  modifiedAt?: Date;
}
