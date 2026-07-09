/**
 * Virtual File System (VFS) Tool Handlers
 *
 * Client-side implementations of the `list`, `open`, `read`, `write`, and
 * `edit` tools. Extracted from dispatchToolCall.ts so the dispatcher stays a
 * thin router and each VFS concern is independently readable/testable.
 *
 * Path routing:
 * - /Music            → iPod library (list) / playKnown (open)
 * - /Applets Store    → shared applets API (list/read) / applet-viewer (open)
 * - /Applications     → app registry (list) / launchApp (open)
 * - /Applets          → IndexedDB applets (list/open/read/edit)
 * - /Documents        → IndexedDB markdown docs (list/open/read/write/edit)
 */

import { useAppStore } from "@/stores/useAppStore";
import { AppId } from "@/config/appIds";
import { appRegistry } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";
import { getDefaultFileApp } from "@/utils/fileAssociations";
import type { DocumentContent } from "@/apps/finder/hooks/useFileSystem";
import { STORES, dbOperations } from "@/utils/indexedDB";
import {
  normalizeSearchText,
  computeMatchScore,
  deriveScoreThreshold,
} from "@/apps/chats/utils/fuzzySearch";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useFilesStore } from "@/stores/useFilesStore";
import {
  getIpodTracksForLibrary,
  type IpodLibrarySelection,
  useIpodStore,
} from "@/stores/useIpodStore";
import { markdownToSafeHtml } from "@/apps/textedit/utils/markdownPaste";
import { parseRichMarkdown } from "@/apps/textedit/utils/richMarkdown";
import { generateJsonFromHtml } from "@/utils/tiptapHtml";
import i18n from "@/lib/i18n";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { fetchAppletCatalog } from "@/apps/applet-viewer/utils/appletCatalog";
import { aiChatLog as log } from "../logging";
import { emitAppletUpdated, emitDocumentUpdated } from "@/utils/appEventBus";
import {
  persistChatApplet,
  persistChatDocument,
  type SaveFileHandler,
} from "../utils/chatFilePersistence";
import { handleMediaControl } from "./mediaHandler";
import type { ToolContext } from "./types";

/**
 * Context for VFS handlers: the shared tool context plus file persistence and
 * open-result tracking used by the write/open flows.
 */
export interface VfsToolContext extends ToolContext {
  saveFile: SaveFileHandler;
  recordOpenedInstance: (instanceId: string) => void;
}

export interface VfsListInput {
  path: string;
  query?: string;
  limit?: number;
  librarySource?: IpodLibrarySelection;
}

export interface VfsPathInput {
  path: string;
}

export interface VfsWriteInput {
  path: string;
  content: string;
  mode?: "overwrite" | "append" | "prepend";
}

export interface VfsEditInput {
  path: string;
  old_string: string;
  new_string: string;
}

async function storedContentToText(
  content: DocumentContent["content"]
): Promise<string> {
  if (typeof content === "string") return content;
  if (content instanceof Blob) return content.text();
  return new TextDecoder().decode(content);
}

/**
 * Documents saved by TextEdit may embed a base64 rich-content metadata comment
 * on the first line; strip it so the AI reads and matches against the plain
 * markdown the user actually sees.
 */
async function storedDocumentToMarkdown(
  content: DocumentContent["content"]
): Promise<string> {
  return parseRichMarkdown(await storedContentToText(content)).markdown;
}

const recentlyCreatedTextEditInstances = new Map<
  string,
  { instanceId: string; path: string; timestamp: number }
>();

// Helper to add a newly created instance to tracking
export const trackNewTextEditInstance = (instanceId: string, path: string) => {
  recentlyCreatedTextEditInstances.set(instanceId, {
    instanceId,
    path,
    timestamp: Date.now(),
  });
  // Clean up old entries (older than 5 minutes)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [id, data] of recentlyCreatedTextEditInstances.entries()) {
    if (data.timestamp < fiveMinutesAgo) {
      recentlyCreatedTextEditInstances.delete(id);
    }
  }
};

const getRecentTextEditInstanceForPath = (path: string): string | null => {
  const appStore = useAppStore.getState();
  let newestMatch: { instanceId: string; timestamp: number } | null = null;

  for (const [id, tracked] of recentlyCreatedTextEditInstances.entries()) {
    if (tracked.path !== path) {
      continue;
    }

    const instance = appStore.instances[id];
    if (!instance || !instance.isOpen || instance.appId !== "textedit") {
      recentlyCreatedTextEditInstances.delete(id);
      continue;
    }

    if (!newestMatch || tracked.timestamp > newestMatch.timestamp) {
      newestMatch = { instanceId: id, timestamp: tracked.timestamp };
    }
  }

  return newestMatch?.instanceId ?? null;
};

export async function handleVfsList(
  input: VfsListInput,
  toolName: string,
  toolCallId: string,
  context: VfsToolContext
): Promise<void> {
  const { addToolOutput } = context;
  const { path, query, limit, librarySource } = input;

  if (!path) {
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
    });
    return;
  }

  log.debug("Tool list", { path, query, limit });

  try {
    // Route based on path
    if (path === "/Music") {
      // List the selected iPod library. Karaoke asks for the YouTube
      // slice even when the iPod UI is currently showing Apple Music.
      const ipodStore = useIpodStore.getState();
      const selectedLibrary = librarySource ?? "active";
      const normalizedQuery = query ? normalizeSearchText(query.trim()) : "";
      const queryTokens = normalizedQuery
        ? normalizedQuery.split(/\s+/).filter(Boolean)
        : [];
      const hasQuery = normalizedQuery.length > 0;
      const maxResults = limit ? Math.min(Math.max(limit, 1), 50) : 25;
      const activeTracks = getIpodTracksForLibrary(ipodStore, selectedLibrary);
      const scoredTracks = activeTracks.map((track) => {
        const fields = [
          track.id,
          track.title,
          track.artist ?? "",
          track.album ?? "",
        ].map(normalizeSearchText);
        const score = hasQuery
          ? fields.reduce(
              (best, field) =>
                Math.max(
                  best,
                  computeMatchScore(field, normalizedQuery, queryTokens)
                ),
              0
            )
          : 1;
        return { track, score };
      });
      const scoreThreshold = hasQuery
        ? deriveScoreThreshold(normalizedQuery.length)
        : 0;
      const matchingTracks = scoredTracks
        .filter(({ score }) => score >= scoreThreshold)
        .sort((a, b) => (hasQuery ? b.score - a.score : 0));
      const library = matchingTracks.slice(0, maxResults).map(({ track }) => ({
        path: `/Music/${track.id}`,
        id: track.id,
        title: track.title,
        artist: track.artist,
        source:
          track.source ??
          (selectedLibrary === "active"
            ? ipodStore.librarySource
            : selectedLibrary),
      }));
      const hiddenCount = Math.max(matchingTracks.length - library.length, 0);
      const resolvedLibrary =
        selectedLibrary === "active" ? ipodStore.librarySource : selectedLibrary;
      const libraryName =
        resolvedLibrary === "appleMusic" ? "Apple Music" : "YouTube";

      const resultMessage =
        library.length > 0
          ? `${
              library.length === 1
                ? i18n.t("apps.chats.toolCalls.foundSongsInMusic", {
                    count: library.length,
                  })
                : i18n.t("apps.chats.toolCalls.foundSongsInMusicPlural", {
                    count: library.length,
                  })
            } (${libraryName})${
              hiddenCount > 0
                ? `; showing ${library.length} of ${matchingTracks.length}. Use query or limit to narrow results.`
                : ""
            }:\n${JSON.stringify(library, null, 2)}`
          : hasQuery
            ? `No songs matched "${query}" in ${libraryName}.`
            : i18n.t("apps.chats.toolCalls.musicLibraryEmpty");

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: resultMessage,
      });
    } else if (path === "/Applets Store") {
      // List shared applets from store
      const normalizedKeyword = query ? normalizeSearchText(query.trim()) : "";
      const keywordTokens = normalizedKeyword
        ? normalizedKeyword.split(/\s+/).filter(Boolean)
        : [];
      const hasKeyword = normalizedKeyword.length > 0;
      const maxResults = limit ? Math.min(Math.max(limit, 1), 100) : 50;

      const allApplets = await fetchAppletCatalog();
      const scoreThreshold = hasKeyword
        ? deriveScoreThreshold(normalizedKeyword.length)
        : 0;

      const scoredApplets = allApplets.map((applet) => {
        const normalizedFields = [
          typeof applet.title === "string"
            ? normalizeSearchText(applet.title)
            : "",
          typeof applet.name === "string"
            ? normalizeSearchText(applet.name)
            : "",
          typeof applet.createdBy === "string"
            ? normalizeSearchText(applet.createdBy)
            : "",
        ].filter((value) => value.length > 0);

        const score = hasKeyword
          ? normalizedFields.reduce((best, field) => {
              const fieldScore = computeMatchScore(
                field,
                normalizedKeyword,
                keywordTokens
              );
              return fieldScore > best ? fieldScore : best;
            }, 0)
          : 1;

        return { applet, score };
      });

      const filteredApplets = hasKeyword
        ? scoredApplets.filter(({ score }) => score >= scoreThreshold)
        : scoredApplets;

      filteredApplets.sort((a, b) => {
        if (hasKeyword && b.score !== a.score) return b.score - a.score;
        return (b.applet.createdAt ?? 0) - (a.applet.createdAt ?? 0);
      });

      const limitedApplets = filteredApplets
        .slice(0, maxResults)
        .map(({ applet }) => ({
          path: `/Applets Store/${applet.id}`,
          id: applet.id,
          title: applet.title ?? applet.name ?? "Untitled",
          name: applet.name,
        }));

      const resultMessage =
        limitedApplets.length > 0
          ? `${
              limitedApplets.length === 1
                ? i18n.t("apps.chats.toolCalls.foundSharedApplets", {
                    count: limitedApplets.length,
                  })
                : i18n.t("apps.chats.toolCalls.foundSharedAppletsPlural", {
                    count: limitedApplets.length,
                  })
            }:\n${JSON.stringify(limitedApplets, null, 2)}`
          : hasKeyword
            ? i18n.t("apps.chats.toolCalls.noSharedAppletsMatched", { query })
            : i18n.t("apps.chats.toolCalls.noSharedAppletsAvailable");

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: resultMessage,
      });
    } else if (path === "/Applications") {
      // List installed applications
      const apps = Object.entries(appRegistry).reduce<
        { path: string; name: string }[]
      >((acc, [id, app]) => {
        if (id !== "finder") {
          acc.push({
            path: `/Applications/${id}`,
            name: app.name,
          });
        }
        return acc;
      }, []);

      const appsMessage =
        apps.length === 1
          ? i18n.t("apps.chats.toolCalls.foundApplicationsList", {
              count: apps.length,
            })
          : i18n.t("apps.chats.toolCalls.foundApplicationsListPlural", {
              count: apps.length,
            });
      addToolOutput({
        tool: toolName,
        toolCallId,
        output: `${appsMessage}:\n${JSON.stringify(apps, null, 2)}`,
      });
    } else if (path === "/Applets" || path === "/Documents") {
      // List files from file system
      const filesStore = useFilesStore.getState();
      const allItems = Object.values(filesStore.items);

      const files = allItems.filter(
        (item) =>
          item.status === "active" &&
          item.path.startsWith(`${path}/`) &&
          !item.isDirectory &&
          item.path !== `${path}/`
      );

      const fileList = files.map((file) => ({
        path: file.path,
        name: file.name,
        type: file.type,
      }));

      const fileType = path === "/Applets" ? "applet" : "document";
      const resultMessage =
        fileList.length > 0
          ? `${
              fileList.length === 1
                ? i18n.t("apps.chats.toolCalls.foundFileType", {
                    count: fileList.length,
                    fileType,
                  })
                : i18n.t("apps.chats.toolCalls.foundFileTypePlural", {
                    count: fileList.length,
                    fileType,
                  })
            }:\n${JSON.stringify(fileList, null, 2)}`
          : i18n.t("apps.chats.toolCalls.noFileTypeFound", { fileType, path });

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: resultMessage,
      });
    } else {
      addToolOutput({
        tool: toolName,
        toolCallId,
        state: "output-error",
        errorText: i18n.t("apps.chats.toolCalls.invalidPathForList", { path }),
      });
    }
  } catch (err) {
    console.error("list error:", err);
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText:
        err instanceof Error
          ? err.message
          : i18n.t("apps.chats.toolCalls.failedToListItems"),
    });
  }
}

export async function handleVfsOpen(
  input: VfsPathInput,
  toolName: string,
  toolCallId: string,
  context: VfsToolContext
): Promise<void> {
  const { addToolOutput, launchApp } = context;
  const { path } = input;

  if (!path) {
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
    });
    return;
  }

  log.debug("Tool open", { path });

  try {
    // Route based on path prefix
    if (path.startsWith("/Music/")) {
      const songId = path.replace("/Music/", "");
      await handleMediaControl(
        {
          target: "music",
          action: "playKnown",
          id: songId,
        },
        toolCallId,
        context,
        toolName
      );
    } else if (path.startsWith("/Applets Store/")) {
      // Open shared applet preview
      const shareId = path.replace("/Applets Store/", "");

      // Fetch applet metadata to get the name
      let appletName = shareId;
      try {
        const response = await abortableFetch(
          getApiUrl(`/api/share-applet?id=${encodeURIComponent(shareId)}`),
          {
            timeout: 15000,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );
        const data = await response.json();
        appletName = data.title || data.name || shareId;
      } catch {
        // Fall back to shareId if fetch fails
      }

      launchApp("applet-viewer", {
        initialData: { path: "", content: "", shareCode: shareId },
      });

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: i18n.t("apps.chats.toolCalls.openedApplet", { appletName }),
      });
    } else if (path.startsWith("/Applications/")) {
      // Launch application
      const appId = path.replace("/Applications/", "") as AppId;
      if (!appRegistry[appId]) {
        throw new Error(`Application not found: ${appId}`);
      }

      launchApp(appId);
      addToolOutput({
        tool: toolName,
        toolCallId,
        output: i18n.t("apps.chats.toolCalls.launchedApp", {
          appName: getTranslatedAppName(appId),
        }),
      });
    } else if (path.startsWith("/Applets/")) {
      // Open applet in viewer
      const filesStore = useFilesStore.getState();
      const fileItem = filesStore.items[path];

      if (!fileItem || fileItem.status !== "active") {
        throw new Error(`Applet not found: ${path}`);
      }

      if (!fileItem.uuid) {
        throw new Error(`Applet missing content: ${path}`);
      }

      const contentData = await dbOperations.get<DocumentContent>(
        STORES.APPLETS,
        fileItem.uuid
      );

      if (!contentData || !contentData.content) {
        throw new Error(`Failed to read applet content: ${path}`);
      }

      const content = await storedContentToText(contentData.content);

      launchApp("applet-viewer", {
        initialData: { path, content },
      });

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: i18n.t("apps.chats.toolCalls.openedFile", {
          fileName: fileItem.name,
        }),
      });
    } else if (path.startsWith("/Documents/")) {
      // Open document in TextEdit
      const filesStore = useFilesStore.getState();
      const fileItem = filesStore.items[path];
      const appStore = useAppStore.getState();
      const textEditStore = useTextEditStore.getState();

      if (!fileItem || fileItem.status !== "active") {
        throw new Error(`Document not found: ${path}`);
      }

      if (getDefaultFileApp(fileItem) === "preview") {
        launchApp("preview", {
          initialData: { path },
        });
        addToolOutput({
          tool: toolName,
          toolCallId,
          output: i18n.t("apps.chats.toolCalls.openedDocument", {
            fileName: fileItem.name,
          }),
        });
        return;
      }

      const existingInstanceId = textEditStore.getInstanceIdByPath(path);
      if (existingInstanceId) {
        if (appStore.instances[existingInstanceId]) {
          appStore.bringInstanceToForeground(existingInstanceId);
          context.recordOpenedInstance(existingInstanceId);
          addToolOutput({
            tool: toolName,
            toolCallId,
            output: i18n.t("apps.chats.toolCalls.openedDocument", {
              fileName: fileItem.name,
            }),
          });
          return;
        }

        // Stale reference in TextEdit store; clean it up and continue.
        textEditStore.removeInstance(existingInstanceId);
      }

      // Fallback for write->open races: a freshly launched TextEdit window
      // may not have registered its file path yet.
      const recentInstanceId = getRecentTextEditInstanceForPath(path);
      if (recentInstanceId) {
        appStore.bringInstanceToForeground(recentInstanceId);
        context.recordOpenedInstance(recentInstanceId);
        addToolOutput({
          tool: toolName,
          toolCallId,
          output: i18n.t("apps.chats.toolCalls.openedDocument", {
            fileName: fileItem.name,
          }),
        });
        return;
      }

      if (!fileItem.uuid) {
        throw new Error(`Document missing content: ${path}`);
      }

      const contentData = await dbOperations.get<DocumentContent>(
        STORES.DOCUMENTS,
        fileItem.uuid
      );

      if (!contentData || !contentData.content) {
        throw new Error(`Failed to read document content: ${path}`);
      }

      const content = await storedContentToText(contentData.content);

      // Pass initialData directly to launchApp (consistent with Terminal/Finder approach).
      // TextEdit handles markdown-to-HTML conversion internally.
      launchApp("textedit", {
        multiWindow: true,
        initialData: { path, content },
      });

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: i18n.t("apps.chats.toolCalls.openedDocument", {
          fileName: fileItem.name,
        }),
      });
    } else {
      addToolOutput({
        tool: toolName,
        toolCallId,
        state: "output-error",
        errorText: i18n.t("apps.chats.toolCalls.invalidPath", { path }),
      });
    }
  } catch (err) {
    console.error("open error:", err);
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText:
        err instanceof Error
          ? err.message
          : i18n.t("apps.chats.toolCalls.failedToOpen"),
    });
  }
}

export async function handleVfsRead(
  input: VfsPathInput,
  toolName: string,
  toolCallId: string,
  context: VfsToolContext
): Promise<void> {
  const { addToolOutput } = context;
  const { path } = input;

  if (!path) {
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
    });
    return;
  }

  log.debug("Tool read", { path });

  try {
    if (path.startsWith("/Applets Store/")) {
      // Fetch shared applet content
      const shareId = path.replace("/Applets Store/", "");
      const response = await abortableFetch(
        getApiUrl(`/api/share-applet?id=${encodeURIComponent(shareId)}`),
        {
          timeout: 15000,
          retry: { maxAttempts: 2, initialDelayMs: 500 },
        }
      );

      const data = await response.json();
      const filesStore = useFilesStore.getState();
      const installedEntry = Object.values(filesStore.items).find(
        (item) =>
          item.status === "active" &&
          typeof item.shareId === "string" &&
          item.shareId.toLowerCase() === shareId.toLowerCase()
      );

      const payload = {
        id: shareId,
        title: data?.title ?? null,
        name: data?.name ?? null,
        icon: data?.icon ?? null,
        createdBy: data?.createdBy ?? null,
        installedPath: installedEntry?.path ?? null,
        content: typeof data?.content === "string" ? data.content : "",
      };

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: JSON.stringify(payload, null, 2),
      });
    } else if (path.startsWith("/Applets/") || path.startsWith("/Documents/")) {
      // Read local file content
      const isApplet = path.startsWith("/Applets/");
      const filesStore = useFilesStore.getState();
      const fileItem = filesStore.items[path];

      if (!fileItem || fileItem.status !== "active") {
        throw new Error(`File not found: ${path}`);
      }

      if (!fileItem.uuid) {
        throw new Error(`File missing content: ${path}`);
      }

      const storeName = isApplet ? STORES.APPLETS : STORES.DOCUMENTS;
      const contentData = await dbOperations.get<DocumentContent>(
        storeName,
        fileItem.uuid
      );

      if (!contentData || contentData.content == null) {
        throw new Error(`Failed to read file content: ${path}`);
      }

      const content = isApplet
        ? await storedContentToText(contentData.content)
        : await storedDocumentToMarkdown(contentData.content);

      const fileLabel = isApplet
        ? i18n.t("apps.chats.toolCalls.applet")
        : i18n.t("apps.chats.toolCalls.document");
      addToolOutput({
        tool: toolName,
        toolCallId,
        output:
          i18n.t("apps.chats.toolCalls.fileContent", {
            fileLabel,
            fileName: fileItem.name,
            charCount: content.length,
          }) + `\n\n${content}`,
      });
    } else {
      addToolOutput({
        tool: toolName,
        toolCallId,
        state: "output-error",
        errorText: i18n.t("apps.chats.toolCalls.invalidPathForRead", { path }),
      });
    }
  } catch (err) {
    console.error("read error:", err);
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText:
        err instanceof Error
          ? err.message
          : i18n.t("apps.chats.toolCalls.failedToReadFile"),
    });
  }
}

export async function handleVfsWrite(
  input: VfsWriteInput,
  toolName: string,
  toolCallId: string,
  context: VfsToolContext
): Promise<void> {
  const { addToolOutput, saveFile } = context;
  const { path, content, mode = "overwrite" } = input;

  if (!path) {
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.noPathProvided"),
    });
    return;
  }

  // Validate path format for documents
  if (!path.startsWith("/Documents/")) {
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.invalidPathForWrite", { path }),
    });
    return;
  }

  // Validate filename has .md extension
  const fileName = path.split("/").pop() || "";
  if (!fileName.endsWith(".md")) {
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.invalidFilename", { fileName }),
    });
    return;
  }

  if (!content && mode === "overwrite") {
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.noContentProvided"),
    });
    return;
  }

  log.debug("Tool write", { path, mode, contentLength: content?.length });

  try {
    const appStore = useAppStore.getState();
    const textEditStore = useTextEditStore.getState();

    // Check if file exists for append/prepend modes
    const existingItem = useFilesStore.getState().items[path];
    const isNewFile = !existingItem || existingItem.status !== "active";

    // Determine final content based on mode
    let finalContent = content || "";
    if (!isNewFile && mode !== "overwrite" && existingItem?.uuid) {
      const existingData = await dbOperations.get<DocumentContent>(
        STORES.DOCUMENTS,
        existingItem.uuid
      );
      if (existingData?.content) {
        const existingContent = await storedDocumentToMarkdown(
          existingData.content
        );
        finalContent =
          mode === "prepend"
            ? content + existingContent
            : existingContent + content;
      }
    }

    await persistChatDocument({
      saveFile,
      path,
      fileName,
      content: finalContent,
      icon: existingItem?.icon || "📄",
    });

    // Find existing TextEdit instance for this file
    let targetInstanceId: string | null = null;
    for (const [instanceId, instance] of Object.entries(
      textEditStore.instances
    )) {
      if (instance.filePath === path) {
        // Verify instance actually exists in AppStore
        if (appStore.instances[instanceId]) {
          targetInstanceId = instanceId;
        } else {
          // Stale instance reference - clean it up
          textEditStore.removeInstance(instanceId);
        }
        break;
      }
    }

    if (targetInstanceId) {
      // Update existing TextEdit instance with content. Convert through the
      // GFM-aware pipeline so tables, links and task lists render as rich
      // content instead of raw markdown text.
      const htmlFragment = markdownToSafeHtml(finalContent);
      const contentJson = await generateJsonFromHtml(htmlFragment);

      textEditStore.updateInstance(targetInstanceId, {
        filePath: path,
        contentJson,
        hasUnsavedChanges: false, // Already saved to disk
      });

      // Dispatch event to update the editor content
      emitDocumentUpdated({
        path,
        content: JSON.stringify(contentJson),
      });

      appStore.bringInstanceToForeground(targetInstanceId);
    } else {
      // Create new TextEdit instance with initialData (same pattern as Finder)
      const windowTitle = fileName.replace(/\.md$/, "") || "Untitled";
      targetInstanceId = appStore.launchApp(
        "textedit",
        { path, content: finalContent },
        windowTitle,
        true
      );
      trackNewTextEditInstance(targetInstanceId, path);
    }

    context.recordOpenedInstance(targetInstanceId);
    const outputKey = isNewFile ? "createdDocument" : "updatedDocument";
    addToolOutput({
      tool: toolName,
      toolCallId,
      output: i18n.t(`apps.chats.toolCalls.${outputKey}`, { path }),
    });
  } catch (err) {
    console.error("write error:", err);
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText:
        err instanceof Error
          ? err.message
          : i18n.t("apps.chats.toolCalls.failedToWriteFile"),
    });
  }
}

export async function handleVfsEdit(
  input: VfsEditInput,
  toolName: string,
  toolCallId: string,
  context: VfsToolContext
): Promise<void> {
  const { addToolOutput, saveFile } = context;
  const { path, old_string, new_string } = input;

  if (
    !path ||
    typeof old_string !== "string" ||
    typeof new_string !== "string"
  ) {
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.missingEditParameters"),
    });
    return;
  }

  log.debug("Tool edit", {
    path,
    oldStringLength: old_string.length,
    newStringLength: new_string.length,
  });

  // Normalize line endings
  const normalizedOldString = old_string.replace(/\r\n?/g, "\n");
  const normalizedNewString = new_string.replace(/\r\n?/g, "\n");

  try {
    if (path.startsWith("/Documents/")) {
      const filesStore = useFilesStore.getState();
      const fileItem = filesStore.items[path];

      if (!fileItem || fileItem.status !== "active" || !fileItem.uuid) {
        throw new Error(
          `Document not found: ${path}. Use write tool to create new documents, or list({ path: "/Documents" }) to see available files.`
        );
      }

      // Read existing content from IndexedDB (AI edits always persist
      // immediately; pending-save is reserved for user keystrokes).
      const contentData = await dbOperations.get<DocumentContent>(
        STORES.DOCUMENTS,
        fileItem.uuid
      );
      if (!contentData?.content) {
        throw new Error(`Failed to read document content: ${path}`);
      }

      const existingContent = await storedDocumentToMarkdown(
        contentData.content
      );

      // Normalize existing content
      const normalizedExisting = existingContent.replace(/\r\n?/g, "\n");

      // Check for uniqueness - count occurrences
      const occurrences =
        normalizedExisting.split(normalizedOldString).length - 1;

      if (occurrences === 0) {
        addToolOutput({
          tool: toolName,
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.oldStringNotFound"),
        });
        return;
      }

      if (occurrences > 1) {
        addToolOutput({
          tool: toolName,
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.oldStringMultipleMatches", {
            count: occurrences,
          }),
        });
        return;
      }

      // Replace exactly one occurrence
      const updatedContent = normalizedExisting.replace(
        normalizedOldString,
        normalizedNewString
      );

      await persistChatDocument({
        saveFile,
        path,
        fileName: fileItem.name,
        content: updatedContent,
        icon: fileItem.icon || "📄",
      });

      // If the document is open in TextEdit, refresh the editor from the
      // newly persisted content (already saved — clear any dirty flag).
      const textEditState = useTextEditStore.getState();
      const appState = useAppStore.getState();
      let openInstanceId = textEditState.getInstanceIdByPath(path);
      if (openInstanceId && !appState.instances[openInstanceId]) {
        textEditState.removeInstance(openInstanceId);
        openInstanceId = null;
      }

      if (openInstanceId) {
        const updatedHtml = markdownToSafeHtml(updatedContent);
        const updatedJson = await generateJsonFromHtml(updatedHtml);

        textEditState.updateInstance(openInstanceId, {
          contentJson: updatedJson,
          hasUnsavedChanges: false,
        });
      }

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: i18n.t("apps.chats.toolCalls.editedDocument", { path }),
      });
    } else if (path.startsWith("/Applets/")) {
      // Edit applet HTML
      const filesStore = useFilesStore.getState();
      const fileItem = filesStore.items[path];

      if (!fileItem || fileItem.status !== "active" || !fileItem.uuid) {
        throw new Error(
          `Applet not found: ${path}. Use generateHtml tool to create new applets, or list({ path: "/Applets" }) to see available files.`
        );
      }

      const contentData = await dbOperations.get<DocumentContent>(
        STORES.APPLETS,
        fileItem.uuid
      );
      if (!contentData?.content) {
        throw new Error(`Failed to read applet content: ${path}`);
      }

      const existingContent = await storedContentToText(contentData.content);

      // Normalize existing content
      const normalizedExisting = existingContent.replace(/\r\n?/g, "\n");

      // Check for uniqueness - count occurrences
      const occurrences =
        normalizedExisting.split(normalizedOldString).length - 1;

      if (occurrences === 0) {
        addToolOutput({
          tool: toolName,
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.oldStringNotFound"),
        });
        return;
      }

      if (occurrences > 1) {
        addToolOutput({
          tool: toolName,
          toolCallId,
          state: "output-error",
          errorText: i18n.t("apps.chats.toolCalls.oldStringMultipleMatches", {
            count: occurrences,
          }),
        });
        return;
      }

      // Replace exactly one occurrence
      const updatedContent = normalizedExisting.replace(
        normalizedOldString,
        normalizedNewString
      );

      await persistChatApplet({
        saveFile,
        fileItem,
        content: updatedContent,
      });

      // Let any open applet viewers hot-reload this edited applet.
      emitAppletUpdated({
        path,
        content: updatedContent,
      });

      addToolOutput({
        tool: toolName,
        toolCallId,
        output: i18n.t("apps.chats.toolCalls.editedApplet", { path }),
      });
    } else {
      addToolOutput({
        tool: toolName,
        toolCallId,
        state: "output-error",
        errorText: i18n.t("apps.chats.toolCalls.invalidPathForEdit", { path }),
      });
    }
  } catch (err) {
    console.error("edit error:", err);
    addToolOutput({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText:
        err instanceof Error
          ? err.message
          : i18n.t("apps.chats.toolCalls.failedToEditFile"),
    });
  }
}
