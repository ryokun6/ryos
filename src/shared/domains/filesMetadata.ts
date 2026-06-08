export type FilesMetadataLibraryState = "uninitialized" | "loaded" | "cleared";

export interface CloudSyncStoreItem {
  key: string;
  value: Record<string, unknown>;
}

export interface FilesMetadataSnapshotData<
  TItem = Record<string, unknown>,
  TDeletedPaths extends Record<string, string> = Record<string, string>
> {
  items: Record<string, TItem>;
  libraryState: FilesMetadataLibraryState;
  documents: CloudSyncStoreItem[];
  deletedPaths: TDeletedPaths;
}

export function normalizeFilesMetadataSnapshotData<
  TItem = Record<string, unknown>,
  TDeletedPaths extends Record<string, string> = Record<string, string>
>(data: unknown): FilesMetadataSnapshotData<TItem, TDeletedPaths> {
  if (!data || typeof data !== "object") {
    return {
      items: {},
      libraryState: "uninitialized",
      documents: [],
      deletedPaths: {} as TDeletedPaths,
    };
  }

  const snapshot = data as Record<string, unknown>;

  return {
    items: (snapshot.items as Record<string, TItem>) || {},
    libraryState:
      (snapshot.libraryState as FilesMetadataLibraryState) || "uninitialized",
    documents: Array.isArray(snapshot.documents)
      ? (snapshot.documents as CloudSyncStoreItem[])
      : [],
    deletedPaths:
      (snapshot.deletedPaths as TDeletedPaths | undefined) ||
      ({} as TDeletedPaths),
  };
}
