import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { useFilesStore } from "@/stores/useFilesStore";
import { normalizeToolPath } from "./chatFileToolValidation";

type SharedAppletPayload = {
  id: string;
  title: string | null;
  name: string | null;
  icon: string | null;
  createdBy: string | null;
  installedPath: string | null;
  content: string;
};

type ChatSharedAppletReadOperationResult =
  | { ok: true; payload: SharedAppletPayload }
  | {
      ok: false;
      error:
        | { errorKey: "apps.chats.toolCalls.noPathProvided" }
        | {
            errorKey: "apps.chats.toolCalls.invalidPathForRead";
            errorParams: { path: string };
          }
        | { errorKey: string };
    };

type FetchSharedAppletFn = (shareId: string) => Promise<{
  title?: unknown;
  name?: unknown;
  icon?: unknown;
  createdBy?: unknown;
  content?: unknown;
}>;

type ResolveInstalledPathFn = (shareId: string) => string | null;

const fetchSharedAppletById: FetchSharedAppletFn = async (shareId) => {
  const response = await abortableFetch(
    getApiUrl(`/api/share-applet?id=${encodeURIComponent(shareId)}`),
    {
      timeout: 15000,
      retry: { maxAttempts: 2, initialDelayMs: 500 },
    },
  );

  return (await response.json()) as {
    title?: unknown;
    name?: unknown;
    icon?: unknown;
    createdBy?: unknown;
    content?: unknown;
  };
};

const resolveInstalledPathByShareId: ResolveInstalledPathFn = (shareId) => {
  const filesStore = useFilesStore.getState();
  const installedEntry = Object.values(filesStore.items).find(
    (item) =>
      item.status === "active" &&
      typeof item.shareId === "string" &&
      item.shareId.toLowerCase() === shareId.toLowerCase(),
  );

  return installedEntry?.path ?? null;
};

export const executeChatSharedAppletReadOperation = async ({
  path,
  fetchSharedApplet = fetchSharedAppletById,
  resolveInstalledPath = resolveInstalledPathByShareId,
}: {
  path: unknown;
  fetchSharedApplet?: FetchSharedAppletFn;
  resolveInstalledPath?: ResolveInstalledPathFn;
}): Promise<ChatSharedAppletReadOperationResult> => {
  const normalizedPath = normalizeToolPath(path);
  if (!normalizedPath) {
    return { ok: false, error: { errorKey: "apps.chats.toolCalls.noPathProvided" } };
  }

  if (!normalizedPath.startsWith("/Applets Store/")) {
    return {
      ok: false,
      error: {
        errorKey: "apps.chats.toolCalls.invalidPathForRead",
        errorParams: { path: normalizedPath },
      },
    };
  }

  const shareId = normalizedPath.replace("/Applets Store/", "").trim();
  if (!shareId) {
    return {
      ok: false,
      error: {
        errorKey: "apps.chats.toolCalls.invalidPathForRead",
        errorParams: { path: normalizedPath },
      },
    };
  }

  try {
    const data = await fetchSharedApplet(shareId);
    return {
      ok: true,
      payload: {
        id: shareId,
        title: typeof data.title === "string" ? data.title : null,
        name: typeof data.name === "string" ? data.name : null,
        icon: typeof data.icon === "string" ? data.icon : null,
        createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
        installedPath: resolveInstalledPath(shareId),
        content: typeof data.content === "string" ? data.content : "",
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: { errorKey: error instanceof Error ? error.message : "Failed to read file" },
    };
  }
};
