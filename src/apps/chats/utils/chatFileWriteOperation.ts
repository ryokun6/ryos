import {
  normalizeToolPath,
  type WriteValidationFailure,
  validateDocumentWriteInput,
} from "./chatFileToolValidation";
import {
  writeDocumentFileWithMode,
  type WriteMode,
} from "./localFileContent";

type WriteDocumentFileWithModeFn = typeof writeDocumentFileWithMode;

export type ChatFileWriteOperationFailure = {
  ok: false;
  error: WriteValidationFailure;
};

export type ChatFileWriteOperationSuccess = {
  ok: true;
  path: string;
  fileName: string;
  mode: WriteMode;
  finalContent: string;
  successKey:
    | "apps.chats.toolCalls.createdDocument"
    | "apps.chats.toolCalls.updatedDocument";
};

export type ChatFileWriteOperationResult =
  | ChatFileWriteOperationFailure
  | ChatFileWriteOperationSuccess;

export const executeChatFileWriteOperation = async ({
  path,
  content,
  mode,
  writeDocumentWithMode = writeDocumentFileWithMode,
}: {
  path: unknown;
  content: unknown;
  mode: unknown;
  writeDocumentWithMode?: WriteDocumentFileWithModeFn;
}): Promise<ChatFileWriteOperationResult> => {
  const validation = validateDocumentWriteInput({
    path,
    content,
    mode,
  });
  if (!validation.ok) {
    return {
      ok: false,
      error: validation,
    };
  }

  const normalizedPath = normalizeToolPath(path);
  const incomingContent = typeof content === "string" ? content : "";
  const writeResult = await writeDocumentWithMode({
    path: normalizedPath,
    fileName: validation.fileName,
    incomingContent,
    mode: validation.mode,
  });

  return {
    ok: true,
    path: normalizedPath,
    fileName: validation.fileName,
    mode: validation.mode,
    finalContent: writeResult.finalContent,
    successKey: writeResult.isNewFile
      ? "apps.chats.toolCalls.createdDocument"
      : "apps.chats.toolCalls.updatedDocument",
  };
};
