import { executeChatFileReadOperation } from "./chatFileReadOperation";

type ExecuteReadOperationFn = typeof executeChatFileReadOperation;

export type ChatFileOpenOperationResult =
  | {
      ok: true;
      target: "applet" | "document";
      path: string;
      fileName: string;
      content: string;
      launchAppId: "applet-viewer" | "textedit";
      launchOptions:
        | { initialData: { path: string; content: string }; multiWindow?: never }
        | { initialData: { path: string; content: string }; multiWindow: true };
      successKey:
        | "apps.chats.toolCalls.openedFile"
        | "apps.chats.toolCalls.openedDocument";
    }
  | {
      ok: false;
      error: { errorKey: string; errorParams?: Record<string, unknown> };
    };

export const executeChatFileOpenOperation = async ({
  path,
  executeReadOperation = executeChatFileReadOperation,
}: {
  path: string;
  executeReadOperation?: ExecuteReadOperationFn;
}): Promise<ChatFileOpenOperationResult> => {
  const readResult = await executeReadOperation({ path });
  if (!readResult.ok) {
    return { ok: false, error: readResult.error };
  }

  if (readResult.target === "applet") {
    return {
      ok: true,
      target: "applet",
      path: readResult.path,
      fileName: readResult.fileName,
      content: readResult.content,
      launchAppId: "applet-viewer",
      launchOptions: {
        initialData: { path: readResult.path, content: readResult.content },
      },
      successKey: "apps.chats.toolCalls.openedFile",
    };
  }

  return {
    ok: true,
    target: "document",
    path: readResult.path,
    fileName: readResult.fileName,
    content: readResult.content,
    launchAppId: "textedit",
    launchOptions: {
      multiWindow: true,
      initialData: { path: readResult.path, content: readResult.content },
    },
    successKey: "apps.chats.toolCalls.openedDocument",
  };
};
