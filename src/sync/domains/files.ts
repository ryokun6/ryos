import { STORES } from "@/utils/indexedDB";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";
import {
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  mergeFilesMetadataSnapshots,
  type FilesMetadataSyncSnapshot,
} from "@/utils/cloudSyncFileMerge";
import {
  applyIndexedDbStoreSnapshot,
  serializeIndexedDbStoreSnapshot,
} from "@/sync/domains/blob-shared";
import type { IndexedDBStoreItemWithKey as StoreItemWithKey } from "@/utils/indexedDBBackup";

export type FilesStoreSnapshotData = StoreItemWithKey[];

export interface FilesMetadataSnapshotData {
  items: Record<string, FileSystemItem>;
  libraryState: "uninitialized" | "loaded" | "cleared";
  documents?: FilesStoreSnapshotData;
  deletedPaths?: DeletionMarkerMap;
}

export async function serializeFilesMetadataSnapshot(
  providedDb?: IDBDatabase
): Promise<FilesMetadataSnapshotData> {
  const filesState = useFilesStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    items: filesState.items,
    libraryState: filesState.libraryState,
    documents: await serializeIndexedDbStoreSnapshot(
      STORES.DOCUMENTS,
      providedDb
    ),
    deletedPaths: deletionMarkers.fileMetadataPaths,
  };
}

export async function applyFilesMetadataSnapshot(
  data: FilesMetadataSnapshotData,
  providedDb?: IDBDatabase
): Promise<void> {
  const remoteDeletedPaths = normalizeDeletionMarkerMap(data.deletedPaths);
  const cloudSyncState = useCloudSyncStore.getState();
  const localDeletedPaths = cloudSyncState.deletionMarkers.fileMetadataPaths;
  const localSnapshot: FilesMetadataSyncSnapshot = {
    items: useFilesStore.getState().items,
    libraryState: useFilesStore.getState().libraryState,
    documents: await serializeIndexedDbStoreSnapshot(STORES.DOCUMENTS, providedDb),
    deletedPaths: localDeletedPaths,
  };
  const mergedSnapshot = mergeFilesMetadataSnapshots(localSnapshot, {
    ...data,
    deletedPaths: remoteDeletedPaths,
  });
  const effectiveDeletedPaths = mergeDeletionMarkerMaps(
    localDeletedPaths,
    remoteDeletedPaths
  );
  const prunedDeletedPaths = Object.keys(effectiveDeletedPaths).filter(
    (path) => !mergedSnapshot.deletedPaths?.[path]
  );

  cloudSyncState.mergeDeletedKeys("fileMetadataPaths", remoteDeletedPaths);
  cloudSyncState.clearDeletedKeys("fileMetadataPaths", prunedDeletedPaths);

  useFilesStore.setState({
    items: mergedSnapshot.items,
    libraryState: mergedSnapshot.libraryState,
  });

  await applyIndexedDbStoreSnapshot(
    STORES.DOCUMENTS,
    mergedSnapshot.documents || [],
    providedDb
  );
}
