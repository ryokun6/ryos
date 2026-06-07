import { useMapsStore, type SavedPlace } from "@/stores/useMapsStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import type { MapsSnapshotData } from "@ryos/shared/contracts/sync-snapshots";
import {
  filterDeletedIds,
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
} from "@/utils/cloudSyncDeletionMarkers";
import { type AnySnapshotData } from "./_shared";

function normalizeSavedPlace(value: unknown): SavedPlace | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<SavedPlace>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.latitude !== "number" ||
    typeof candidate.longitude !== "number"
  ) {
    return null;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    subtitle:
      typeof candidate.subtitle === "string" ? candidate.subtitle : undefined,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    category:
      typeof candidate.category === "string" ? candidate.category : undefined,
  };
}

function normalizeSavedPlaceList(value: unknown): SavedPlace[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seenIds = new Set<string>();
  const normalized: SavedPlace[] = [];
  for (const entry of value) {
    const place = normalizeSavedPlace(entry);
    if (!place || seenIds.has(place.id)) {
      continue;
    }
    seenIds.add(place.id);
    normalized.push(place);
  }
  return normalized;
}

export function normalizeMapsSnapshot(
  data: MapsSnapshotData | null | undefined
): MapsSnapshotData {
  return {
    home: normalizeSavedPlace(data?.home ?? null),
    work: normalizeSavedPlace(data?.work ?? null),
    favorites: normalizeSavedPlaceList(data?.favorites),
    updatedAt:
      typeof data?.updatedAt === "number" && Number.isFinite(data.updatedAt)
        ? data.updatedAt
        : 0,
    deletedFavoriteIds: data?.deletedFavoriteIds,
  };
}

export function serializeMapsSnapshot(): MapsSnapshotData {
  const mapsState = useMapsStore.getState();
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;
  return {
    home: mapsState.home,
    work: mapsState.work,
    favorites: mapsState.favorites,
    updatedAt: mapsState.updatedAt || 0,
    deletedFavoriteIds: deletionMarkers.mapsFavoriteIds,
  };
}

export function applyMapsSnapshot(data: MapsSnapshotData): void {
  const normalized = normalizeMapsSnapshot(data);
  const remoteDeletedFavorites = normalizeDeletionMarkerMap(
    normalized.deletedFavoriteIds
  );
  const cloudSyncState = useCloudSyncStore.getState();
  const effectiveDeletedFavorites = mergeDeletionMarkerMaps(
    cloudSyncState.deletionMarkers.mapsFavoriteIds,
    remoteDeletedFavorites
  );

  cloudSyncState.mergeDeletedKeys("mapsFavoriteIds", remoteDeletedFavorites);

  useMapsStore.getState().replaceFromSync({
    home: normalized.home,
    work: normalized.work,
    favorites: filterDeletedIds(
      normalized.favorites as SavedPlace[],
      effectiveDeletedFavorites,
      (place) => place.id
    ),
  });
  useMapsStore.setState({
    updatedAt: Math.max(useMapsStore.getState().updatedAt || 0, normalized.updatedAt),
  });
}

export function mergeMapsSnapshots(
  local: MapsSnapshotData,
  remote: MapsSnapshotData
): MapsSnapshotData {
  const localNorm = normalizeMapsSnapshot(local);
  const remoteNorm = normalizeMapsSnapshot(remote);
  const mergedDeletedFavorites = mergeDeletionMarkerMaps(
    normalizeDeletionMarkerMap(localNorm.deletedFavoriteIds),
    normalizeDeletionMarkerMap(remoteNorm.deletedFavoriteIds)
  );

  const preferLocal = localNorm.updatedAt >= remoteNorm.updatedAt;
  const home = preferLocal ? localNorm.home : remoteNorm.home;
  const work = preferLocal ? localNorm.work : remoteNorm.work;

  const favoritesById = new Map<string, SavedPlace>();
  const favoritePass = preferLocal
    ? [localNorm.favorites, remoteNorm.favorites]
    : [remoteNorm.favorites, localNorm.favorites];
  for (const list of favoritePass) {
    for (const place of list) {
      if (mergedDeletedFavorites[place.id]) continue;
      if (!favoritesById.has(place.id)) {
        favoritesById.set(place.id, place as SavedPlace);
      }
    }
  }

  return {
    home,
    work,
    favorites: Array.from(favoritesById.values()),
    updatedAt: Math.max(localNorm.updatedAt, remoteNorm.updatedAt),
    deletedFavoriteIds: mergedDeletedFavorites,
  };
}

export function mergeMapsConflict(
  localData: AnySnapshotData,
  remoteData: AnySnapshotData
): MapsSnapshotData {
  return mergeMapsSnapshots(
    localData as MapsSnapshotData,
    remoteData as MapsSnapshotData
  );
}
