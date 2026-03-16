import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import { mergeItemsById } from "@/utils/sync/engine/domains/entityMerge";

export interface SongsSnapshotData {
  tracks: Track[];
  libraryState: "uninitialized" | "loaded" | "cleared";
  lastKnownVersion: number;
  deletedTrackIds?: DeletionMarkerMap;
}

export function serializeSongsSyncSnapshot(): SongsSnapshotData {
  const ipodState = useIpodStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    tracks: ipodState.tracks,
    libraryState: ipodState.libraryState,
    lastKnownVersion: ipodState.lastKnownVersion,
    deletedTrackIds: deletionMarkers.songTrackIds,
  };
}

export function applySongsSyncSnapshot(data: SongsSnapshotData): void {
  const remoteDeletedTrackIds = normalizeDeletionMarkerMap(data.deletedTrackIds);
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedTrackIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.songTrackIds,
    remoteDeletedTrackIds
  );

  cloudSyncState.mergeDeletedKeys("songTrackIds", remoteDeletedTrackIds);

  useIpodStore.setState({
    tracks: filterDeletedIds(data.tracks, effectiveDeletedTrackIds, (track) => track.id),
    libraryState: data.libraryState,
    lastKnownVersion: data.lastKnownVersion,
  });
}

export function mergeSongsSyncSnapshots(
  local: SongsSnapshotData,
  remote: SongsSnapshotData
): SongsSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedTrackIds),
    normalizeDeletionMarkerMap(remote.deletedTrackIds)
  );

  return {
    tracks: mergeItemsById(
      filterDeletedIds(local.tracks, mergedDeleted, (track) => track.id),
      filterDeletedIds(remote.tracks, mergedDeleted, (track) => track.id)
    ),
    libraryState:
      local.libraryState === "loaded" || remote.libraryState === "loaded"
        ? "loaded"
        : local.libraryState,
    lastKnownVersion: Math.max(local.lastKnownVersion, remote.lastKnownVersion),
    deletedTrackIds: mergedDeleted,
  };
}
