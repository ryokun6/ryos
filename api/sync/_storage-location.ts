export interface StoredObjectLocation {
  storageUrl?: string | null;
  blobUrl?: string | null;
}

export function getStoredLocation(value: StoredObjectLocation): string | null {
  return value.storageUrl || value.blobUrl || null;
}
