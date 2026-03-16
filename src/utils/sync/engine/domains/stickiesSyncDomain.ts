import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useStickiesStore, type StickyNote } from "@/stores/useStickiesStore";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import { mergeItemsByIdPreferNewer } from "@/utils/sync/engine/domains/entityMerge";

export interface StickiesSnapshotData {
  notes: StickyNote[];
  deletedNoteIds?: DeletionMarkerMap;
}

export function serializeStickiesSyncSnapshot(): StickiesSnapshotData {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  return {
    notes: useStickiesStore.getState().notes,
    deletedNoteIds: deletionMarkers.stickyNoteIds,
  };
}

export function applyStickiesSyncSnapshot(data: StickiesSnapshotData): void {
  const remoteDeletedNoteIds = normalizeDeletionMarkerMap(data.deletedNoteIds);
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedNoteIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.stickyNoteIds,
    remoteDeletedNoteIds
  );

  cloudSyncState.mergeDeletedKeys("stickyNoteIds", remoteDeletedNoteIds);

  useStickiesStore.setState({
    notes: filterDeletedIds(data.notes, effectiveDeletedNoteIds, (note) => note.id),
  });
}

export function mergeStickiesSyncSnapshots(
  local: StickiesSnapshotData,
  remote: StickiesSnapshotData
): StickiesSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedNoteIds),
    normalizeDeletionMarkerMap(remote.deletedNoteIds)
  );

  return {
    notes: mergeItemsByIdPreferNewer(local.notes, remote.notes, mergedDeleted),
    deletedNoteIds: mergedDeleted,
  };
}
