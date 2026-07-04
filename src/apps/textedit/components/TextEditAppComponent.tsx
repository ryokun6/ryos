import { useState, useEffect, useRef, useCallback } from "react";
import { JSONContent } from "@tiptap/core";
import { AppProps } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { TextEditMenuBar } from "./TextEditMenuBar";
import { EditorProvider } from "./EditorProvider";
import { useEditorContext } from "./EditorContext";
import { EditorToolbar } from "./EditorToolbar";
import { TextEditor } from "./TextEditor";
import { SpeechManager } from "./SpeechManager";
import { DialogManager, DialogControls } from "./DialogManager";
import { useTextEditState } from "../hooks/useTextEditState";
import { useFileOperations } from "../hooks/useFileOperations";
import { useDragAndDrop } from "../hooks/useDragAndDrop";
import {
  removeFileExtension,
  TextEditInitialData,
} from "../utils/textEditUtils";
import { useAppStore } from "@/stores/useAppStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useTranslation } from "react-i18next";
import {
  onDocumentUpdated,
  onDocumentContentSynced,
} from "@/utils/appEventBus";
import {
  mergeEditorContent,
  type MergeableContent,
} from "../utils/mergeEditorContent";
import { persistedContentToEditorContent } from "../utils/documentContent";
import { readDocumentTextContent } from "@/services/vfs/FileContentRepository";
import { getFileMetadata } from "@/services/vfs/FileMetadataService";
import { useRegisterUndoRedo } from "@/hooks/useUndoRedo";
import { useMenuShortcuts } from "@/hooks/useMenuShortcuts";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { getTextAnalytics, TEXTEDIT_ANALYTICS, track } from "@/utils/analytics";
import { openNativeFile } from "@/utils/nativeFileDialogs";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("TextEdit");

// Debounce window for mirroring the editor content into the persisted store on
// each keystroke, plus a max wait so continuous typing still snapshots for
// crash recovery.
const CONTENT_PERSIST_DEBOUNCE_MS = 500;
const CONTENT_PERSIST_MAX_WAIT_MS = 2000;

// Inner component that has access to editor context
function TextEditContent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  title: customTitle,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const { t } = useTranslation();
  const editor = useEditorContext();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingImportRef = useRef<File | null>(null);
  const launchApp = useLaunchApp();
  const clearInstanceInitialData = useAppStore(
    (state) => state.clearInstanceInitialData
  );
  const launchAppInstance = useAppStore((state) => state.launchApp);
  const { isWindowsTheme, currentTheme } = useThemeFlags();
  const speechEnabled = useAudioSettingsStore((state) => state.speechEnabled);
  // Local UI-only state for Save dialog filename
  const [saveFileName, setSaveFileName] = useState("");
  const [closeSaveFileName, setCloseSaveFileName] = useState("");
  const [dialogControls, setDialogControls] = useState<DialogControls | null>(
    null
  );

  // Register undo/redo with the universal system
  useRegisterUndoRedo(instanceId!, {
    undo: () => editor?.chain().focus().undo().run(),
    redo: () => editor?.chain().focus().redo().run(),
    canUndo: editor?.can().undo() ?? false,
    canRedo: editor?.can().redo() ?? false,
  });

  // Use our custom hooks
  const {
    currentFilePath,
    contentJson,
    hasUnsavedChanges,
    setCurrentFilePath,
    setContentJson,
    setHasUnsavedChanges,
    currentInstance,
  } = useTextEditState({ instanceId: instanceId! });
  const isInstanceReady = currentInstance !== null;

  // Mirror editor content into the persisted store on a short debounce, with a
  // max wait so a long uninterrupted typing burst still snapshots for crash
  // recovery. `lastWrittenJsonRef` records the exact object we persist so the
  // external-merge effect can tell our own writes apart from genuinely external
  // updates (AI edits, cloud/file sync) and not fight the user's edits.
  const lastWrittenJsonRef = useRef<JSONContent | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPersistAtRef = useRef(0);

  const flushContentJson = useCallback(() => {
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    if (!editor) return;
    const json = editor.getJSON();
    lastWrittenJsonRef.current = json;
    lastPersistAtRef.current = Date.now();
    setContentJson(json);
  }, [editor, setContentJson]);

  const scheduleContentJsonPersist = useCallback(() => {
    // Snapshot immediately if it has been a while (bounds recovery staleness
    // during continuous typing); otherwise debounce the trailing write.
    if (Date.now() - lastPersistAtRef.current >= CONTENT_PERSIST_MAX_WAIT_MS) {
      flushContentJson();
      return;
    }
    if (persistTimerRef.current !== null) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(
      flushContentJson,
      CONTENT_PERSIST_DEBOUNCE_MS
    );
  }, [flushContentJson]);

  // Flush any pending content snapshot when the editor goes away / unmounts, or
  // when the page is being hidden/unloaded (reload, tab close, navigation) so a
  // debounced edit can't be lost from crash-recovery on a fast reload.
  useEffect(() => {
    const handlePageHide = () => flushContentJson();
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      flushContentJson();
    };
  }, [flushContentJson]);

  const {
    handleSave,
    handleSaveAs,
    handleImportFile,
    handleExportFile,
    handleLoadFromPath,
    handleLoadFromDatabase,
    generateSuggestedFileName,
  } = useFileOperations({
    editor,
    currentFilePath,
    customTitle,
    onSaveSuccess: useCallback(
      (filePath: string) => {
        setCurrentFilePath(filePath);
        setContentJson(editor?.getJSON() || null);
        setHasUnsavedChanges(false);
      },
      [editor, setCurrentFilePath, setContentJson, setHasUnsavedChanges]
    ),
    onLoadSuccess: useCallback(
      (filePath: string) => {
        setCurrentFilePath(filePath);
        setHasUnsavedChanges(false);
        setContentJson(editor?.getJSON() || null);
      },
      [editor, setCurrentFilePath, setHasUnsavedChanges, setContentJson]
    ),
  });

  const { isDraggingOver, dragHandlers } = useDragAndDrop({
    hasUnsavedChanges,
    onFileDropped: async (file) => {
      try {
        await handleImportFile(file);
      } catch (error) {
        console.error("Failed to handle dropped file:", error);
      }
    },
    onConfirmOverwrite: (file) => {
      pendingImportRef.current = file;
      dialogControls?.openConfirmNewDialog();
    },
  });

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = ({
      transaction,
    }: {
      transaction?: { getMeta: (key: string) => unknown };
    } = {}) => {
      // Reactive external updates are applied as transactions tagged with the
      // "external" meta. Ignore them here so merging cloud/sync/AI updates does
      // not mark the document dirty or fight the user's edits.
      if (transaction?.getMeta("external")) return;
      // Mirror the latest content into the persisted store for recovery. The
      // unsaved flag is still flipped immediately so the title indicator and
      // close confirmation react without delay.
      scheduleContentJsonPersist();
      if (!hasUnsavedChanges) {
        setHasUnsavedChanges(true);
        log.debug("Content changed; marked as unsaved", {
          instanceId,
          hasPath: Boolean(currentFilePath),
        });
      }
    };

    editor.on("update", handleUpdate);

    return () => {
      editor.off("update", handleUpdate);
    };
  }, [
    editor,
    hasUnsavedChanges,
    scheduleContentJsonPersist,
    setHasUnsavedChanges,
    instanceId,
    currentFilePath,
  ]);

  // Initial load - use initialData if provided
  useEffect(() => {
    if (!editor || !instanceId || !isInstanceReady) return;

    const loadContent = async () => {
      // Prioritize initialData passed from launch event
      const typedInitialData = initialData as TextEditInitialData;
      if (typedInitialData?.path && typedInitialData?.content !== undefined) {
        log.debug("Loading content from initialData", {
          path: typedInitialData.path,
          hasInlineContent: true,
        });
        await handleLoadFromPath(
          typedInitialData.path,
          typedInitialData.content
        );

        // Clear the initialData from the store now that we've consumed it
        clearInstanceInitialData(instanceId);
        return;
      } else if (
        typedInitialData?.path &&
        typedInitialData?.content === undefined
      ) {
        // If a path was provided but no inline content, try loading from DB
        log.debug("Loading content from database via initialData path", {
          path: typedInitialData.path,
        });
        await handleLoadFromDatabase(typedInitialData.path);
        clearInstanceInitialData(instanceId);
        return;
      }
    };

    loadContent();
  }, [
    editor,
    initialData,
    instanceId,
    isInstanceReady,
    handleLoadFromPath,
    handleLoadFromDatabase,
    clearInstanceInitialData,
  ]);

  // Instance restore: if we have a file path but no content yet after reload, load from DB
  useEffect(() => {
    if (!editor || !instanceId || !isInstanceReady) return;
    if (!contentJson && currentFilePath) {
      log.debug("Restoring instance content from DB", {
        path: currentFilePath,
      });
      void (async () => {
        const loaded = await handleLoadFromDatabase(currentFilePath);
        if (loaded) return;

        const metadata = getFileMetadata(currentFilePath);
        if (!metadata || metadata.status === "trashed") {
          log.debug("Clearing stale TextEdit file path after failed restore", {
            path: currentFilePath,
          });
          setCurrentFilePath(null);
        }
      })();
    }
  }, [
    editor,
    instanceId,
    isInstanceReady,
    contentJson,
    currentFilePath,
    handleLoadFromDatabase,
    setCurrentFilePath,
  ]);

  // Reactively merge externally-sourced content (cloud sync, file sync, or AI
  // edits) into the editor while preserving the user's caret, selection, focus
  // and scroll position. Returns true if the document changed.
  const applyExternalUpdate = useCallback(
    (content: MergeableContent): boolean => {
      if (!editor) return false;
      const changed = mergeEditorContent(editor, content);
      // Keep the per-instance store mirror in sync and treat external updates as
      // a clean baseline so they don't surface as unsaved changes.
      setContentJson(editor.getJSON());
      setHasUnsavedChanges(false);
      return changed;
    },
    [editor, setContentJson, setHasUnsavedChanges]
  );

  // Add listeners for external document updates
  useEffect(() => {
    const handleUpdateEditorContent = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath && e.detail?.content) {
        try {
          const jsonContent = JSON.parse(e.detail.content);
          applyExternalUpdate(jsonContent);
          log.debug("Editor content merged from external source");
        } catch (error) {
          console.error("Failed to update editor content:", error);
        }
      }
    };

    const handleDocumentUpdated = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath && e.detail?.content) {
        try {
          const jsonContent = JSON.parse(e.detail.content);
          applyExternalUpdate(jsonContent);
          log.debug("Editor content merged after document updated event");
        } catch (error) {
          console.error(
            t("apps.textedit.failedToUpdateEditorWithDocumentUpdatedEvent"),
            error
          );
        }
      }
    };

    // Cloud / multi-device sync writes document content straight to storage.
    // Re-read the source of truth and merge it so open documents stay live.
    const handleDocumentContentSynced = (e: CustomEvent) => {
      if (!editor || !currentFilePath) return;
      const paths = e.detail?.paths;
      if (!Array.isArray(paths) || !paths.includes(currentFilePath)) return;

      void (async () => {
        try {
          const contentStr = await readDocumentTextContent(currentFilePath);
          if (contentStr == null) return;
          const editorContent = persistedContentToEditorContent(
            currentFilePath,
            contentStr
          );
          const changed = applyExternalUpdate(editorContent);
          if (changed) {
            log.debug("Editor content merged from cloud/file sync", {
              path: currentFilePath,
            });
          }
        } catch (error) {
          console.error(
            "[TextEdit] Failed to merge synced document content:",
            error
          );
        }
      })();
    };

    window.addEventListener(
      "updateEditorContent",
      handleUpdateEditorContent as EventListener
    );
    const unsubscribeDocumentUpdated = onDocumentUpdated(handleDocumentUpdated);
    const unsubscribeDocumentContentSynced = onDocumentContentSynced(
      handleDocumentContentSynced
    );

    return () => {
      window.removeEventListener(
        "updateEditorContent",
        handleUpdateEditorContent as EventListener
      );
      unsubscribeDocumentUpdated();
      unsubscribeDocumentContentSynced();
    };
  }, [editor, currentFilePath, applyExternalUpdate, t]);

  // Sync editor when contentJson is externally updated (e.g. AI edit tool)
  useEffect(() => {
    if (!editor || !contentJson) return;
    // Skip our own debounced user-originated writes (matched by reference) so a
    // slightly-stale persisted snapshot can never be merged back over newer
    // keystrokes. Genuinely external updates arrive as different objects.
    if (contentJson === lastWrittenJsonRef.current) return;

    const currentJson = editor.getJSON();
    if (JSON.stringify(currentJson) === JSON.stringify(contentJson)) return;

    try {
      mergeEditorContent(editor, contentJson);
      setHasUnsavedChanges(false);
      log.debug("Editor content merged from store change");
    } catch (err) {
      console.error("[TextEdit] Failed to sync editor content:", err);
    }
  }, [contentJson, editor, setHasUnsavedChanges]);

  const handleTranscriptionComplete = (text: string) => {
    setIsTranscribing(false);
    track(TEXTEDIT_ANALYTICS.TRANSCRIBE, getTextAnalytics(text));
    if (editor) {
      if (!editor.isFocused) {
        editor.commands.focus();
      }

      if (editor.state.selection.empty && editor.state.selection.anchor === 0) {
        editor.commands.setTextSelection(editor.state.doc.content.size);
        editor.commands.insertContent("\n");
      }

      editor.commands.insertContent(text);
    }
  };

  const handleTranscriptionStart = () => {
    setIsTranscribing(true);
  };

  const handleNewFile = () => {
    const newInstanceId = launchAppInstance("textedit", null, t("apps.textedit.untitled"), true);
    track(TEXTEDIT_ANALYTICS.NEW_DOCUMENT, { appId: "textedit" });
    log.debug("Created new TextEdit file", { instanceId: newInstanceId });
  };

  const applyPendingImport = () => {
    const file = pendingImportRef.current;
    pendingImportRef.current = null;
    if (!file) return;

    void handleImportFile(file).catch((error) => {
      console.error("Failed to import dropped file:", error);
    });
  };

  const handleSaveClick = async () => {
    if (!currentFilePath) {
      const suggestedName = generateSuggestedFileName();
      setSaveFileName(`${suggestedName}.md`);
      dialogControls?.openSaveDialog();
    } else {
      try {
        await handleSave();
      } catch (error) {
        console.error("Save failed:", error);
      }
    }
  };

  const handleSaveSubmit = async (fileName: string) => {
    try {
      await handleSaveAs(fileName);
      dialogControls?.closeSaveDialog();
    } catch (error) {
      console.error("Save failed:", error);
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        await handleImportFile(file);
      } catch (error) {
        console.error("Import failed:", error);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleImportFromDevice = async () => {
    try {
      const file = await openNativeFile({
        title: "Import Text Document",
        filters: [
          {
            name: "Text Documents",
            extensions: ["txt", "html", "md", "rtf", "doc", "docx"],
          },
        ],
      });
      if (file) {
        await handleImportFile(file);
        return;
      }
    } catch (error) {
      console.error("Native import failed:", error);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleImportFileClick = () => {
    launchApp("finder", { initialPath: "/Documents" });
  };

  const handleClose = () => {
    const isUntitled = !currentFilePath;
    const hasContent =
      editor &&
      (!editor.isEmpty ||
        editor.getText().trim().length > 0 ||
        editor.getHTML() !== "<p></p>");

    if (hasUnsavedChanges || (isUntitled && hasContent)) {
      if (isUntitled && editor) {
        const suggestedName = generateSuggestedFileName();
        setCloseSaveFileName(`${suggestedName}.md`);
      } else {
        setCloseSaveFileName(
          currentFilePath?.split("/").pop() || `${t("apps.textedit.untitled")}.md`
        );
      }

      dialogControls?.openCloseSaveDialog();
    } else {
      window.dispatchEvent(
        new CustomEvent(`closeWindow-${instanceId || "textedit"}`, {
          detail: { onComplete: onClose },
        })
      );
    }
  };

  const handleCloseDelete = () => {
    dialogControls?.closeCloseSaveDialog();
    window.dispatchEvent(
      new CustomEvent(`closeWindow-${instanceId || "textedit"}`, {
        detail: { onComplete: onClose },
      })
    );
  };

  const handleCloseSave = async (fileName: string) => {
    try {
      if (currentFilePath) {
        await handleSave();
      } else {
        await handleSaveAs(fileName);
      }
      dialogControls?.closeCloseSaveDialog();
      window.dispatchEvent(
        new CustomEvent(`closeWindow-${instanceId || "textedit"}`, {
          detail: { onComplete: onClose },
        })
      );
    } catch (error) {
      console.error("Save before close failed:", error);
    }
  };

  // Menu-action keyboard shortcuts (foreground instance only). ⌘S/Ctrl+S Save
  // works on web and desktop; ⌘N/⌘O are browser-reserved so they fire in the
  // Electron shell (and ⌘O is intercepted on the web too).
  useMenuShortcuts(instanceId, {
    save: handleSaveClick,
    newFile: handleNewFile,
    open: handleImportFileClick,
  });

  const showUnsavedIndicator =
    hasUnsavedChanges ||
    (!currentFilePath &&
      editor &&
      (!editor.isEmpty ||
        editor.getText().trim().length > 0 ||
        editor.getHTML() !== "<p></p>"));

  const menuBar = (
    <TextEditMenuBar
      editor={editor}
      onClose={handleClose}
      isWindowOpen={isWindowOpen}
      onShowHelp={() => dialogControls?.openHelpDialog()}
      onShowAbout={() => dialogControls?.openAboutDialog()}
      onNewFile={handleNewFile}
      onImportFile={handleImportFileClick}
      onImportFromDevice={handleImportFromDevice}
      onExportFile={handleExportFile}
      onSave={handleSaveClick}
      hasUnsavedChanges={hasUnsavedChanges}
      currentFilePath={currentFilePath}
      instanceId={instanceId}
    />
  );

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      leading={
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".txt,.html,.md,.rtf,.doc,.docx"
          className="hidden"
        />
      }
      windowFrameProps={{
        title:
          customTitle ||
          (currentFilePath
            ? `${removeFileExtension(currentFilePath.split("/").pop() || "")}${
                hasUnsavedChanges ? " •" : ""
              }`
            : `${t("apps.textedit.untitled")}${showUnsavedIndicator ? " •" : ""}`),
        onClose: handleClose,
        isForeground,
        appId: "textedit",
        skipInitialSound,
        instanceId,
        interceptClose: true,
        onNavigateNext,
        onNavigatePrevious,
      }}
    >
        <div className="flex flex-col h-full w-full">
          <div
            className={`flex-1 flex flex-col relative min-h-0 ${
              isDraggingOver
                ? "after:absolute after:inset-0 after:bg-black/20"
                : ""
            }`}
            {...dragHandlers}
          >
            <SpeechManager editor={editor} speechEnabled={speechEnabled}>
              {({ isSpeaking, isTtsLoading, handleSpeak }) => (
                <>
                  <EditorToolbar
                    editor={editor}
                    currentTheme={currentTheme}
                    speechEnabled={speechEnabled}
                    isTranscribing={isTranscribing}
                    isTtsLoading={isTtsLoading}
                    isSpeaking={isSpeaking}
                    onTranscriptionComplete={handleTranscriptionComplete}
                    onTranscriptionStart={handleTranscriptionStart}
                    onSpeak={handleSpeak}
                  />
                  {/* Editor content container with correct positioning */}
                  <TextEditor className="flex-1 overflow-y-auto w-full min-h-0 bg-os-input-bg text-os-text-primary" />
                </>
              )}
            </SpeechManager>
          </div>

          <DialogManager
            saveFileName={saveFileName}
            setSaveFileName={setSaveFileName}
            closeSaveFileName={closeSaveFileName}
            setCloseSaveFileName={setCloseSaveFileName}
            onSaveSubmit={handleSaveSubmit}
            onCloseSave={handleCloseSave}
            onCloseDelete={handleCloseDelete}
            onConfirmNew={applyPendingImport}
            onCancelConfirmNew={() => {
              pendingImportRef.current = null;
            }}
            onControlsReady={setDialogControls}
            isUntitledForClose={!currentFilePath}
          />
        </div>
    </AppWindowShell>
  );
}

// Main component wrapper
export function TextEditAppComponent(props: AppProps) {
  return (
    <EditorProvider>
      <TextEditContent {...props} />
    </EditorProvider>
  );
}
