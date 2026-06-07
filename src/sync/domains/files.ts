import { STORES } from "@/utils/indexedDB";
import { useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  AUTO_SYNC_SNAPSHOT_VERSION,
} from "@/utils/cloudSyncShared";
import {
  buildFilesMetadataRedisPatch,
  getLocalDocumentKeysRequiredForFilesMetadataMerge,
  mergeFilesMetadataSnapshots,
  type FilesMetadataSyncSnapshot,
} from "@/utils/cloudSyncFileMerge";
import {
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  readAndSerializeStoreItemsByKeys,
  readStoreItems,
  restoreStoreItems,
  serializeStoreItems,
} from "@/utils/indexedDBBackup";
import type { PreparedCloudSyncDomainWrite } from "@/sync/types";
import {
  type AuthContext,
  type CustomWallpapersSnapshotData,
  type FilesMetadataSnapshotData,
  type FilesStoreSnapshotData,
  cacheRedisStateDomainSnapshot,
  createWriteSyncVersion,
  fetchRedisStateDomainSnapshot,
  getIndexedDbHandle,
  serializeStoreItemRecords,
  type AnySnapshotData,
} from "./_shared";

export async function serializeCustomWallpapersSnapshot(
  providedDb?: IDBDatabase
): Promise<CustomWallpapersSnapshotData> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  try {
    return await serializeStoreItems(
      await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
    );
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

export async function serializeCustomWallpapersRecords(
  providedDb?: IDBDatabase
) {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  try {
    return await serializeStoreItemRecords(
      await readStoreItems(db, STORES.CUSTOM_WALLPAPERS)
    );
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

export async function serializeIndexedDbStoreSnapshot(
  storeName: string,
  providedDb?: IDBDatabase
): Promise<FilesStoreSnapshotData> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);

  try {
    const items = await readStoreItems(db, storeName);
    return await serializeStoreItems(items);
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
}

export async function serializeIndexedDbStoreRecords(
  storeName: string,
  providedDb?: IDBDatabase
) {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);

  try {
    return await serializeStoreItemRecords(await readStoreItems(db, storeName));
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
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

export async function applyIndexedDbStoreSnapshot(
  storeName: string,
  data: FilesStoreSnapshotData,
  providedDb?: IDBDatabase
): Promise<void> {
  const { db, shouldClose } = await getIndexedDbHandle(providedDb);

  try {
    await restoreStoreItems(db, storeName, data);
  } finally {
    if (shouldClose) {
      db.close();
    }
  }
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

export function normalizeRemoteFilesMetadataSnapshot(
  data: unknown
): FilesMetadataSyncSnapshot {
  if (!data || typeof data !== "object") {
    return {
      items: {},
      libraryState: "uninitialized",
      documents: [],
      deletedPaths: {},
    };
  }
  const d = data as Record<string, unknown>;
  return {
    items: (d.items as Record<string, FileSystemItem>) || {},
    libraryState:
      (d.libraryState as FilesMetadataSyncSnapshot["libraryState"]) ||
      "uninitialized",
    documents: Array.isArray(d.documents)
      ? (d.documents as FilesMetadataSyncSnapshot["documents"])
      : [],
    deletedPaths: (d.deletedPaths as FilesMetadataSyncSnapshot["deletedPaths"]) || {},
  };
}

export async function prepareFilesMetadataDomainWrite(
  auth: AuthContext,
  providedDb?: IDBDatabase
): Promise<PreparedCloudSyncDomainWrite> {
  const domain = "files-metadata" as const;
  const filesState = useFilesStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  const remoteSnapshot = await fetchRedisStateDomainSnapshot(domain, auth);

  if (!remoteSnapshot?.data) {
    const data = await serializeFilesMetadataSnapshot(providedDb);
    const updatedAt = new Date().toISOString();
    const baseMetadata = useCloudSyncStore.getState().remoteMetadata[domain];
    return {
      domain,
      payload: {
        domain,
        data,
        updatedAt,
        version: AUTO_SYNC_SNAPSHOT_VERSION,
        syncVersion: createWriteSyncVersion(domain, baseMetadata),
      },
      onCommitted: async (metadata) => {
        cacheRedisStateDomainSnapshot(domain, auth, {
          data,
          metadata,
        });
      },
    };
  }

  const remoteData = normalizeRemoteFilesMetadataSnapshot(remoteSnapshot.data);
  const localSnapshotMinimal: FilesMetadataSyncSnapshot = {
    items: filesState.items,
    libraryState: filesState.libraryState,
    documents: [],
    deletedPaths: deletionMarkers.fileMetadataPaths,
  };

  const docKeys = getLocalDocumentKeysRequiredForFilesMetadataMerge(
    localSnapshotMinimal,
    remoteData
  );

  const { db, shouldClose } = await getIndexedDbHandle(providedDb);
  let merged: FilesMetadataSnapshotData;
  try {
    const localDocs = await readAndSerializeStoreItemsByKeys(
      db,
      STORES.DOCUMENTS,
      docKeys
    );
    const localSnapshot: FilesMetadataSyncSnapshot = {
      ...localSnapshotMinimal,
      documents: localDocs,
    };
    merged = mergeFilesMetadataSnapshots(localSnapshot, remoteData);
  } finally {
    if (shouldClose) {
      db.close();
    }
  }

  const patch = buildFilesMetadataRedisPatch(
    merged,
    remoteData,
    remoteSnapshot.metadata.updatedAt
  );

  if (!patch) {
    return {
      domain,
      skipRemoteWrite: true,
      committedMetadataFallback: remoteSnapshot.metadata,
      payload: {},
      onCommitted: async (metadata) => {
        cacheRedisStateDomainSnapshot(domain, auth, {
          data: merged,
          metadata,
        });
      },
    };
  }

  const updatedAt = new Date().toISOString();
  return {
    domain,
    payload: {
      domain,
      data: patch,
      updatedAt,
      version: AUTO_SYNC_SNAPSHOT_VERSION,
      syncVersion: createWriteSyncVersion(domain, remoteSnapshot.metadata),
    },
    onCommitted: async (metadata) => {
      cacheRedisStateDomainSnapshot(domain, auth, {
        data: merged,
        metadata,
      });
    },
  };
}

export function mergeFilesMetadataConflict(
  localData: AnySnapshotData,
  remoteData: AnySnapshotData
): FilesMetadataSnapshotData {
  return mergeFilesMetadataSnapshots(
    localData as FilesMetadataSnapshotData,
    remoteData as FilesMetadataSnapshotData
  );
}
