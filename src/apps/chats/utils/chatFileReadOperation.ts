import { STORES } from "@/utils/indexedDB";
import { resolveLocalFileReadTarget } from "./chatFileToolValidation";
import { readLocalFileTextOrThrow } from "./localFileContent";

export type ChatFileReadOperationResult =
  | {
      ok: true;
      target: "applet" | "document";
      path: string;
      fileName: string;
      content: string;
    }
  | {
      ok: false;
      error:
        | {
            errorKey:
              | "apps.chats.toolCalls.noPathProvided"
              | "apps.chats.toolCalls.invalidPathForRead";
            errorParams?: { path: string };
          }
        | { errorKey: string };
    };

type ReadLocalFileTextOrThrowFn = typeof readLocalFileTextOrThrow;

export const executeChatFileReadOperation = async ({
  path,
  readLocalFile = readLocalFileTextOrThrow,
}: {
  path: string;
  readLocalFile?: ReadLocalFileTextOrThrowFn;
}): Promise<ChatFileReadOperationResult> => {
  const target = resolveLocalFileReadTarget(path);
  if (!target.ok) {
    return {
      ok: false,
      error: target,
    };
  }

  try {
    const isApplet = target.target === "applet";
    const { fileItem, content } = await readLocalFile(
      path,
      isApplet ? STORES.APPLETS : STORES.DOCUMENTS,
      {
        notFound: `File not found: ${path}`,
        missingContent: `File missing content: ${path}`,
        readFailed: `Failed to read file content: ${path}`,
      },
    );

    return {
      ok: true,
      target: target.target,
      path,
      fileName: fileItem.name,
      content,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        errorKey: error instanceof Error ? error.message : "Failed to read file",
      },
    };
  }
};
