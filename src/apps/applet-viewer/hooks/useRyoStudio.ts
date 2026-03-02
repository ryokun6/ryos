import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useAppStore } from "@/stores/useAppStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { abortableFetch } from "@/utils/abortableFetch";
import { emitFileSaved } from "@/utils/appEventBus";
import { getApiUrl } from "@/utils/platform";
import type { AppletViewerInitialData } from "../index";

export interface StudioDraftSnapshot {
  html: string;
  title: string;
  icon: string;
  name: string;
  windowWidth: number;
  windowHeight: number;
  prompt: string;
  reply: string;
}

interface UseRyoStudioOptions {
  instanceId?: string;
  initialData?: AppletViewerInitialData;
  currentAppletPath?: string;
  currentHtmlContent?: string;
  currentShareCode?: string;
  getAppletTitle: (content: string, isShared?: boolean) => string;
}

const DEFAULT_WINDOW_WIDTH = 360;
const DEFAULT_WINDOW_HEIGHT = 520;
const STUDIO_WORKSPACE_WIDTH = 860;
const STUDIO_WORKSPACE_HEIGHT = 600;

const sanitizeFileStem = (value: string): string => {
  const cleaned = value
    .replace(/\.(app|html)$/i, "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Ryo Studio Applet";
};

const appendExtension = (value: string): string =>
  value.endsWith(".app") ? value : `${value}.app`;

export function useRyoStudio({
  instanceId,
  initialData,
  currentAppletPath = "",
  currentHtmlContent = "",
  currentShareCode,
  getAppletTitle,
}: UseRyoStudioOptions) {
  const { saveFile } = useFileSystem("/", { skipLoad: true });
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);
  const getFileItem = useFilesStore((state) => state.getItem);
  const updateFileItemMetadata = useFilesStore(
    (state) => state.updateItemMetadata
  );

  const [isStudioActive, setIsStudioActive] = useState(
    initialData?.mode === "create"
  );
  const [promptInput, setPromptInput] = useState(initialData?.prefillPrompt || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [lastReply, setLastReply] = useState("");
  const [history, setHistory] = useState<StudioDraftSnapshot[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draftPath, setDraftPath] = useState(initialData?.path || "");
  const [draftShareId, setDraftShareId] = useState(
    initialData?.shareId || initialData?.shareCode || ""
  );
  const [draftCreatedBy, setDraftCreatedBy] = useState<string | null>(null);
  const seedSignatureRef = useRef<string>("");

  const currentWindowState = useAppStore((state) =>
    instanceId ? state.instances[instanceId] : undefined
  );

  const studioDraft = historyIndex >= 0 ? history[historyIndex] : null;

  const syncInitialData = useCallback(
    (data: Partial<AppletViewerInitialData>) => {
      if (!instanceId) return;
      const appStore = useAppStore.getState();
      const existing =
        (appStore.instances[instanceId]?.initialData as AppletViewerInitialData | undefined) ||
        {};
      appStore.updateInstanceInitialData(instanceId, {
        ...existing,
        ...data,
      });
    },
    [instanceId]
  );

  const updateWindowSize = useCallback(
    (width: number, height: number) => {
      if (!instanceId) return;
      const appStore = useAppStore.getState();
      const inst = appStore.instances[instanceId];
      if (!inst) return;
      const nextSize = {
        width: Math.max(240, Math.min(1200, width)),
        height: Math.max(240, Math.min(1200, height)),
      };
      appStore.updateInstanceWindowState(
        instanceId,
        inst.position || { x: 0, y: 0 },
        nextSize
      );
    },
    [instanceId]
  );

  const ensureStudioWorkspaceSize = useCallback(() => {
    updateWindowSize(STUDIO_WORKSPACE_WIDTH, STUDIO_WORKSPACE_HEIGHT);
  }, [updateWindowSize]);

  const setDraftFromSnapshot = useCallback(
    (
      snapshot: StudioDraftSnapshot,
      options?: {
        replaceHistory?: boolean;
        path?: string;
        shareId?: string;
        createdBy?: string | null;
      }
    ) => {
      setHistory((prev) => {
        const next = options?.replaceHistory
          ? [snapshot]
          : [...prev.slice(0, historyIndex + 1), snapshot];
        setHistoryIndex(next.length - 1);
        return next;
      });
      setLastReply(snapshot.reply);
      setStudioError(null);
      setIsStudioActive(true);
      if (options?.path !== undefined) {
        setDraftPath(options.path);
      }
      if (options?.shareId !== undefined) {
        setDraftShareId(options.shareId || "");
      }
      if (options?.createdBy !== undefined) {
        setDraftCreatedBy(options.createdBy);
      }
      ensureStudioWorkspaceSize();
      syncInitialData({
        mode: "create",
        path: options?.path ?? draftPath,
        content: snapshot.html,
        title: snapshot.title,
        icon: snapshot.icon,
        name: snapshot.name,
        shareId: options?.shareId ?? draftShareId,
        prefillPrompt: "",
        windowWidth: snapshot.windowWidth,
        windowHeight: snapshot.windowHeight,
      });
    },
    [
      draftPath,
      draftShareId,
      ensureStudioWorkspaceSize,
      historyIndex,
      syncInitialData,
    ]
  );

  useEffect(() => {
    const isCreateMode = initialData?.mode === "create";
    if (!isCreateMode) {
      return;
    }

    const signature = JSON.stringify({
      mode: initialData?.mode,
      path: initialData?.path || "",
      content: initialData?.content || "",
      title: initialData?.title || "",
      icon: initialData?.icon || "",
      name: initialData?.name || "",
      shareId: initialData?.shareId || "",
      shareCode: initialData?.shareCode || "",
      prefillPrompt: initialData?.prefillPrompt || "",
      windowWidth: initialData?.windowWidth || "",
      windowHeight: initialData?.windowHeight || "",
    });

    if (seedSignatureRef.current === signature) {
      return;
    }
    seedSignatureRef.current = signature;

    setIsStudioActive(true);
    setPromptInput(initialData?.prefillPrompt || "");
    setDraftPath(initialData?.path || "");
    setDraftShareId(initialData?.shareId || initialData?.shareCode || "");
    if (initialData?.path) {
      setDraftCreatedBy(getFileItem(initialData.path)?.createdBy || null);
    }

    if (initialData?.content?.trim()) {
      const snapshot: StudioDraftSnapshot = {
        html: initialData.content.trim(),
        title:
          initialData.title ||
          getAppletTitle(initialData.content, Boolean(initialData.shareCode)) ||
          initialData.name ||
          "Untitled Applet",
        icon: initialData.icon || "🧩",
        name:
          sanitizeFileStem(
            initialData.name ||
              initialData.title ||
              getAppletTitle(initialData.content, Boolean(initialData.shareCode)) ||
              "Ryo Studio Applet"
          ),
        windowWidth: initialData.windowWidth || DEFAULT_WINDOW_WIDTH,
        windowHeight: initialData.windowHeight || DEFAULT_WINDOW_HEIGHT,
        prompt: initialData.prefillPrompt || "",
        reply: "Draft loaded into Ryo Studio.",
      };
      setHistory([snapshot]);
      setHistoryIndex(0);
      setLastReply(snapshot.reply);
      ensureStudioWorkspaceSize();
    } else {
      setHistory([]);
      setHistoryIndex(-1);
      setLastReply("");
      ensureStudioWorkspaceSize();
    }
  }, [ensureStudioWorkspaceSize, getAppletTitle, getFileItem, initialData]);

  useEffect(() => {
    if (currentAppletPath) {
      setDraftCreatedBy(getFileItem(currentAppletPath)?.createdBy || null);
    }
  }, [currentAppletPath, getFileItem]);

  const startStudioFromCurrentApplet = useCallback(() => {
    if (!currentHtmlContent.trim()) return;
    const currentFile = currentAppletPath ? getFileItem(currentAppletPath) : null;
    const snapshot: StudioDraftSnapshot = {
      html: currentHtmlContent,
      title:
        getAppletTitle(currentHtmlContent, Boolean(currentShareCode)) ||
        currentFile?.name?.replace(/\.(app|html)$/i, "") ||
        "Untitled Applet",
      icon: currentFile?.icon || initialData?.icon || "🧩",
      name: sanitizeFileStem(
        currentFile?.name ||
          initialData?.name ||
          getAppletTitle(currentHtmlContent, Boolean(currentShareCode)) ||
          "Ryo Studio Applet"
      ),
      windowWidth:
        currentFile?.windowWidth ||
        currentWindowState?.size?.width ||
        DEFAULT_WINDOW_WIDTH,
      windowHeight:
        currentFile?.windowHeight ||
        currentWindowState?.size?.height ||
        DEFAULT_WINDOW_HEIGHT,
      prompt: "",
      reply: "Ready to refine this applet in Ryo Studio.",
    };

    setDraftFromSnapshot(snapshot, {
      replaceHistory: true,
      path: currentAppletPath,
      shareId: currentFile?.shareId || currentShareCode || "",
      createdBy: currentFile?.createdBy || null,
    });
  }, [
    currentAppletPath,
    currentHtmlContent,
    currentShareCode,
    currentWindowState?.size?.height,
    currentWindowState?.size?.width,
    getAppletTitle,
    getFileItem,
    initialData?.icon,
    initialData?.name,
    setDraftFromSnapshot,
  ]);

  const openCreateMode = useCallback(
    (prefillPrompt: string = "", options?: { fresh?: boolean }) => {
      if (options?.fresh) {
        setHistory([]);
        setHistoryIndex(-1);
        setDraftPath("");
        setDraftShareId("");
        setDraftCreatedBy(null);
        setLastReply("");
        setStudioError(null);
      }
      setIsStudioActive(true);
      ensureStudioWorkspaceSize();
      setPromptInput(prefillPrompt);
      syncInitialData({
        mode: "create",
        prefillPrompt,
        path: options?.fresh ? "" : draftPath,
        shareId: options?.fresh ? undefined : draftShareId,
        shareCode: undefined,
        content: options?.fresh ? "" : studioDraft?.html,
        title: options?.fresh ? undefined : studioDraft?.title,
        icon: options?.fresh ? undefined : studioDraft?.icon,
        name: options?.fresh ? undefined : studioDraft?.name,
      });
    },
    [draftPath, draftShareId, ensureStudioWorkspaceSize, studioDraft?.html, syncInitialData]
  );

  const closeStudio = useCallback(() => {
    setIsStudioActive(false);
    if (studioDraft) {
      syncInitialData({
        mode: "browse",
        path: draftPath,
        content: studioDraft.html,
        shareCode: draftPath ? undefined : draftShareId || undefined,
        title: studioDraft.title,
        icon: studioDraft.icon,
        name: studioDraft.name,
        prefillPrompt: "",
        forceNewInstance: false,
      });
    } else {
      syncInitialData({
        mode: "browse",
        path: "",
        content: "",
        shareCode: undefined,
        shareId: undefined,
        title: undefined,
        icon: undefined,
        name: undefined,
        prefillPrompt: "",
      });
    }
  }, [draftPath, draftShareId, studioDraft, syncInitialData]);

  const runStudioRequest = useCallback(
    async (action: "create" | "edit", instruction: string) => {
      const trimmedInstruction = instruction.trim();
      if (!trimmedInstruction) {
        setStudioError("Describe what you want to build first.");
        return false;
      }

      setIsGenerating(true);
      setStudioError(null);

      try {
        const response = await abortableFetch(getApiUrl("/api/applet-ai"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(username && authToken
              ? {
                  Authorization: `Bearer ${authToken}`,
                  "X-Username": username,
                }
              : {}),
          },
          body: JSON.stringify({
            prompt: trimmedInstruction,
            studio: {
              action,
              currentHtml:
                action === "edit" ? studioDraft?.html || undefined : undefined,
              title: studioDraft?.title || initialData?.title || undefined,
              icon: studioDraft?.icon || initialData?.icon || undefined,
              name: studioDraft?.name || initialData?.name || undefined,
              windowWidth:
                currentWindowState?.size?.width ||
                studioDraft?.windowWidth ||
                initialData?.windowWidth,
              windowHeight:
                currentWindowState?.size?.height ||
                studioDraft?.windowHeight ||
                initialData?.windowHeight,
            },
          }),
          timeout: 60000,
          retry: { maxAttempts: 1 },
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to generate applet draft");
        }
        if (!data.applet?.html) {
          throw new Error("The AI did not return an applet draft.");
        }

        const nextSnapshot: StudioDraftSnapshot = {
          html: data.applet.html.trim(),
          title: data.applet.title || "Untitled Applet",
          icon: data.applet.icon || "🧩",
          name: sanitizeFileStem(data.applet.name || data.applet.title || "Ryo Studio Applet"),
          windowWidth: data.applet.windowWidth || DEFAULT_WINDOW_WIDTH,
          windowHeight: data.applet.windowHeight || DEFAULT_WINDOW_HEIGHT,
          prompt: trimmedInstruction,
          reply: data.reply || "",
        };

        setDraftFromSnapshot(nextSnapshot, {
          path: draftPath,
          shareId: draftShareId,
          createdBy: draftCreatedBy,
        });

        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to generate applet draft.";
        setStudioError(message);
        toast.error("Ryo Studio failed", {
          description: message,
        });
        return false;
      } finally {
        setIsGenerating(false);
      }
    },
    [
      authToken,
      currentWindowState?.size?.height,
      currentWindowState?.size?.width,
      draftCreatedBy,
      draftPath,
      draftShareId,
      initialData?.icon,
      initialData?.name,
      initialData?.title,
      initialData?.windowHeight,
      initialData?.windowWidth,
      setDraftFromSnapshot,
      studioDraft?.html,
      studioDraft?.icon,
      studioDraft?.name,
      studioDraft?.title,
      studioDraft?.windowHeight,
      studioDraft?.windowWidth,
      username,
    ]
  );

  const createDraft = useCallback(async () => {
    const success = await runStudioRequest("create", promptInput);
    if (success) {
      setPromptInput("");
    }
  }, [promptInput, runStudioRequest]);

  const beginCreateFlow = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        setStudioError("Describe what you want to build first.");
        return;
      }
      openCreateMode(trimmedPrompt, { fresh: true });
      setPromptInput(trimmedPrompt);
      const success = await runStudioRequest("create", trimmedPrompt);
      if (success) {
        setPromptInput("");
      }
    },
    [openCreateMode, runStudioRequest]
  );

  const refineDraft = useCallback(async () => {
    if (!studioDraft) {
      setStudioError("Create a draft before asking Ryo for edits.");
      return;
    }
    const success = await runStudioRequest("edit", promptInput);
    if (success) {
      setPromptInput("");
    }
  }, [promptInput, runStudioRequest, studioDraft]);

  const setDraftMetadata = useCallback(
    (updates: Partial<Pick<StudioDraftSnapshot, "title" | "icon" | "name">>) => {
      if (!studioDraft) return;
      const nextSnapshot: StudioDraftSnapshot = {
        ...studioDraft,
        ...updates,
      };
      setHistory((prev) => {
        const next = [...prev];
        next[historyIndex] = nextSnapshot;
        return next;
      });
      syncInitialData({
        mode: "create",
        path: draftPath,
        content: nextSnapshot.html,
        title: nextSnapshot.title,
        icon: nextSnapshot.icon,
        name: nextSnapshot.name,
      });
    },
    [draftPath, historyIndex, studioDraft, syncInitialData]
  );

  const saveDraft = useCallback(async () => {
    if (!studioDraft) {
      toast.error("Nothing to save yet", {
        description: "Create a draft in Ryo Studio first.",
      });
      return null;
    }

    const existingFile = draftPath ? getFileItem(draftPath) : null;
    let nextPath = draftPath;

    if (!nextPath) {
      const baseName = appendExtension(
        sanitizeFileStem(studioDraft.name || studioDraft.title)
      );
      nextPath = `/Applets/${baseName}`;
      if (getFileItem(nextPath)) {
        let suffix = 2;
        const stem = sanitizeFileStem(studioDraft.name || studioDraft.title);
        while (getFileItem(nextPath)) {
          nextPath = `/Applets/${appendExtension(`${stem} ${suffix}`)}`;
          suffix += 1;
        }
      }
    }

    const fileName = nextPath.split("/").pop() || appendExtension(studioDraft.name);

    await saveFile({
      path: nextPath,
      name: fileName,
      content: studioDraft.html,
      type: "html",
      icon: studioDraft.icon,
      shareId: existingFile?.shareId || draftShareId || undefined,
      createdBy: existingFile?.createdBy || draftCreatedBy || username || undefined,
    });

    updateFileItemMetadata(nextPath, {
      windowWidth: studioDraft.windowWidth,
      windowHeight: studioDraft.windowHeight,
    });

    emitFileSaved({
      name: fileName,
      path: nextPath,
      content: studioDraft.html,
      icon: studioDraft.icon,
    });

    setDraftPath(nextPath);
    setDraftShareId(existingFile?.shareId || draftShareId || "");
    setDraftCreatedBy(existingFile?.createdBy || draftCreatedBy || username || null);
    ensureStudioWorkspaceSize();
    syncInitialData({
      mode: "create",
      path: nextPath,
      content: studioDraft.html,
      title: studioDraft.title,
      icon: studioDraft.icon,
      name: studioDraft.name,
      shareId: existingFile?.shareId || draftShareId || undefined,
      windowWidth: studioDraft.windowWidth,
      windowHeight: studioDraft.windowHeight,
    });

    toast.success("Draft saved to Finder", {
      description: `${fileName} is ready in /Applets`,
    });

    return nextPath;
  }, [
    draftCreatedBy,
    draftPath,
    draftShareId,
    getFileItem,
    saveFile,
    studioDraft,
    syncInitialData,
    updateFileItemMetadata,
    username,
  ]);

  const publishDraft = useCallback(async () => {
    if (!studioDraft) {
      toast.error("Nothing to publish yet", {
        description: "Create a draft in Ryo Studio first.",
      });
      return;
    }

    if (!username || !authToken) {
      toast.error("Login required", {
        description: "Sign in before publishing applets to the store.",
      });
      return;
    }

    const ensuredPath = await saveDraft();
    const currentFile = ensuredPath ? getFileItem(ensuredPath) : null;

    try {
      const response = await abortableFetch(getApiUrl("/api/share-applet"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "X-Username": username,
        },
        body: JSON.stringify({
          content: studioDraft.html,
          title: studioDraft.title,
          icon: studioDraft.icon,
          name:
            currentFile?.name ||
            appendExtension(sanitizeFileStem(studioDraft.name || studioDraft.title)),
          windowWidth: currentWindowState?.size?.width || studioDraft.windowWidth,
          windowHeight:
            currentWindowState?.size?.height || studioDraft.windowHeight,
          shareId: currentFile?.shareId || draftShareId || undefined,
        }),
        timeout: 30000,
        retry: { maxAttempts: 1 },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to publish applet");
      }

      if (ensuredPath) {
        const savedFile = getFileItem(ensuredPath);
        await saveFile({
          path: ensuredPath,
          name: savedFile?.name || ensuredPath.split("/").pop() || "Applet.app",
          content: studioDraft.html,
          type: "html",
          icon: studioDraft.icon,
          shareId: data.id,
          createdBy: savedFile?.createdBy || username,
        });

        updateFileItemMetadata(ensuredPath, {
          storeCreatedAt: data.updatedAt || data.createdAt,
          windowWidth: studioDraft.windowWidth,
          windowHeight: studioDraft.windowHeight,
        });
      }

      setDraftShareId(data.id);
      setDraftCreatedBy(username);
      syncInitialData({
        mode: "create",
        path: ensuredPath || draftPath,
        content: studioDraft.html,
        title: studioDraft.title,
        icon: studioDraft.icon,
        name: studioDraft.name,
        shareId: data.id,
      });

      toast.success(data.updated ? "Applet updated in the store" : "Applet published", {
        description: data.updated
          ? `Version ${data.version} is now live.`
          : "Your draft is now available in the Applet Store.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to publish applet";
      toast.error("Publish failed", {
        description: message,
      });
    }
  }, [
    authToken,
    currentWindowState?.size?.height,
    currentWindowState?.size?.width,
    draftPath,
    draftShareId,
    getFileItem,
    saveDraft,
    saveFile,
    studioDraft,
    syncInitialData,
    updateFileItemMetadata,
    username,
  ]);

  const undoDraft = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const snapshot = history[nextIndex];
    setHistoryIndex(nextIndex);
    setLastReply(snapshot.reply);
    ensureStudioWorkspaceSize();
    syncInitialData({
      mode: "create",
      path: draftPath,
      content: snapshot.html,
      title: snapshot.title,
      icon: snapshot.icon,
      name: snapshot.name,
    });
  }, [draftPath, ensureStudioWorkspaceSize, history, historyIndex, syncInitialData]);

  const starterPrompts = useMemo(
    () => [
      "Build a tiny Pomodoro timer with a big start button and soft sounds.",
      "Make a habit tracker with streaks and one-click daily check-ins.",
      "Create a note card app that flips between front and back study prompts.",
      "Build a calm countdown timer for tea with preset brew times.",
    ],
    []
  );

  return {
    isStudioActive,
    promptInput,
    setPromptInput,
    isGenerating,
    studioError,
    lastReply,
    studioDraft,
    draftPath,
    draftShareId,
    canUndo: historyIndex > 0,
    hasDraft: Boolean(studioDraft),
    isLoggedIn: Boolean(username && authToken),
    starterPrompts,
    beginCreateFlow,
    openCreateMode,
    closeStudio,
    startStudioFromCurrentApplet,
    createDraft,
    refineDraft,
    undoDraft,
    saveDraft,
    publishDraft,
    setDraftMetadata,
  };
}
