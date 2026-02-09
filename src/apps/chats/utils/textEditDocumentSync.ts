import { generateJSON, type JSONContent } from "@tiptap/core";
import { useAppStore } from "@/stores/useAppStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { markdownToHtml } from "@/utils/markdown";
import { TEXTEDIT_TIPTAP_EXTENSIONS } from "./textEditSerialization";
import {
  syncTextEditDocumentForPathCore,
  type SyncTextEditDocumentOptions,
  type SyncTextEditDocumentResult,
} from "./textEditDocumentSyncCore";

export type { SyncTextEditDocumentOptions, SyncTextEditDocumentResult };

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
  return syncTextEditDocumentForPathCore(
    {
      path,
      content,
      fileName,
      launchIfMissing,
      bringToForeground,
      includeFilePathOnUpdate,
    },
    {
      appInstances: appStore.instances,
      foregroundInstanceId: appStore.foregroundInstanceId,
      instanceOrder: appStore.instanceOrder,
      textEditInstances: textEditStore.instances,
      removeTextEditInstance: textEditStore.removeInstance,
      updateTextEditInstance: textEditStore.updateInstance,
      bringToForeground: appStore.bringInstanceToForeground,
      launchTextEdit: (initialData, windowTitle) =>
        appStore.launchApp("textedit", initialData, windowTitle, true),
      buildContentJson: buildTextEditContentJson,
      dispatchDocumentUpdated: dispatchDocumentUpdatedEvent,
    },
  );
};
