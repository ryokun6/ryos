import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { sortTracksLikeServerOrder } from "@/stores/ipodTrackOrder";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { SongsSnapshotData } from "@ryos/shared/contracts/sync-snapshots";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  mergeItemsById,
  type AnySnapshotData,
} from "./_shared";

function normalizeSongsTrackOrder(tracks: Track[]): Track[] {
  return sortTracksLikeServerOrder(tracks);
}

export function serializeSongsSnapshot(): SongsSnapshotData {
  const ipodState = useIpodStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  return {
    tracks: normalizeSongsTrackOrder(ipodState.tracks),
    libraryState: ipodState.libraryState,
    lastKnownVersion: ipodState.lastKnownVersion,
    deletedTrackIds: deletionMarkers.songTrackIds,
  };
}

export function applySongsSnapshot(data: SongsSnapshotData): void {
  const remoteDeletedTrackIds = normalizeDeletionMarkerMap(data.deletedTrackIds);
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedTrackIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.songTrackIds,
    remoteDeletedTrackIds
  );

  cloudSyncState.mergeDeletedKeys("songTrackIds", remoteDeletedTrackIds);

  useIpodStore.setState({
    tracks: normalizeSongsTrackOrder(
      filterDeletedIds(
        data.tracks as unknown as Track[],
        effectiveDeletedTrackIds,
        (track) => track.id
      )
    ),
    libraryState: data.libraryState,
    lastKnownVersion: data.lastKnownVersion,
  });
}

export function mergeSongsSnapshots(
  local: SongsSnapshotData,
  remote: SongsSnapshotData
): SongsSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedTrackIds),
    normalizeDeletionMarkerMap(remote.deletedTrackIds)
  );
  return {
    tracks: normalizeSongsTrackOrder(
      mergeItemsById(
        filterDeletedIds(local.tracks as unknown as Track[], mergedDeleted, (t) => t.id),
        filterDeletedIds(remote.tracks as unknown as Track[], mergedDeleted, (t) => t.id)
      )
    ),
    libraryState:
      local.libraryState === "loaded" || remote.libraryState === "loaded"
        ? "loaded"
        : local.libraryState,
    lastKnownVersion: Math.max(local.lastKnownVersion, remote.lastKnownVersion),
    deletedTrackIds: mergedDeleted,
  };
}

export function mergeSongsConflict(
  localData: AnySnapshotData,
  remoteData: AnySnapshotData
): SongsSnapshotData {
  return mergeSongsSnapshots(
    localData as SongsSnapshotData,
    remoteData as SongsSnapshotData
  );
}
