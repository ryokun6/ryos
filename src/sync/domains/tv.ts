import { useTvStore, type CustomChannel } from "@/stores/useTvStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { TvSnapshotData } from "@ryos/shared/contracts/sync-snapshots";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import {
  beginApplyingRemoteDomain,
  endApplyingRemoteDomain,
} from "@/utils/cloudSyncRemoteApplyState";
import {
  mergeItemsById,
  parseSyncTimestamp,
  type AnySnapshotData,
} from "./_shared";

export function serializeTvSnapshot(): TvSnapshotData {
  const tvState = useTvStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  return {
    customChannels: tvState.customChannels,
    hiddenDefaultChannelIds: tvState.hiddenDefaultChannelIds,
    hiddenDefaultChannelIdsUpdatedAt: tvState.hiddenDefaultChannelIdsUpdatedAt,
    hiddenDefaultChannelIdsResetAt: tvState.hiddenDefaultChannelIdsResetAt,
    deletedCustomChannelIds: deletionMarkers.tvCustomChannelIds,
    lcdFilterOn: tvState.lcdFilterOn,
    closedCaptionsOn: tvState.closedCaptionsOn,
  };
}

export function applyTvSnapshot(data: TvSnapshotData): void {
  const remoteDeletedChannelIds = normalizeDeletionMarkerMap(
    data.deletedCustomChannelIds
  );
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedChannelIds = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.tvCustomChannelIds,
    remoteDeletedChannelIds
  );

  cloudSyncState.mergeDeletedKeys("tvCustomChannelIds", remoteDeletedChannelIds);

  useTvStore.setState({
    customChannels: filterDeletedIds(
      Array.isArray(data.customChannels) ? (data.customChannels as unknown as CustomChannel[]) : [],
      effectiveDeletedChannelIds,
      (channel) => channel.id
    ),
    hiddenDefaultChannelIds: Array.isArray(data.hiddenDefaultChannelIds)
      ? data.hiddenDefaultChannelIds
      : [],
    hiddenDefaultChannelIdsUpdatedAt:
      typeof data.hiddenDefaultChannelIdsUpdatedAt === "string"
        ? data.hiddenDefaultChannelIdsUpdatedAt
        : null,
    hiddenDefaultChannelIdsResetAt:
      typeof data.hiddenDefaultChannelIdsResetAt === "string"
        ? data.hiddenDefaultChannelIdsResetAt
        : null,
    lcdFilterOn: data.lcdFilterOn ?? true,
    closedCaptionsOn: data.closedCaptionsOn ?? true,
  });
}

export async function applyTvSnapshotWithGuard(data: TvSnapshotData): Promise<void> {
  beginApplyingRemoteDomain("tv");
  try {
    applyTvSnapshot(data);
  } finally {
    endApplyingRemoteDomain("tv");
  }
}

export function mergeTvSnapshots(
  local: TvSnapshotData,
  remote: TvSnapshotData
): TvSnapshotData {
  const mergedDeleted = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(local.deletedCustomChannelIds),
    normalizeDeletionMarkerMap(remote.deletedCustomChannelIds)
  );
  const localHiddenUpdatedAt = parseSyncTimestamp(
    local.hiddenDefaultChannelIdsUpdatedAt
  );
  const remoteHiddenUpdatedAt = parseSyncTimestamp(
    remote.hiddenDefaultChannelIdsUpdatedAt
  );
  const localResetAt = parseSyncTimestamp(local.hiddenDefaultChannelIdsResetAt);
  const remoteResetAt = parseSyncTimestamp(remote.hiddenDefaultChannelIdsResetAt);
  const hiddenDefaultChannelIds =
    localResetAt > remoteHiddenUpdatedAt && localResetAt >= remoteResetAt
      ? local.hiddenDefaultChannelIds || []
      : remoteResetAt > localHiddenUpdatedAt && remoteResetAt > localResetAt
        ? remote.hiddenDefaultChannelIds || []
        : Array.from(
            new Set([
              ...(local.hiddenDefaultChannelIds || []),
              ...(remote.hiddenDefaultChannelIds || []),
            ])
          );
  const hiddenDefaultChannelIdsUpdatedAt =
    localHiddenUpdatedAt >= remoteHiddenUpdatedAt
      ? local.hiddenDefaultChannelIdsUpdatedAt ?? null
      : remote.hiddenDefaultChannelIdsUpdatedAt ?? null;
  const hiddenDefaultChannelIdsResetAt =
    localResetAt >= remoteResetAt
      ? local.hiddenDefaultChannelIdsResetAt ?? null
      : remote.hiddenDefaultChannelIdsResetAt ?? null;
  return {
    customChannels: mergeItemsById(
      filterDeletedIds(
        (local.customChannels || []) as unknown as CustomChannel[],
        mergedDeleted,
        (channel) => channel.id
      ),
      filterDeletedIds(
        (remote.customChannels || []) as unknown as CustomChannel[],
        mergedDeleted,
        (channel) => channel.id
      )
    ),
    hiddenDefaultChannelIds,
    hiddenDefaultChannelIdsUpdatedAt,
    hiddenDefaultChannelIdsResetAt,
    deletedCustomChannelIds: mergedDeleted,
    lcdFilterOn: local.lcdFilterOn,
    closedCaptionsOn: local.closedCaptionsOn,
  };
}

export function mergeTvConflict(
  localData: AnySnapshotData,
  remoteData: AnySnapshotData
): TvSnapshotData {
  return mergeTvSnapshots(localData as TvSnapshotData, remoteData as TvSnapshotData);
}
