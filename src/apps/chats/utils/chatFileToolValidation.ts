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

export type EditValidationFailure = {
  ok: false;
  errorKey: "apps.chats.toolCalls.missingEditParameters";
};

export type EditValidationSuccess = {
  ok: true;
  path: string;
  oldString: string;
  newString: string;
};

export type EditValidationResult = EditValidationFailure | EditValidationSuccess;

export type EditReplacementFailure = {
  reason: "not_found" | "multiple_matches";
  occurrences: number;
};

export const getEditReplacementFailureMessage = (
  failure: EditReplacementFailure,
):
  | { errorKey: "apps.chats.toolCalls.oldStringNotFound" }
  | {
      errorKey: "apps.chats.toolCalls.oldStringMultipleMatches";
      errorParams: { count: number };
    } => {
  if (failure.reason === "not_found") {
    return { errorKey: "apps.chats.toolCalls.oldStringNotFound" };
  }

  return {
    errorKey: "apps.chats.toolCalls.oldStringMultipleMatches",
    errorParams: { count: failure.occurrences },
  };
};

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

export const validateFileEditInput = ({
  path,
  oldString,
  newString,
}: {
  path: string;
  oldString: unknown;
  newString: unknown;
}): EditValidationResult => {
  if (!path || typeof oldString !== "string" || typeof newString !== "string") {
    return {
      ok: false,
      errorKey: "apps.chats.toolCalls.missingEditParameters",
    };
  }

  return {
    ok: true,
    path,
    oldString,
    newString,
  };
};
