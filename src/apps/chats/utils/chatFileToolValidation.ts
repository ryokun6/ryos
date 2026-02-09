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
  mode: WriteMode;
};

export type WriteValidationResult = WriteValidationFailure | WriteValidationSuccess;

export type ToolErrorDescriptor = {
  errorKey: string;
  errorParams?: Record<string, unknown>;
};

export const normalizeToolPath = (path: unknown): string =>
  typeof path === "string" ? path.trim() : "";

export const normalizeToolText = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

export const resolveToolErrorText = (
  translate: (key: string, params?: Record<string, unknown>) => string,
  descriptor: ToolErrorDescriptor,
): string =>
  descriptor.errorParams
    ? translate(descriptor.errorKey, descriptor.errorParams)
    : translate(descriptor.errorKey);

const isWriteMode = (value: unknown): value is WriteMode =>
  value === "overwrite" || value === "append" || value === "prepend";

export const sanitizeWriteMode = (mode: unknown): WriteMode =>
  isWriteMode(mode) ? mode : "overwrite";

const isMarkdownFileName = (fileName: string): boolean =>
  fileName.toLowerCase().endsWith(".md");

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

export type EditTarget = "document" | "applet";

export type EditTargetValidationResult =
  | { ok: true; target: EditTarget }
  | {
      ok: false;
      errorKey: "apps.chats.toolCalls.invalidPathForEdit";
      errorParams: { path: string };
    };

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

export const resolveEditTarget = (
  path: string,
): EditTargetValidationResult => {
  if (path.startsWith("/Documents/")) {
    return { ok: true, target: "document" };
  }

  if (path.startsWith("/Applets/")) {
    return { ok: true, target: "applet" };
  }

  return {
    ok: false,
    errorKey: "apps.chats.toolCalls.invalidPathForEdit",
    errorParams: { path },
  };
};

export const getEditTargetMessageBundle = ({
  target,
  path,
}: {
  target: EditTarget;
  path: string;
}): {
  notFound: string;
  missingContent: string;
  readFailed: string;
  successKey:
    | "apps.chats.toolCalls.editedDocument"
    | "apps.chats.toolCalls.editedApplet";
} => {
  if (target === "document") {
    const notFoundMessage = `Document not found: ${path}. Use write tool to create new documents, or list({ path: "/Documents" }) to see available files.`;
    return {
      notFound: notFoundMessage,
      missingContent: notFoundMessage,
      readFailed: `Failed to read document content: ${path}`,
      successKey: "apps.chats.toolCalls.editedDocument",
    };
  }

  const notFoundMessage = `Applet not found: ${path}. Use generateHtml tool to create new applets, or list({ path: "/Applets" }) to see available files.`;
  return {
    notFound: notFoundMessage,
    missingContent: notFoundMessage,
    readFailed: `Failed to read applet content: ${path}`,
    successKey: "apps.chats.toolCalls.editedApplet",
  };
};

export const validateDocumentWriteInput = ({
  path,
  content,
  mode,
}: {
  path: unknown;
  content: unknown;
  mode: unknown;
}): WriteValidationResult => {
  const normalizedPath = normalizeToolPath(path);
  const normalizedContent = normalizeToolText(content);
  const normalizedMode = sanitizeWriteMode(mode);

  if (!normalizedPath) {
    return { ok: false, errorKey: "apps.chats.toolCalls.noPathProvided" };
  }

  if (!normalizedPath.startsWith("/Documents/")) {
    return {
      ok: false,
      errorKey: "apps.chats.toolCalls.invalidPathForWrite",
      errorParams: { path: normalizedPath },
    };
  }

  const fileName = normalizedPath.split("/").pop() || "";
  if (!isMarkdownFileName(fileName)) {
    return {
      ok: false,
      errorKey: "apps.chats.toolCalls.invalidFilename",
      errorParams: { fileName },
    };
  }

  if (
    normalizedContent == null ||
    (normalizedMode === "overwrite" && normalizedContent.trim().length === 0)
  ) {
    return { ok: false, errorKey: "apps.chats.toolCalls.noContentProvided" };
  }

  return { ok: true, fileName, mode: normalizedMode };
};

export const validateFileEditInput = ({
  path,
  oldString,
  newString,
}: {
  path: unknown;
  oldString: unknown;
  newString: unknown;
}): EditValidationResult => {
  const normalizedPath = normalizeToolPath(path);
  const normalizedOldString = normalizeToolText(oldString);
  const normalizedNewString = normalizeToolText(newString);

  if (
    !normalizedPath ||
    normalizedOldString == null ||
    normalizedOldString.length === 0 ||
    normalizedNewString == null
  ) {
    return {
      ok: false,
      errorKey: "apps.chats.toolCalls.missingEditParameters",
    };
  }

  return {
    ok: true,
    path: normalizedPath,
    oldString: normalizedOldString,
    newString: normalizedNewString,
  };
};
