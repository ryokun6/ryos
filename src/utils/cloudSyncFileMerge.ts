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

export function mergeFilesMetadataSnapshots(
  localSnapshot: FilesMetadataSyncSnapshot,
  remoteSnapshot: FilesMetadataSyncSnapshot
): FilesMetadataSyncSnapshot {
  const localDeletedPaths = normalizeDeletionMarkerMap(localSnapshot.deletedPaths);
  const remoteDeletedPaths = normalizeDeletionMarkerMap(remoteSnapshot.deletedPaths);
  const mergedDeletedCandidates = mergeDeletionMarkerMaps(
    localDeletedPaths,
    remoteDeletedPaths
  );
  const mergedItems: Record<string, FileSystemItem> = {};
  const winningSources = new Map<string, ItemSource>();
  const localDocuments = new Map((localSnapshot.documents || []).map((item) => [item.key, item]));
  const remoteDocuments = new Map(
    (remoteSnapshot.documents || []).map((item) => [item.key, item])
  );

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

  return {
    items: mergedItems,
    libraryState: resolveMergedLibraryState(
      localSnapshot.libraryState,
      remoteSnapshot.libraryState,
      mergedItems
    ),
    documents: mergedDocuments,
    deletedPaths: mergedDeletedPaths,
  };
}
