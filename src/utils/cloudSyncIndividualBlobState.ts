import type { IndividualBlobSyncDomain } from "@/utils/cloudSyncShared";
import {
  normalizeCloudSyncRevision,
  type CloudSyncRevision,
} from "@/utils/cloudSyncRevision";

export interface IndividualBlobKnownItem {
  signature: string;
  updatedAt: string;
  revision?: CloudSyncRevision;
}

export type IndividualBlobKnownItemMap = Record<string, IndividualBlobKnownItem>;

interface IndividualBlobSyncState {
  "files-images": IndividualBlobKnownItemMap;
  "custom-wallpapers": IndividualBlobKnownItemMap;
}

const STORAGE_KEY = "ryos:cloud-sync:individual-blob-state";

function createEmptyIndividualBlobSyncState(): IndividualBlobSyncState {
  return {
    "files-images": {},
    "custom-wallpapers": {},
  };
}

function normalizeKnownItemMap(value: unknown): IndividualBlobKnownItemMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
      ([key, item]) =>
        typeof key === "string" &&
        key.length > 0 &&
        typeof item === "object" &&
        item !== null &&
        typeof (item as IndividualBlobKnownItem).signature === "string" &&
        typeof (item as IndividualBlobKnownItem).updatedAt === "string"
      )
      .map(([key, item]) => {
        const revision = normalizeCloudSyncRevision(
          (item as IndividualBlobKnownItem).revision
        );

        return [
          key,
          {
            signature: (item as IndividualBlobKnownItem).signature,
            updatedAt: (item as IndividualBlobKnownItem).updatedAt,
            ...(revision ? { revision } : {}),
          },
        ] as const;
      })
  ) as IndividualBlobKnownItemMap;
}

function readIndividualBlobSyncState(): IndividualBlobSyncState {
  if (typeof localStorage === "undefined") {
    return createEmptyIndividualBlobSyncState();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyIndividualBlobSyncState();
    }

    const parsed = JSON.parse(raw) as Partial<Record<IndividualBlobSyncDomain, unknown>>;
    return {
      "files-images": normalizeKnownItemMap(parsed["files-images"]),
      "custom-wallpapers": normalizeKnownItemMap(parsed["custom-wallpapers"]),
    };
  } catch {
    return createEmptyIndividualBlobSyncState();
  }
}

export function getIndividualBlobKnownItems(
  domain: IndividualBlobSyncDomain
): IndividualBlobKnownItemMap {
  return readIndividualBlobSyncState()[domain];
}

export function setIndividualBlobKnownItems(
  domain: IndividualBlobSyncDomain,
  items: IndividualBlobKnownItemMap
): void {
  if (typeof localStorage === "undefined") {
    return;
  }

  const state = readIndividualBlobSyncState();
  state[domain] = items;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
