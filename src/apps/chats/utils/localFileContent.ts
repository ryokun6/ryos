import {
  dbOperations,
  STORES,
  type DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { useFilesStore, type FileSystemItem } from "@/stores/useFilesStore";

export type ActiveFileWithUuid = FileSystemItem & { uuid: string };
export type LocalContentStore =
  | typeof STORES.APPLETS
  | typeof STORES.DOCUMENTS;

export const requireActiveFileWithUuid = (
  path: string,
  notFoundMessage: string,
  missingContentMessage: string,
): ActiveFileWithUuid => {
  const fileItem = useFilesStore.getState().items[path];
  if (!fileItem || fileItem.status !== "active") {
    throw new Error(notFoundMessage);
  }

  if (!fileItem.uuid) {
    throw new Error(missingContentMessage);
  }

  return fileItem as ActiveFileWithUuid;
};

export const readTextContentFromStore = async (
  storeName: LocalContentStore,
  uuid: string,
  failedReadMessage: string,
): Promise<string> => {
  const contentData = await dbOperations.get<DocumentContent>(storeName, uuid);
  if (!contentData || contentData.content == null) {
    throw new Error(failedReadMessage);
  }

  if (typeof contentData.content === "string") {
    return contentData.content;
  }

  if (contentData.content instanceof Blob) {
    return contentData.content.text();
  }

  throw new Error(failedReadMessage);
};

export const readLocalFileTextOrThrow = async (
  path: string,
  storeName: LocalContentStore,
  errors: {
    notFound: string;
    missingContent: string;
    readFailed: string;
  },
): Promise<{ fileItem: ActiveFileWithUuid; content: string }> => {
  const fileItem = requireActiveFileWithUuid(
    path,
    errors.notFound,
    errors.missingContent,
  );
  const content = await readTextContentFromStore(
    storeName,
    fileItem.uuid,
    errors.readFailed,
  );

  return { fileItem, content };
};
