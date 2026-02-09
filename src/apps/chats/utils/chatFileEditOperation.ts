import { STORES } from "@/utils/indexedDB";
import {
  getEditReplacementFailureMessage,
  getEditTargetMessageBundle,
  resolveEditTarget,
} from "./chatFileToolValidation";
import {
  replaceAndPersistLocalFileContent,
  type PersistedLocalFileReplacementResult,
} from "./localFileContent";

type ReplaceAndPersistLocalFileContentFn = typeof replaceAndPersistLocalFileContent;

export type ChatFileEditOperationSuccess = {
  ok: true;
  target: "document" | "applet";
  path: string;
  successKey:
    | "apps.chats.toolCalls.editedDocument"
    | "apps.chats.toolCalls.editedApplet";
  updatedContent: string;
};

export type ChatFileEditOperationFailure = {
  ok: false;
  error:
    | {
        errorKey: "apps.chats.toolCalls.invalidPathForEdit";
        errorParams: { path: string };
      }
    | { errorKey: "apps.chats.toolCalls.oldStringNotFound" }
    | {
        errorKey: "apps.chats.toolCalls.oldStringMultipleMatches";
        errorParams: { count: number };
      };
};

export type ChatFileEditOperationResult =
  | ChatFileEditOperationSuccess
  | ChatFileEditOperationFailure;

export const executeChatFileEditOperation = async ({
  path,
  oldString,
  newString,
  replaceAndPersist = replaceAndPersistLocalFileContent,
}: {
  path: string;
  oldString: string;
  newString: string;
  replaceAndPersist?: ReplaceAndPersistLocalFileContentFn;
}): Promise<ChatFileEditOperationResult> => {
  const editTarget = resolveEditTarget(path);
  if (!editTarget.ok) {
    return { ok: false, error: editTarget };
  }

  const messageBundle = getEditTargetMessageBundle({
    target: editTarget.target,
    path,
  });
  const isDocumentTarget = editTarget.target === "document";
  const replacement: PersistedLocalFileReplacementResult = await replaceAndPersist({
    path,
    storeName: isDocumentTarget ? STORES.DOCUMENTS : STORES.APPLETS,
    oldString,
    newString,
    errors: {
      notFound: messageBundle.notFound,
      missingContent: messageBundle.missingContent,
      readFailed: messageBundle.readFailed,
    },
    resolveRecordName: (fileItem) =>
      isDocumentTarget ? fileItem.name : fileItem.uuid,
  });

  if (!replacement.ok) {
    return {
      ok: false,
      error: getEditReplacementFailureMessage({
        reason: replacement.reason,
        occurrences: replacement.occurrences,
      }),
    };
  }

  return {
    ok: true,
    target: editTarget.target,
    path,
    successKey: messageBundle.successKey,
    updatedContent: replacement.updatedContent,
  };
};
