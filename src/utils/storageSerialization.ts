import {
  listStorageItems,
  putStorageItem,
  StorageItemWithKey,
  StorageRecord,
  clearStorageStore,
} from "@/utils/opfsStorage";

export type SerializedStorageValue = Record<string, unknown>;
export type SerializedStorageItem = StorageItemWithKey<SerializedStorageValue>;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [metadata, base64] = dataUrl.split(",", 2);
  const mimeMatch = metadata.match(/^data:(.*?);base64$/);
  const mimeType = mimeMatch?.[1] || "application/octet-stream";
  return new Blob([base64ToUint8Array(base64)], { type: mimeType });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mimeType = blob.type || "application/octet-stream";
  return `data:${mimeType};base64,${uint8ArrayToBase64(bytes)}`;
}

export async function serializeStorageItem(
  item: StorageItemWithKey
): Promise<SerializedStorageItem> {
  const serializedValue: SerializedStorageValue = {
    ...(item.value as Record<string, unknown>),
  };

  for (const [fieldName, fieldValue] of Object.entries(
    item.value as Record<string, unknown>
  )) {
    if (!(typeof Blob !== "undefined" && fieldValue instanceof Blob)) {
      continue;
    }

    serializedValue[fieldName] = await blobToDataUrl(fieldValue);
    serializedValue[`_isBlob_${fieldName}`] = true;
  }

  return {
    key: item.key,
    value: serializedValue,
  };
}

export async function serializeStorageItems(
  items: StorageItemWithKey[]
): Promise<SerializedStorageItem[]> {
  return Promise.all(items.map((item) => serializeStorageItem(item)));
}

export function deserializeStorageItem(
  item: SerializedStorageItem
): Record<string, unknown> {
  const restoredValue: Record<string, unknown> = {
    ...item.value,
  };

  for (const [fieldName, fieldValue] of Object.entries(item.value)) {
    const blobFlagKey = `_isBlob_${fieldName}`;
    if (item.value[blobFlagKey] !== true || typeof fieldValue !== "string") {
      continue;
    }

    restoredValue[fieldName] = dataUrlToBlob(fieldValue);
    delete restoredValue[blobFlagKey];
  }

  return restoredValue;
}

export async function readSerializedStorageStoreItems(
  storeName: string
): Promise<SerializedStorageItem[]> {
  return serializeStorageItems(await listStorageItems(storeName));
}

export async function restoreSerializedStorageStoreItems(
  storeName: string,
  items: SerializedStorageItem[]
): Promise<void> {
  await clearStorageStore(storeName);

  for (const item of items) {
    await putStorageItem(
      storeName,
      deserializeStorageItem(item) as StorageRecord,
      item.key
    );
  }
}
