import { generateJSON, type JSONContent } from "@tiptap/core";
import { useAppStore } from "@/stores/useAppStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { markdownToHtml } from "@/utils/markdown";
import { TEXTEDIT_TIPTAP_EXTENSIONS } from "./textEditSerialization";

export type SyncTextEditDocumentOptions = {
  path: string;
  content: string;
  fileName?: string;
  launchIfMissing: boolean;
  bringToForeground: boolean;
  includeFilePathOnUpdate: boolean;
};

export type SyncTextEditDocumentResult = {
  instanceId: string | null;
  updated: boolean;
  launched: boolean;
};

const buildTextEditContentJson = (content: string): JSONContent => {
  const htmlFragment = markdownToHtml(content);
  return generateJSON(htmlFragment, TEXTEDIT_TIPTAP_EXTENSIONS);
};

const dispatchDocumentUpdatedEvent = (
  path: string,
  contentJson: JSONContent,
): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("documentUpdated", {
      detail: { path, content: JSON.stringify(contentJson) },
    }),
  );
};

const findLiveTextEditInstanceIdByPath = (path: string): string | null => {
  const appStore = useAppStore.getState();
  const textEditStore = useTextEditStore.getState();

  for (const [instanceId, instance] of Object.entries(textEditStore.instances)) {
    if (instance.filePath !== path) {
      continue;
    }

    if (appStore.instances[instanceId]) {
      return instanceId;
    }

    textEditStore.removeInstance(instanceId);
  }

  return null;
};

export const syncTextEditDocumentForPath = ({
  path,
  content,
  fileName,
  launchIfMissing,
  bringToForeground,
  includeFilePathOnUpdate,
}: SyncTextEditDocumentOptions): SyncTextEditDocumentResult => {
  const appStore = useAppStore.getState();
  const textEditStore = useTextEditStore.getState();
  const liveInstanceId = findLiveTextEditInstanceIdByPath(path);

  if (liveInstanceId) {
    const contentJson = buildTextEditContentJson(content);
    textEditStore.updateInstance(liveInstanceId, {
      ...(includeFilePathOnUpdate ? { filePath: path } : {}),
      contentJson,
      hasUnsavedChanges: false,
    });
    dispatchDocumentUpdatedEvent(path, contentJson);

    if (bringToForeground) {
      appStore.bringInstanceToForeground(liveInstanceId);
    }

    return {
      instanceId: liveInstanceId,
      updated: true,
      launched: false,
    };
  }

  if (!launchIfMissing) {
    return {
      instanceId: null,
      updated: false,
      launched: false,
    };
  }

  const windowTitle = (fileName || "").replace(/\.md$/, "") || "Untitled";
  const launchedInstanceId = appStore.launchApp(
    "textedit",
    { path, content },
    windowTitle,
    true,
  );

  return {
    instanceId: launchedInstanceId,
    updated: false,
    launched: true,
  };
};
