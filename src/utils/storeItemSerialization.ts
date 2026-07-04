/**
 * Pure (de)serialization for IndexedDB store items: Blob/ArrayBuffer fields
 * are converted to base64 data strings and back. Dependency-free so it can
 * run inside the cloud sync Web Worker as well as the main thread (manual
 * backup, sync codecs).
 */

export interface IndexedDBStoreItem {
  [key: string]: unknown;
}

export interface IndexedDBStoreItemWithKey {
  key: string;
  value: IndexedDBStoreItem;
}

export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    let chunk = "";
    const end = Math.min(offset + chunkSize, bytes.length);
    for (let index = offset; index < end; index += 1) {
      chunk += String.fromCharCode(bytes[index]);
    }
    chunks.push(chunk);
  }
  return btoa(chunks.join(""));
};

export const blobToBase64 = async (blob: Blob): Promise<string> => {
  const base64 = arrayBufferToBase64(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${base64}`;
};

export const base64ToBlob = (dataUrl: string): Blob => {
  const [meta, base64] = dataUrl.split(",");
  const mimeMatch = meta.match(/data:(.*);base64/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(base64);
  const array = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Blob([array], { type: mime });
};

export const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
};

export async function serializeStoreItem(
  item: IndexedDBStoreItemWithKey
): Promise<IndexedDBStoreItemWithKey> {
  const serializedValue: Record<string, unknown> = {
    ...item.value,
  };

  for (const key of Object.keys(item.value)) {
    if (item.value[key] instanceof Blob) {
      serializedValue[key] = await blobToBase64(item.value[key] as Blob);
      serializedValue[`_isBlob_${key}`] = true;
    } else if (item.value[key] instanceof ArrayBuffer) {
      serializedValue[key] = arrayBufferToBase64(
        item.value[key] as ArrayBuffer
      );
      serializedValue[`_isArrayBuffer_${key}`] = true;
    }
  }

  return {
    key: item.key,
    value: serializedValue,
  };
}

export async function serializeStoreItems(
  items: IndexedDBStoreItemWithKey[]
): Promise<IndexedDBStoreItemWithKey[]> {
  return Promise.all(items.map((item) => serializeStoreItem(item)));
}

export function deserializeStoreItem(
  item: IndexedDBStoreItemWithKey
): Record<string, unknown> {
  const restoredValue: Record<string, unknown> = {
    ...item.value,
  };

  for (const key of Object.keys(item.value)) {
    const isBlobKey = `_isBlob_${key}`;
    if (item.value[isBlobKey] === true && typeof item.value[key] === "string") {
      restoredValue[key] = base64ToBlob(item.value[key] as string);
      delete restoredValue[isBlobKey];
    }
    const isArrayBufferKey = `_isArrayBuffer_${key}`;
    if (
      item.value[isArrayBufferKey] === true &&
      typeof item.value[key] === "string"
    ) {
      restoredValue[key] = base64ToArrayBuffer(item.value[key] as string);
      delete restoredValue[isArrayBufferKey];
    }
  }

  return restoredValue;
}
