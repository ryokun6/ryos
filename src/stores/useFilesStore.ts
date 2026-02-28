/**
 * Public entrypoint for the files store.
 * Re-exports the store, types, and standalone functions.
 */

export { useFilesStore } from "./files-store/slice";
export type { FileSystemItem } from "./files-store/types";
export { preloadFileSystemData } from "./files-store/repository";
export { ensureFileContentLoaded } from "./files-store/service";
