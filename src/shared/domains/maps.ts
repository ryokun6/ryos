import {
  mergeDeletionMarkerMaps,
  normalizeDeletionMarkerMap,
  type DeletionMarkerMap,
} from "../../utils/cloudSyncDeletionMarkers";

export interface SavedPlaceDto {
  id: string;
  name: string;
  subtitle?: string;
  latitude: number;
  longitude: number;
  category?: string;
  placeId?: string;
}

export interface MapsSnapshotData {
  home: SavedPlaceDto | null;
  work: SavedPlaceDto | null;
  favorites: SavedPlaceDto[];
  updatedAt: number;
  deletedFavoriteIds?: DeletionMarkerMap;
}

export function isSavedPlaceDto(value: unknown): value is SavedPlaceDto {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<SavedPlaceDto>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.latitude === "number" &&
    Number.isFinite(candidate.latitude) &&
    typeof candidate.longitude === "number" &&
    Number.isFinite(candidate.longitude)
  );
}

export function normalizeSavedPlace(value: unknown): SavedPlaceDto | null {
  if (!isSavedPlaceDto(value)) {
    return null;
  }

  const candidate = value as Partial<SavedPlaceDto>;
  return {
    id: candidate.id!,
    name: candidate.name!,
    subtitle:
      typeof candidate.subtitle === "string" ? candidate.subtitle : undefined,
    latitude: candidate.latitude!,
    longitude: candidate.longitude!,
    category:
      typeof candidate.category === "string" ? candidate.category : undefined,
    placeId:
      typeof candidate.placeId === "string" ? candidate.placeId : undefined,
  };
}

export function normalizeSavedPlaceList(value: unknown): SavedPlaceDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();
  const normalized: SavedPlaceDto[] = [];
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

export function normalizeMapsSnapshotData(data: unknown): MapsSnapshotData {
  const snapshot =
    data && typeof data === "object"
      ? (data as Partial<MapsSnapshotData>)
      : {};

  return {
    home: normalizeSavedPlace(snapshot.home ?? null),
    work: normalizeSavedPlace(snapshot.work ?? null),
    favorites: normalizeSavedPlaceList(snapshot.favorites),
    updatedAt:
      typeof snapshot.updatedAt === "number" && Number.isFinite(snapshot.updatedAt)
        ? snapshot.updatedAt
        : 0,
    deletedFavoriteIds: normalizeDeletionMarkerMap(snapshot.deletedFavoriteIds),
  };
}

export function isMapsSnapshotData(value: unknown): value is MapsSnapshotData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    home?: unknown;
    work?: unknown;
    favorites?: unknown;
  };
  if (
    candidate.home !== null &&
    candidate.home !== undefined &&
    !isSavedPlaceDto(candidate.home)
  ) {
    return false;
  }
  if (
    candidate.work !== null &&
    candidate.work !== undefined &&
    !isSavedPlaceDto(candidate.work)
  ) {
    return false;
  }
  const favorites = candidate.favorites;
  if (favorites !== undefined) {
    if (!Array.isArray(favorites) || !favorites.every(isSavedPlaceDto)) {
      return false;
    }
  }
  return true;
}

export function mergeMapsSnapshots(
  local: MapsSnapshotData,
  remote: MapsSnapshotData
): MapsSnapshotData {
  const localNorm = normalizeMapsSnapshotData(local);
  const remoteNorm = normalizeMapsSnapshotData(remote);
  const mergedDeletedFavorites = mergeDeletionMarkerMaps(
    localNorm.deletedFavoriteIds,
    remoteNorm.deletedFavoriteIds
  );

  const preferLocal = localNorm.updatedAt >= remoteNorm.updatedAt;
  const home = preferLocal ? localNorm.home : remoteNorm.home;
  const work = preferLocal ? localNorm.work : remoteNorm.work;

  const favoritesById = new Map<string, SavedPlaceDto>();
  const favoritePass = preferLocal
    ? [localNorm.favorites, remoteNorm.favorites]
    : [remoteNorm.favorites, localNorm.favorites];
  for (const list of favoritePass) {
    for (const place of list) {
      if (mergedDeletedFavorites[place.id]) continue;
      if (!favoritesById.has(place.id)) {
        favoritesById.set(place.id, place);
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
