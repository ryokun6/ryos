import {
  computeMatchScore,
  deriveScoreThreshold,
  normalizeSearchText,
} from "./searchScoring";
import { normalizeToolPath } from "./chatFileToolValidation";

export type ChatListMusicItem = {
  path: string;
  id: string;
  title: string;
  artist?: string;
};

export type ChatListSharedAppletItem = {
  path: string;
  id: string;
  title: string;
  name?: string;
};

export type ChatListApplicationItem = {
  path: string;
  name: string;
};

export type ChatListFileItem = {
  path: string;
  name: string;
  type?: string;
};

type SharedAppletRecord = {
  id: string;
  title?: string;
  name?: string;
  icon?: string;
  createdAt?: number;
  createdBy?: string;
};

type ListableRoot = "/Applets" | "/Documents";

export type ChatListOperationResult =
  | { ok: true; target: "music"; items: ChatListMusicItem[] }
  | {
      ok: true;
      target: "shared-applets";
      items: ChatListSharedAppletItem[];
      hasKeyword: boolean;
      query: string;
    }
  | { ok: true; target: "applications"; items: ChatListApplicationItem[] }
  | {
      ok: true;
      target: "files";
      root: ListableRoot;
      fileType: "applet" | "document";
      items: ChatListFileItem[];
    }
  | {
      ok: false;
      error:
        | { errorKey: "apps.chats.toolCalls.noPathProvided" }
        | {
            errorKey: "apps.chats.toolCalls.invalidPathForList";
            errorParams: { path: string };
          }
        | { errorKey: string };
    };

export type ChatListOperationDependencies = {
  getMusicItems: () => ChatListMusicItem[];
  getSharedApplets: () => Promise<SharedAppletRecord[]>;
  getApplications: () => ChatListApplicationItem[];
  getFileItems: (root: ListableRoot) => ChatListFileItem[];
};

const clampResultLimit = (limit: unknown): number => {
  if (typeof limit !== "number" || Number.isNaN(limit)) {
    return 50;
  }
  return Math.min(Math.max(Math.floor(limit), 1), 100);
};

const resolveListableRoot = (path: string): ListableRoot | null => {
  if (path === "/Applets") return "/Applets";
  if (path === "/Documents") return "/Documents";
  return null;
};

const buildSharedAppletItems = ({
  applets,
  query,
  limit,
}: {
  applets: SharedAppletRecord[];
  query: string;
  limit: unknown;
}): {
  hasKeyword: boolean;
  items: ChatListSharedAppletItem[];
} => {
  const normalizedKeyword = query ? normalizeSearchText(query.trim()) : "";
  const keywordTokens = normalizedKeyword
    ? normalizedKeyword.split(/\s+/).filter(Boolean)
    : [];
  const hasKeyword = normalizedKeyword.length > 0;
  const maxResults = clampResultLimit(limit);
  const scoreThreshold = hasKeyword
    ? deriveScoreThreshold(normalizedKeyword.length)
    : 0;

  const filtered = applets
    .map((applet) => {
      const normalizedFields = [
        typeof applet.title === "string" ? normalizeSearchText(applet.title) : "",
        typeof applet.name === "string" ? normalizeSearchText(applet.name) : "",
        typeof applet.createdBy === "string"
          ? normalizeSearchText(applet.createdBy)
          : "",
      ].filter((value) => value.length > 0);

      const score = hasKeyword
        ? normalizedFields.reduce((best, field) => {
            const fieldScore = computeMatchScore(
              field,
              normalizedKeyword,
              keywordTokens,
            );
            return fieldScore > best ? fieldScore : best;
          }, 0)
        : 1;

      return { applet, score };
    })
    .filter(({ score }) => !hasKeyword || score >= scoreThreshold);

  filtered.sort((a, b) => {
    if (hasKeyword && b.score !== a.score) return b.score - a.score;
    return (b.applet.createdAt ?? 0) - (a.applet.createdAt ?? 0);
  });

  return {
    hasKeyword,
    items: filtered.slice(0, maxResults).map(({ applet }) => ({
      path: `/Applets Store/${applet.id}`,
      id: applet.id,
      title: applet.title ?? applet.name ?? "Untitled",
      name: applet.name,
    })),
  };
};

export const executeChatListOperation = async ({
  path,
  query,
  limit,
  dependencies,
}: {
  path: unknown;
  query?: unknown;
  limit?: unknown;
  dependencies: ChatListOperationDependencies;
}): Promise<ChatListOperationResult> => {
  const normalizedPath = normalizeToolPath(path);
  if (!normalizedPath) {
    return { ok: false, error: { errorKey: "apps.chats.toolCalls.noPathProvided" } };
  }

  if (normalizedPath === "/Music") {
    return { ok: true, target: "music", items: dependencies.getMusicItems() };
  }

  if (normalizedPath === "/Applets Store") {
    const sharedApplets = await dependencies.getSharedApplets();
    const resolvedQuery = typeof query === "string" ? query : "";
    const sharedAppletResult = buildSharedAppletItems({
      applets: sharedApplets,
      query: resolvedQuery,
      limit,
    });

    return {
      ok: true,
      target: "shared-applets",
      items: sharedAppletResult.items,
      hasKeyword: sharedAppletResult.hasKeyword,
      query: resolvedQuery,
    };
  }

  if (normalizedPath === "/Applications") {
    return {
      ok: true,
      target: "applications",
      items: dependencies.getApplications(),
    };
  }

  const listableRoot = resolveListableRoot(normalizedPath);
  if (listableRoot) {
    return {
      ok: true,
      target: "files",
      root: listableRoot,
      fileType: listableRoot === "/Applets" ? "applet" : "document",
      items: dependencies.getFileItems(listableRoot),
    };
  }

  return {
    ok: false,
    error: {
      errorKey: "apps.chats.toolCalls.invalidPathForList",
      errorParams: { path: normalizedPath },
    },
  };
};
