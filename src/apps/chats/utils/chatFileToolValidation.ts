import type { WriteMode } from "./localFileContent";

export type WriteValidationFailure =
  | { ok: false; errorKey: "apps.chats.toolCalls.noPathProvided" }
  | {
      ok: false;
      errorKey: "apps.chats.toolCalls.invalidPathForWrite";
      errorParams: { path: string };
    }
  | {
      ok: false;
      errorKey: "apps.chats.toolCalls.invalidFilename";
      errorParams: { fileName: string };
    }
  | { ok: false; errorKey: "apps.chats.toolCalls.noContentProvided" };

export type WriteValidationSuccess = {
  ok: true;
  fileName: string;
};

export type WriteValidationResult = WriteValidationFailure | WriteValidationSuccess;

export const validateDocumentWriteInput = ({
  path,
  content,
  mode,
}: {
  path: string;
  content: string;
  mode: WriteMode;
}): WriteValidationResult => {
  if (!path) {
    return { ok: false, errorKey: "apps.chats.toolCalls.noPathProvided" };
  }

  if (!path.startsWith("/Documents/")) {
    return {
      ok: false,
      errorKey: "apps.chats.toolCalls.invalidPathForWrite",
      errorParams: { path },
    };
  }

  const fileName = path.split("/").pop() || "";
  if (!fileName.endsWith(".md")) {
    return {
      ok: false,
      errorKey: "apps.chats.toolCalls.invalidFilename",
      errorParams: { fileName },
    };
  }

  if (!content && mode === "overwrite") {
    return { ok: false, errorKey: "apps.chats.toolCalls.noContentProvided" };
  }

  return { ok: true, fileName };
};
