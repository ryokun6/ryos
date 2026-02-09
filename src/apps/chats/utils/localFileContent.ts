import { dbOperations, type DocumentContent } from "@/apps/finder/utils/fileDatabase";
import { STORES } from "@/utils/indexedDB";
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

export const readOptionalTextContentFromStore = async (
  storeName: LocalContentStore,
  uuid: string,
): Promise<string | null> => {
  const contentData = await dbOperations.get<DocumentContent>(storeName, uuid);
  if (!contentData || contentData.content == null) {
    return null;
  }

  if (typeof contentData.content === "string") {
    return contentData.content;
  }

  if (contentData.content instanceof Blob) {
    return contentData.content.text();
  }

  return null;
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

export const normalizeLineEndings = (value: string): string =>
  value.replace(/\r\n?/g, "\n");

export type SingleReplacementResult =
  | { ok: true; updatedContent: string }
  | { ok: false; reason: "not_found" | "multiple_matches"; occurrences: number };

export const replaceSingleOccurrence = (
  source: string,
  oldString: string,
  newString: string,
): SingleReplacementResult => {
  const normalizedSource = normalizeLineEndings(source);
  const normalizedOldString = normalizeLineEndings(oldString);
  const normalizedNewString = normalizeLineEndings(newString);

  const occurrences = normalizedSource.split(normalizedOldString).length - 1;
  if (occurrences === 0) {
    return { ok: false, reason: "not_found", occurrences };
  }

  if (occurrences > 1) {
    return { ok: false, reason: "multiple_matches", occurrences };
  }

  return {
    ok: true,
    updatedContent: normalizedSource.replace(
      normalizedOldString,
      normalizedNewString,
    ),
  };
};

export type WriteMode = "overwrite" | "append" | "prepend";

export const mergeContentByWriteMode = ({
  mode,
  incomingContent,
  existingContent,
}: {
  mode: WriteMode;
  incomingContent: string;
  existingContent: string | null;
}): string => {
  if (mode === "overwrite" || existingContent == null) {
    return incomingContent;
  }

  if (mode === "prepend") {
    return `${incomingContent}${existingContent}`;
  }

  return `${existingContent}${incomingContent}`;
};

export const persistUpdatedLocalFileContent = async ({
  fileItem,
  storeName,
  content,
  recordName,
}: {
  fileItem: ActiveFileWithUuid;
  storeName: LocalContentStore;
  content: string;
  recordName: string;
}): Promise<void> => {
  await dbOperations.put<DocumentContent>(
    storeName,
    { name: recordName, content },
    fileItem.uuid,
  );

  useFilesStore.getState().addItem({
    ...fileItem,
    size: new Blob([content]).size,
  });
};
