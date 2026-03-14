import type { DeletionMarkerMap } from "@/utils/cloudSyncDeletionMarkers";
import type { IndividualBlobKnownItemMap } from "@/utils/cloudSyncIndividualBlobState";

export interface IndividualBlobLocalRecord {
  item: {
    key: string;
  };
  signature: string;
}

export interface IndividualBlobRemoteItem {
  updatedAt: string;
  signature: string;
  size: number;
  storageUrl: string;
  downloadUrl?: string;
}

export interface IndividualBlobUploadPlan {
  itemsToUpload: IndividualBlobLocalRecord[];
  preservedRemoteItems: Record<string, IndividualBlobRemoteItem>;
  nextKnownItems: IndividualBlobKnownItemMap;
}

export interface IndividualBlobDownloadPlan {
  itemKeysToDownload: string[];
  keysToDelete: string[];
  nextKnownItems: IndividualBlobKnownItemMap;
}

function isDeleted(
  key: string,
  deletedItems: DeletionMarkerMap
): boolean {
  return Boolean(deletedItems[key]);
}

function hasLocalUnsyncedChange(
  localSignature: string,
  knownSignature: string | undefined
): boolean {
  return !knownSignature || knownSignature !== localSignature;
}

export function planIndividualBlobUpload(
  localRecords: IndividualBlobLocalRecord[],
  remoteItems: Record<string, IndividualBlobRemoteItem>,
  knownItems: IndividualBlobKnownItemMap,
  deletedItems: DeletionMarkerMap = {}
): IndividualBlobUploadPlan {
  const localRecordMap = new Map(localRecords.map((record) => [record.item.key, record]));
  const itemsToUpload: IndividualBlobLocalRecord[] = [];
  const preservedRemoteItems: Record<string, IndividualBlobRemoteItem> = {};
  const nextKnownItems: IndividualBlobKnownItemMap = {};

  for (const record of localRecords) {
    const key = record.item.key;
    if (isDeleted(key, deletedItems)) {
      continue;
    }

    const remoteItem = remoteItems[key];
    const knownItem = knownItems[key];
    const localChanged = hasLocalUnsyncedChange(record.signature, knownItem?.signature);

    if (remoteItem?.signature === record.signature) {
      preservedRemoteItems[key] = remoteItem;
      nextKnownItems[key] = {
        signature: record.signature,
        updatedAt: remoteItem.updatedAt,
      };
      continue;
    }

    if (!localChanged && remoteItem) {
      preservedRemoteItems[key] = remoteItem;
      if (knownItem) {
        nextKnownItems[key] = knownItem;
      }
      continue;
    }

    if (!localChanged && !remoteItem && knownItem) {
      nextKnownItems[key] = knownItem;
      continue;
    }

    itemsToUpload.push(record);
  }

  for (const [key, remoteItem] of Object.entries(remoteItems)) {
    if (localRecordMap.has(key) || isDeleted(key, deletedItems)) {
      continue;
    }

    if (knownItems[key]) {
      continue;
    }

    preservedRemoteItems[key] = remoteItem;
  }

  return {
    itemsToUpload,
    preservedRemoteItems,
    nextKnownItems,
  };
}

export function planIndividualBlobDownload(
  localRecords: IndividualBlobLocalRecord[],
  remoteItems: Record<string, IndividualBlobRemoteItem>,
  knownItems: IndividualBlobKnownItemMap,
  deletedItems: DeletionMarkerMap = {}
): IndividualBlobDownloadPlan {
  const localRecordMap = new Map(localRecords.map((record) => [record.item.key, record]));
  const itemKeysToDownload: string[] = [];
  const keysToDelete: string[] = [];
  const nextKnownItems: IndividualBlobKnownItemMap = {};

  for (const [key, remoteItem] of Object.entries(remoteItems)) {
    if (isDeleted(key, deletedItems)) {
      continue;
    }

    const localRecord = localRecordMap.get(key);
    const knownItem = knownItems[key];

    if (!localRecord) {
      if (knownItem) {
        nextKnownItems[key] = knownItem;
      } else {
        itemKeysToDownload.push(key);
      }
      continue;
    }

    if (localRecord.signature === remoteItem.signature) {
      nextKnownItems[key] = {
        signature: remoteItem.signature,
        updatedAt: remoteItem.updatedAt,
      };
      continue;
    }

    if (hasLocalUnsyncedChange(localRecord.signature, knownItem?.signature)) {
      if (knownItem) {
        nextKnownItems[key] = knownItem;
      }
      continue;
    }

    itemKeysToDownload.push(key);
  }

  for (const record of localRecords) {
    const key = record.item.key;
    if (key in remoteItems) {
      continue;
    }

    if (isDeleted(key, deletedItems)) {
      keysToDelete.push(key);
      continue;
    }

    const knownItem = knownItems[key];
    if (knownItem && knownItem.signature === record.signature) {
      keysToDelete.push(key);
      continue;
    }

    if (knownItem) {
      nextKnownItems[key] = knownItem;
    }
  }

  return {
    itemKeysToDownload,
    keysToDelete,
    nextKnownItems,
  };
}
