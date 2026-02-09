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

export type LocalFileReplacementAttempt =
  | { ok: true; fileItem: ActiveFileWithUuid; updatedContent: string }
  | { ok: false; reason: "not_found" | "multiple_matches"; occurrences: number };

export const attemptLocalFileReplacement = async ({
  path,
  storeName,
  oldString,
  newString,
  errors,
}: {
  path: string;
  storeName: LocalContentStore;
  oldString: string;
  newString: string;
  errors: {
    notFound: string;
    missingContent: string;
    readFailed: string;
  };
}): Promise<LocalFileReplacementAttempt> => {
  const { fileItem, content } = await readLocalFileTextOrThrow(
    path,
    storeName,
    errors,
  );

  const replacement = replaceSingleOccurrence(content, oldString, newString);
  if (!replacement.ok) {
    return replacement;
  }

  return {
    ok: true,
    fileItem,
    updatedContent: replacement.updatedContent,
  };
};

export type PersistedLocalFileReplacementResult =
  | { ok: true; fileItem: ActiveFileWithUuid; updatedContent: string }
  | { ok: false; reason: "not_found" | "multiple_matches"; occurrences: number };

export const replaceAndPersistLocalFileContent = async ({
  path,
  storeName,
  oldString,
  newString,
  errors,
  resolveRecordName,
}: {
  path: string;
  storeName: LocalContentStore;
  oldString: string;
  newString: string;
  errors: {
    notFound: string;
    missingContent: string;
    readFailed: string;
  };
  resolveRecordName: (fileItem: ActiveFileWithUuid) => string;
}): Promise<PersistedLocalFileReplacementResult> => {
  const replacement = await attemptLocalFileReplacement({
    path,
    storeName,
    oldString,
    newString,
    errors,
  });

  if (!replacement.ok) {
    return replacement;
  }

  await persistUpdatedLocalFileContent({
    fileItem: replacement.fileItem,
    storeName,
    content: replacement.updatedContent,
    recordName: resolveRecordName(replacement.fileItem),
  });

  return replacement;
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

  const filesStore = useFilesStore.getState();
  const size = new Blob([content]).size;
  const existingItem = filesStore.items[fileItem.path];

  if (existingItem) {
    filesStore.updateItemMetadata(fileItem.path, { size });
    return;
  }

  filesStore.addItem({
    ...fileItem,
    size,
  });
};

export const saveDocumentTextFile = async ({
  path,
  fileName,
  content,
}: {
  path: string;
  fileName: string;
  content: string;
}): Promise<ActiveFileWithUuid> => {
  const filesStore = useFilesStore.getState();
  const existingItem = filesStore.items[path];

  if (existingItem?.status === "active" && existingItem.uuid) {
    await persistUpdatedLocalFileContent({
      fileItem: existingItem as ActiveFileWithUuid,
      storeName: STORES.DOCUMENTS,
      content,
      recordName: fileName,
    });
    return (
      (useFilesStore.getState().items[path] as ActiveFileWithUuid | undefined) ||
      (existingItem as ActiveFileWithUuid)
    );
  }

  filesStore.addItem({
    path,
    name: fileName,
    isDirectory: false,
    type: "markdown",
    size: new Blob([content]).size,
    icon: "📄",
  });

  const savedItem = useFilesStore.getState().items[path];
  if (!savedItem?.uuid) {
    throw new Error("Failed to save document metadata");
  }

  await dbOperations.put<DocumentContent>(
    STORES.DOCUMENTS,
    { name: fileName, content },
    savedItem.uuid,
  );

  return savedItem as ActiveFileWithUuid;
};

export const writeDocumentFileWithMode = async ({
  path,
  fileName,
  incomingContent,
  mode,
}: {
  path: string;
  fileName: string;
  incomingContent: string;
  mode: WriteMode;
}): Promise<{ isNewFile: boolean; finalContent: string }> => {
  const existingItem = useFilesStore.getState().items[path];
  const isNewFile = !existingItem || existingItem.status !== "active";
  let existingContentForMerge: string | null = null;
  if (!isNewFile && mode !== "overwrite") {
    if (!existingItem?.uuid) {
      throw new Error("Existing document is missing content metadata");
    }

    existingContentForMerge = await readOptionalTextContentFromStore(
      STORES.DOCUMENTS,
      existingItem.uuid,
    );
    if (existingContentForMerge == null) {
      throw new Error("Failed to load existing document content");
    }
  }

  const finalContent = mergeContentByWriteMode({
    mode,
    incomingContent,
    existingContent: existingContentForMerge,
  });

  await saveDocumentTextFile({
    path,
    fileName,
    content: finalContent,
  });

  return { isNewFile, finalContent };
};
