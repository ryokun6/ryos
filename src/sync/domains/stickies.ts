import { useStickiesStore, type StickyNote } from "@/stores/useStickiesStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { StickiesSnapshotData } from "@ryos/shared/contracts/sync-snapshots";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  mergeItemsByIdPreferNewer,
  type AnySnapshotData,
} from "./_shared";

export function serializeStickiesSnapshot(): StickiesSnapshotData {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  return {
    notes: useStickiesStore.getState().notes,
    deletedNoteIds: deletionMarkers.stickyNoteIds,
  };
}

export function applyStickiesSnapshot(data: StickiesSnapshotData): void {
  const remoteDeletedNoteIds = normalizeDeletionMarkerMap(data.deletedNoteIds);
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedNoteIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.stickyNoteIds,
    remoteDeletedNoteIds
  );

  cloudSyncState.mergeDeletedKeys("stickyNoteIds", remoteDeletedNoteIds);

  useStickiesStore.setState({
    notes: filterDeletedIds(
      data.notes as StickyNote[],
      effectiveDeletedNoteIds,
      (note) => note.id
    ),
  });
}

export function mergeStickiesSnapshots(
  local: StickiesSnapshotData,
  remote: StickiesSnapshotData
): StickiesSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedNoteIds),
    normalizeDeletionMarkerMap(remote.deletedNoteIds)
  );
  return {
    notes: mergeItemsByIdPreferNewer(
      local.notes as StickyNote[],
      remote.notes as StickyNote[],
      mergedDeleted
    ),
    deletedNoteIds: mergedDeleted,
  };
}

export function mergeStickiesConflict(
  localData: AnySnapshotData,
  remoteData: AnySnapshotData
): StickiesSnapshotData {
  return mergeStickiesSnapshots(
    localData as StickiesSnapshotData,
    remoteData as StickiesSnapshotData
  );
}
