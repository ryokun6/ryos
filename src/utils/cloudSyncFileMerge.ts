import type { FileSystemItem } from "@/stores/useFilesStore";
import {
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import { parseCloudSyncTimestamp } from "@/utils/cloudSyncShared";

export interface CloudSyncStoreItem {
  key: string;
  value: Record<string, unknown>;
}

export interface FilesMetadataSyncSnapshot {
  items: Record<string, FileSystemItem>;
  libraryState: "uninitialized" | "loaded" | "cleared";
  documents?: CloudSyncStoreItem[];
  deletedPaths?: DeletionMarkerMap;
}

type ItemSource = "local" | "remote";

function getFileItemTimestamp(item: Pick<FileSystemItem, "modifiedAt" | "createdAt"> | null | undefined): number {
  return Math.max(item?.modifiedAt ?? 0, item?.createdAt ?? 0);
}

function getDeletedAtForPath(path: string, deletedPaths: DeletionMarkerMap): number {
  let latestDeletedAt = 0;

  for (const [deletedPath, deletedAt] of Object.entries(deletedPaths)) {
    if (deletedPath === path || (deletedPath !== "/" && path.startsWith(`${deletedPath}/`))) {
      latestDeletedAt = Math.max(latestDeletedAt, parseCloudSyncTimestamp(deletedAt));
    }
  }

  return latestDeletedAt;
}

function survivesDeletionMarker(
  path: string,
  item: FileSystemItem | null | undefined,
  deletedPaths: DeletionMarkerMap
): item is FileSystemItem {
  if (!item) {
    return false;
  }

  return getFileItemTimestamp(item) > getDeletedAtForPath(path, deletedPaths);
}

function chooseWinningItem(
  path: string,
  localItem: FileSystemItem | undefined,
  remoteItem: FileSystemItem | undefined,
  deletedPaths: DeletionMarkerMap
): { item: FileSystemItem; source: ItemSource } | null {
  const candidates: Array<{ item: FileSystemItem; source: ItemSource; ts: number }> = [];

  if (survivesDeletionMarker(path, localItem, deletedPaths)) {
    candidates.push({
      item: localItem,
      source: "local",
      ts: getFileItemTimestamp(localItem),
    });
  }

  if (survivesDeletionMarker(path, remoteItem, deletedPaths)) {
    candidates.push({
      item: remoteItem,
      source: "remote",
      ts: getFileItemTimestamp(remoteItem),
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    if (right.ts !== left.ts) {
      return right.ts - left.ts;
    }

    return left.source === "local" ? -1 : 1;
  });

  return {
    item: candidates[0].item,
    source: candidates[0].source,
  };
}

function pruneRecreatedDeletedPaths(
  items: Record<string, FileSystemItem>,
  deletedPaths: DeletionMarkerMap
): DeletionMarkerMap {
  return Object.fromEntries(
    Object.entries(deletedPaths).filter(([deletedPath, deletedAt]) => {
      const recreatedItem = items[deletedPath];
      if (!recreatedItem) {
        return true;
      }

      return getFileItemTimestamp(recreatedItem) <= parseCloudSyncTimestamp(deletedAt);
    })
  );
}

function resolveMergedLibraryState(
  localState: FilesMetadataSyncSnapshot["libraryState"],
  remoteState: FilesMetadataSyncSnapshot["libraryState"],
  mergedItems: Record<string, FileSystemItem>
): FilesMetadataSyncSnapshot["libraryState"] {
  if (Object.keys(mergedItems).length > 0 || localState === "loaded" || remoteState === "loaded") {
    return "loaded";
  }

  if (localState === "cleared" || remoteState === "cleared") {
    return "cleared";
  }

  return "uninitialized";
}

function isDocumentFile(item: FileSystemItem): item is FileSystemItem & { uuid: string } {
  return (
    !item.isDirectory &&
    item.path.startsWith("/Documents/") &&
    typeof item.uuid === "string" &&
    item.uuid.length > 0
  );
}

function computeMergedFilesMetadataItemPhase(
  localSnapshot: FilesMetadataSyncSnapshot,
  remoteSnapshot: FilesMetadataSyncSnapshot
): {
  mergedItems: Record<string, FileSystemItem>;
  winningSources: Map<string, ItemSource>;
  mergedDeletedPaths: DeletionMarkerMap;
  libraryState: FilesMetadataSyncSnapshot["libraryState"];
} {
  const localDeletedPaths = normalizeDeletionMarkerMap(localSnapshot.deletedPaths);
  const remoteDeletedPaths = normalizeDeletionMarkerMap(remoteSnapshot.deletedPaths);
  const mergedDeletedCandidates = mergeDeletionMarkerMaps(
    localDeletedPaths,
    remoteDeletedPaths
  );
  const mergedItems: Record<string, FileSystemItem> = {};
  const winningSources = new Map<string, ItemSource>();

  for (const path of Array.from(
    new Set([
      ...Object.keys(localSnapshot.items),
      ...Object.keys(remoteSnapshot.items),
    ])
  ).sort()) {
    const winner = chooseWinningItem(
      path,
      localSnapshot.items[path],
      remoteSnapshot.items[path],
      mergedDeletedCandidates
    );

    if (!winner) {
      continue;
    }

    mergedItems[path] = winner.item;
    winningSources.set(path, winner.source);
  }

  const mergedDeletedPaths = pruneRecreatedDeletedPaths(
    mergedItems,
    mergedDeletedCandidates
  );

  return {
    mergedItems,
    winningSources,
    mergedDeletedPaths,
    libraryState: resolveMergedLibraryState(
      localSnapshot.libraryState,
      remoteSnapshot.libraryState,
      mergedItems
    ),
  };
}

function buildMergedFilesMetadataDocuments(
  mergedItems: Record<string, FileSystemItem>,
  winningSources: Map<string, ItemSource>,
  localDocuments: Map<string, CloudSyncStoreItem>,
  remoteDocuments: Map<string, CloudSyncStoreItem>
): CloudSyncStoreItem[] {
  const mergedDocuments: CloudSyncStoreItem[] = [];
  const includedDocumentKeys = new Set<string>();

  for (const [path, item] of Object.entries(mergedItems).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    if (!isDocumentFile(item)) {
      continue;
    }

    const preferredDocuments =
      winningSources.get(path) === "remote" ? remoteDocuments : localDocuments;
    const documentItem =
      preferredDocuments.get(item.uuid) ||
      localDocuments.get(item.uuid) ||
      remoteDocuments.get(item.uuid);

    if (!documentItem || includedDocumentKeys.has(documentItem.key)) {
      continue;
    }

    mergedDocuments.push(documentItem);
    includedDocumentKeys.add(documentItem.key);
  }

  return mergedDocuments;
}

/** UUIDs of /Documents/* files whose winning merge side is local (need IndexedDB load). */
export function getLocalDocumentKeysRequiredForFilesMetadataMerge(
  localSnapshot: FilesMetadataSyncSnapshot,
  remoteSnapshot: FilesMetadataSyncSnapshot
): string[] {
  const { mergedItems, winningSources } = computeMergedFilesMetadataItemPhase(
    localSnapshot,
    remoteSnapshot
  );
  const keys = new Set<string>();
  for (const [path, item] of Object.entries(mergedItems)) {
    if (winningSources.get(path) === "local" && isDocumentFile(item)) {
      keys.add(item.uuid);
    }
  }
  return [...keys];
}

export function mergeFilesMetadataSnapshots(
  localSnapshot: FilesMetadataSyncSnapshot,
  remoteSnapshot: FilesMetadataSyncSnapshot
): FilesMetadataSyncSnapshot {
  const localDocuments = new Map((localSnapshot.documents || []).map((item) => [item.key, item]));
  const remoteDocuments = new Map(
    (remoteSnapshot.documents || []).map((item) => [item.key, item])
  );
  const { mergedItems, winningSources, mergedDeletedPaths, libraryState } =
    computeMergedFilesMetadataItemPhase(localSnapshot, remoteSnapshot);

  return {
    items: mergedItems,
    libraryState,
    documents: buildMergedFilesMetadataDocuments(
      mergedItems,
      winningSources,
      localDocuments,
      remoteDocuments
    ),
    deletedPaths: mergedDeletedPaths,
  };
}

export interface FilesMetadataRedisPatchPayload {
  filesMetadataPatch: true;
  baseUpdatedAt: string;
  itemPathsRemoved?: string[];
  items?: Record<string, FileSystemItem>;
  documentKeysRemoved?: string[];
  documents?: CloudSyncStoreItem[];
  deletedPaths?: DeletionMarkerMap;
  libraryState?: FilesMetadataSyncSnapshot["libraryState"];
}

export function isFilesMetadataRedisPatchPayload(
  value: unknown
): value is FilesMetadataRedisPatchPayload {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as FilesMetadataRedisPatchPayload).filesMetadataPatch === true &&
    typeof (value as FilesMetadataRedisPatchPayload).baseUpdatedAt === "string"
  );
}

/** Build a minimal Redis patch from merged snapshot vs remote. Returns null if nothing changed. */
export function buildFilesMetadataRedisPatch(
  merged: FilesMetadataSyncSnapshot,
  remote: FilesMetadataSyncSnapshot,
  baseUpdatedAt: string
): FilesMetadataRedisPatchPayload | null {
  const itemPathsRemoved = Object.keys(remote.items || {}).filter(
    (p) => !merged.items[p]
  );
  const items: Record<string, FileSystemItem> = {};
  for (const [p, item] of Object.entries(merged.items)) {
    const prev = remote.items?.[p];
    if (!prev || JSON.stringify(prev) !== JSON.stringify(item)) {
      items[p] = item;
    }
  }

  const rDocs = new Map((remote.documents || []).map((d) => [d.key, d]));
  const mDocs = new Map((merged.documents || []).map((d) => [d.key, d]));
  const documentKeysRemoved = [...rDocs.keys()].filter((k) => !mDocs.has(k));
  const documents: CloudSyncStoreItem[] = [];
  for (const d of mDocs.values()) {
    const rd = rDocs.get(d.key);
    if (!rd || JSON.stringify(rd) !== JSON.stringify(d)) {
      documents.push(d);
    }
  }

  const delChanged =
    JSON.stringify(merged.deletedPaths || {}) !==
    JSON.stringify(remote.deletedPaths || {});
  const libChanged = merged.libraryState !== remote.libraryState;

  if (
    itemPathsRemoved.length === 0 &&
    Object.keys(items).length === 0 &&
    documentKeysRemoved.length === 0 &&
    documents.length === 0 &&
    !delChanged &&
    !libChanged
  ) {
    return null;
  }

  return {
    filesMetadataPatch: true,
    baseUpdatedAt,
    ...(itemPathsRemoved.length > 0 ? { itemPathsRemoved } : {}),
    ...(Object.keys(items).length > 0 ? { items } : {}),
    ...(documentKeysRemoved.length > 0 ? { documentKeysRemoved } : {}),
    ...(documents.length > 0 ? { documents } : {}),
    ...(delChanged ? { deletedPaths: merged.deletedPaths } : {}),
    ...(libChanged ? { libraryState: merged.libraryState } : {}),
  };
}

export function applyFilesMetadataRedisPatch(
  remote: FilesMetadataSyncSnapshot,
  patch: FilesMetadataRedisPatchPayload
): FilesMetadataSyncSnapshot {
  const items: Record<string, FileSystemItem> = { ...(remote.items || {}) };
  for (const p of patch.itemPathsRemoved || []) {
    delete items[p];
  }
  if (patch.items) {
    Object.assign(items, patch.items);
  }

  const docMap = new Map((remote.documents || []).map((d) => [d.key, d]));
  for (const k of patch.documentKeysRemoved || []) {
    docMap.delete(k);
  }
  for (const d of patch.documents || []) {
    docMap.set(d.key, d);
  }

  return {
    items,
    libraryState: patch.libraryState ?? remote.libraryState,
    documents: [...docMap.values()],
    deletedPaths:
      patch.deletedPaths !== undefined
        ? normalizeDeletionMarkerMap(patch.deletedPaths)
        : normalizeDeletionMarkerMap(remote.deletedPaths),
  };
}
