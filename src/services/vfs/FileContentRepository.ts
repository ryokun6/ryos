import { STORES, dbOperations } from "@/utils/indexedDB";
import {
  getStoreForFile,
  type StoredContent,
} from "@/utils/indexedDBOperations";
import { getFileContentUuid } from "@/services/vfs/FileMetadataService";

export type VfsContentStoreName =
  | typeof STORES.DOCUMENTS
  | typeof STORES.IMAGES
  | typeof STORES.APPLETS
  | typeof STORES.TRASH;

export interface VfsStoredContent extends StoredContent {
  contentUrl?: string;
}

export async function readContentByKey<T extends StoredContent = StoredContent>(
  storeName: string,
  key: string
): Promise<T | undefined> {
  return dbOperations.get<T>(storeName, key);
}

export async function writeContentByKey<T extends StoredContent = StoredContent>(
  storeName: string,
  value: T,
  key: string
): Promise<void> {
  await dbOperations.put<T>(storeName, value, key);
}

export async function readContentForPath<T extends StoredContent = StoredContent>(
  path: string,
  options: { expectedStore?: VfsContentStoreName } = {}
): Promise<T | null> {
  const fileName = path.split("/").pop();
  const storeName = getStoreForFile(path, { name: fileName });
  if (!storeName) {
    return null;
  }
  if (options.expectedStore && storeName !== options.expectedStore) {
    return null;
  }

  const uuid = getFileContentUuid(path);
  if (!uuid) return null;
  return (await readContentByKey<T>(storeName, uuid)) ?? null;
}

export async function readDocumentTextContent(path: string): Promise<string | null> {
  const item = await readContentForPath<StoredContent>(path, {
    expectedStore: STORES.DOCUMENTS,
  });
  const content = item?.content;
  if (content instanceof Blob) {
    return content.text();
  }
  return typeof content === "string" ? content : null;
}

export async function readImageBlobContent(path: string): Promise<Blob | null> {
  const item = await readContentForPath<StoredContent>(path, {
    expectedStore: STORES.IMAGES,
  });
  return item?.content instanceof Blob ? item.content : null;
}

export async function readAppletTextContent(path: string): Promise<string | null> {
  const item = await readContentForPath<StoredContent>(path, {
    expectedStore: STORES.APPLETS,
  });
  const content = item?.content;
  if (content instanceof Blob) {
    return content.text();
  }
  return typeof content === "string" ? content : null;
}

export async function writeAppletTextContent(
  path: string,
  name: string,
  content: string
): Promise<void> {
  const uuid = getFileContentUuid(path);
  if (!uuid) return;
  await writeContentByKey(
    STORES.APPLETS,
    {
      name,
      content,
    },
    uuid
  );
}
