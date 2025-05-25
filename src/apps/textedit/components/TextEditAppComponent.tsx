import { useState, useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { TextEditMenuBar } from "./TextEditMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata, helpItems } from "..";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { SlashCommands } from "../extensions/SlashCommands";
import {
  SpeechHighlight,
  speechHighlightKey,
} from "../extensions/SpeechHighlight";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import {
  dbOperations,
  STORES,
  DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AudioInputButton } from "@/components/ui/audio-input-button";
import { ChevronDown, Volume2, Loader2 } from "lucide-react";
import { PlaybackBars } from "@/components/ui/playback-bars";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useSound, Sounds } from "@/hooks/useSound";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import {
  htmlToMarkdown,
  markdownToHtml,
  htmlToPlainText,
} from "@/utils/markdown";
import { useAppStore } from "@/stores/useAppStore";
import { JSONContent, Editor } from "@tiptap/core";

// Define the type for TextEdit initial data
interface TextEditInitialData {
  path?: string;
  content?: string;
}

// Function to remove file extension
const removeFileExtension = (filename: string): string => {
  return filename.replace(/\.[^/.]+$/, "");
};

// Function to safely convert file content (string or Blob) to string
const getContentAsString = async (
  content: string | Blob | undefined
): Promise<string> => {
  if (!content) return "";
  if (content instanceof Blob) {
    return await content.text();
  }
  return content;
};

// Helper function to generate suggested filename
const generateSuggestedFilename = (
  customTitle: string | undefined,
  editor: Editor | null
): string => {
  // First priority: use custom title if provided
  if (customTitle && customTitle.trim() && customTitle !== "Untitled") {
    return (
      customTitle
        .split(/\s+/) // Split into words
        .filter(Boolean)
        .slice(0, 7) // Keep at most 7 words
        .join("-") // Join with hyphens
        .replace(/[^a-zA-Z0-9-]/g, "") // Remove non-alphanumeric (except hyphen)
        .substring(0, 50) || "Untitled"
    ); // Cap to 50 characters, fallback to Untitled
  }

  // Second priority: extract from first line of content
  if (editor) {
    const content = editor.getHTML();
    const firstLineText = content
      .split("\n")[0] // Get first line
      .replace(/<[^>]+>/g, "") // Remove HTML tags
      .trim(); // Remove leading/trailing whitespace

    // Take the first 7 words, sanitise, join with hyphens, and cap length
    const firstLine = firstLineText
      .split(/\s+/) // Split into words
      .filter(Boolean)
      .slice(0, 7) // Keep at most 7 words
      .join("-") // Join with hyphens
      .replace(/[^a-zA-Z0-9-]/g, "") // Remove non-alphanumeric (except hyphen)
      .substring(0, 50); // Cap to 50 characters

    return firstLine || "Untitled";
  }

  return "Untitled";
};

export function TextEditAppComponent({
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
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isConfirmNewDialogOpen, setIsConfirmNewDialogOpen] = useState(false);
  const [isCloseSaveDialogOpen, setIsCloseSaveDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { saveFile } = useFileSystem("/Documents");
  const launchApp = useLaunchApp();
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const clearInitialData = useAppStore((state) => state.clearInitialData);
  const launchAppInstance = useAppStore((state) => state.launchApp);

  // Use store actions directly to avoid reference changes
  const createTextEditInstance = useTextEditStore(
    (state) => state.createInstance
  );
  const removeTextEditInstance = useTextEditStore(
    (state) => state.removeInstance
  );
  const updateTextEditInstance = useTextEditStore(
    (state) => state.updateInstance
  );
  const textEditInstances = useTextEditStore((state) => state.instances);

  // Legacy store methods for single-window mode
  const legacySetFilePath = useTextEditStore((state) => state.setLastFilePath);
  const legacySetContentJson = useTextEditStore(
    (state) => state.setContentJson
  );
  const legacySetHasUnsavedChanges = useTextEditStore(
    (state) => state.setHasUnsavedChanges
  );
  const legacyFilePath = useTextEditStore((state) => state.lastFilePath);
  const legacyContentJson = useTextEditStore((state) => state.contentJson);
  const legacyHasUnsavedChanges = useTextEditStore(
    (state) => state.hasUnsavedChanges
  );

  // Create instance when component mounts (only if using instanceId)
  useEffect(() => {
    if (instanceId) {
      createTextEditInstance(instanceId);
    }
  }, [instanceId, createTextEditInstance]);

  // Clean up instance when component unmounts (only if using instanceId)
  useEffect(() => {
    if (!instanceId) return;

    return () => {
      removeTextEditInstance(instanceId);
    };
  }, [instanceId]);

  // Get current instance data (only if using instanceId)
  const currentInstance = instanceId ? textEditInstances[instanceId] : null;

  // Use instance data if available, otherwise use legacy store
  const currentFilePath = instanceId
    ? currentInstance?.filePath || null
    : legacyFilePath;

  const contentJson = instanceId
    ? currentInstance?.contentJson || null
    : legacyContentJson;

  const hasUnsavedChanges = instanceId
    ? currentInstance?.hasUnsavedChanges || false
    : legacyHasUnsavedChanges;

  const setCurrentFilePath = useCallback(
    (path: string | null) => {
      if (instanceId) {
        // Always use instance-specific method for instances
        updateTextEditInstance(instanceId, { filePath: path });
      } else {
        // Only use legacy method for non-instance mode
        legacySetFilePath(path);
      }
    },
    [instanceId, updateTextEditInstance, legacySetFilePath]
  );

  const setContentJson = useCallback(
    (json: JSONContent | null) => {
      if (instanceId) {
        // Always use instance-specific method for instances
        updateTextEditInstance(instanceId, { contentJson: json });
      } else {
        // Only use legacy method for non-instance mode
        legacySetContentJson(json);
      }
    },
    [instanceId, updateTextEditInstance, legacySetContentJson]
  );

  const setHasUnsavedChanges = useCallback(
    (val: boolean) => {
      if (instanceId) {
        // Always use instance-specific method for instances
        updateTextEditInstance(instanceId, { hasUnsavedChanges: val });
      } else {
        // Only use legacy method for non-instance mode
        legacySetHasUnsavedChanges(val);
      }
    },
    [instanceId, updateTextEditInstance, legacySetHasUnsavedChanges]
  );

  // Local UI-only state for Save dialog filename
  const [saveFileName, setSaveFileName] = useState("");
  const [closeSaveFileName, setCloseSaveFileName] = useState("");
  const editorContentRef = useRef<string>(""); // Ref to store latest markdown content for debounced save

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      SlashCommands,
      SpeechHighlight,
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "prose prose-sm prose-neutral max-w-none focus:outline-none p-4 [&>ul]:list-disc [&>ol]:list-decimal [&>*]:my-1 [&>p]:leading-5 [&>h1]:mt-3 [&>h1]:mb-2 [&>h2]:mt-2 [&>h2]:mb-1 [&>ul]:my-1 [&>ol]:my-1 [&>ul>li]:my-0.5 [&>ol>li]:my-0.5 [&>ul]:pl-0 [&>ol]:pl-4 [&>ul>li>p]:my-0 [&>ol>li>p]:my-0 [&>ul>li]:pl-0 [&>ol>li]:pl-0 [&>ul>li]:marker:text-neutral-900 [&>ol>li]:marker:text-neutral-900 [&>ul[data-type='taskList']]:ml-0 [&>ul[data-type='taskList']]:list-none [&>ul[data-type='taskList']>li]:flex [&>ul[data-type='taskList']>li]:items-start [&>ul[data-type='taskList']>li>label]:mr-2 [&>ul[data-type='taskList']>li>label>input]:mt-1 [&>ul[data-type='taskList']>li>div]:flex-1 [&>ul[data-type='taskList']>li>div>p]:my-0 [&>ul>li>ul]:pl-1 [&>ol>li>ol]:pl-1 [&>ul>li>ol]:pl-1 [&>ol>li>ul]:pl-1 [&>ul>li>ul]:my-0 [&>ol>li>ol]:my-0 [&>ul>li>ul>li>p]:my-0 min-h-full font-geneva-12 text-[12px] [&>h1]:text-[24px] [&>h2]:text-[20px] [&>h3]:text-[16px] [&>h1]:font-['ChicagoKare'] [&>h2]:font-['ChicagoKare'] [&>h3]:font-['ChicagoKare']",
      },
    },
    onUpdate: ({ editor }) => {
      // Only mark changes and store latest content/JSON in onUpdate
      const currentJson = editor.getJSON();
      setContentJson(currentJson); // Update store JSON for recovery
      editorContentRef.current = htmlToMarkdown(editor.getHTML()); // Store latest markdown
      if (!hasUnsavedChanges) {
        setHasUnsavedChanges(true);
        console.log(
          "[TextEdit] Content changed, marked as unsaved. Instance ID:",
          instanceId,
          "Has path:",
          !!currentFilePath
        );
      }
    },
  });

  // --- Debounced Autosave Effect --- //
  useEffect(() => {
    // Only run if there are changes and a file path exists
    if (hasUnsavedChanges && currentFilePath) {
      console.log(
        "[TextEdit] Changes detected, scheduling autosave for:",
        currentFilePath,
        "Instance ID:",
        instanceId
      );
      const handler = setTimeout(async () => {
        console.log("[TextEdit] Autosaving:", currentFilePath);
        const fileName = currentFilePath.split("/").pop() || "Untitled";
        try {
          await saveFile({
            name: fileName,
            path: currentFilePath,
            content: editorContentRef.current, // Save the latest markdown content from ref
          });
          setHasUnsavedChanges(false); // Mark as saved after successful save
          console.log("[TextEdit] Autosave successful:", currentFilePath);
        } catch (error) {
          console.error("[TextEdit] Autosave failed:", error);
          // Optionally notify user or leave hasUnsavedChanges true
        }
      }, 1500); // Autosave after 1.5 seconds of inactivity

      // Cleanup function to clear timeout if changes occur before saving
      return () => {
        console.log(
          "[TextEdit] Keystroke detected, clearing autosave timeout."
        );
        clearTimeout(handler);
      };
    } else if (hasUnsavedChanges && !currentFilePath) {
      console.log(
        "[TextEdit] Has unsaved changes but no file path - autosave skipped. Instance ID:",
        instanceId
      );
    }
  }, [
    hasUnsavedChanges,
    currentFilePath,
    saveFile,
    setHasUnsavedChanges,
    instanceId,
  ]); // Dependencies: trigger on change flag or path change
  // --- End Autosave Effect --- //

  // Initial load - Restore last session or use initialData
  useEffect(() => {
    if (!editor) return;

    const loadContent = async () => {
      // Prioritize initialData passed from launch event
      const typedInitialData = initialData as TextEditInitialData;
      if (typedInitialData?.path && typedInitialData?.content !== undefined) {
        console.log(
          "[TextEdit] Loading content from initialData:",
          typedInitialData.path
        );
        const { path, content } = typedInitialData;

        const contentToUse = typeof content === "string" ? content : "";
        let editorContent: string | object;

        if (path.endsWith(".md")) {
          editorContent = markdownToHtml(contentToUse);
        } else {
          try {
            editorContent = JSON.parse(contentToUse);
          } catch {
            editorContent = `<p>${contentToUse}</p>`;
          }
        }

        editor.commands.setContent(editorContent, false);
        setCurrentFilePath(path);
        setHasUnsavedChanges(false);
        setContentJson(editor.getJSON());

        // Clear the initialData from the store now that we've consumed it
        if (!instanceId) {
          clearInitialData("textedit");
        }
        return; // Don't proceed to load from store/DB if initialData was used
      }

      // For instance mode, we don't restore from legacy store
      if (instanceId) {
        // Instance starts fresh unless we have initialData
        return;
      }

      // For legacy mode, try to restore from persisted state
      let loadedContent = false;

      // 1) Prefer any unsaved in-memory edits that were never written to disk.
      if (legacyHasUnsavedChanges && legacyContentJson) {
        try {
          editor.commands.setContent(legacyContentJson, false); // avoid onUpdate
          // Keep the unsaved flag so the UI continues to show the "•" indicator
          loadedContent = true;
          console.log("Restored unsaved TextEdit content from store");
        } catch (err) {
          console.warn("Failed to restore unsaved TextEdit content:", err);
        }
      }

      // 2) If nothing unsaved, attempt to load the persisted document from the DB.
      if (!loadedContent && legacyFilePath?.startsWith("/Documents/")) {
        try {
          // Import the file store to get UUID
          const { useFilesStore } = await import("@/stores/useFilesStore");
          const fileStore = useFilesStore.getState();
          const fileMetadata = fileStore.getItem(legacyFilePath);

          if (fileMetadata && fileMetadata.uuid) {
            const doc = await dbOperations.get<DocumentContent>(
              STORES.DOCUMENTS,
              fileMetadata.uuid
            );

            if (doc?.content) {
              const contentStr = await getContentAsString(doc.content);
              let editorContent;

              if (legacyFilePath.endsWith(".md")) {
                editorContent = markdownToHtml(contentStr);
              } else {
                try {
                  editorContent = JSON.parse(contentStr);
                } catch {
                  editorContent = `<p>${contentStr}</p>`;
                }
              }

              if (editorContent) {
                editor.commands.setContent(editorContent, false);
                setHasUnsavedChanges(false); // freshly loaded, so no unsaved edits yet
                loadedContent = true;
                console.log("Loaded content from file:", legacyFilePath);
              }
            } else {
              console.warn("Document not found or empty:", legacyFilePath);
            }
          } else {
            console.warn(
              "File metadata or UUID not found for:",
              legacyFilePath
            );
          }
        } catch (err) {
          console.error("Error loading file content from DB:", err);
        }
      }

      // 3) Finally, fall back to any stored JSON even if it wasn't flagged unsaved (legacy behaviour).
      if (!loadedContent && legacyContentJson) {
        try {
          editor.commands.setContent(legacyContentJson, false);
          setHasUnsavedChanges(false);
          console.log("Loaded content from store JSON (fallback)");
        } catch (err) {
          console.warn("Failed to restore stored TextEdit content:", err);
        }
      }
    };

    loadContent();
  }, [
    editor,
    initialData,
    instanceId,
    legacyFilePath,
    legacyContentJson,
    legacyHasUnsavedChanges,
  ]); // Don't include setters to avoid loops

  // Add listeners for external document updates (like from Chat app)
  useEffect(() => {
    // Listen for direct content update requests
    const handleUpdateEditorContent = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath && e.detail?.content) {
        try {
          // Try to parse the content as JSON
          const jsonContent = JSON.parse(e.detail.content);

          // Keep the current cursor position if possible
          const { from, to } = editor.state.selection;

          // Update the content
          editor.commands.setContent(jsonContent);

          // Try to restore cursor position
          if (from && to && from === to) {
            try {
              editor.commands.setTextSelection(
                Math.min(from, editor.state.doc.content.size)
              );
            } catch (e) {
              console.log("Could not restore cursor position", e);
            }
          }

          // Make sure we don't mark this as an unsaved change
          setHasUnsavedChanges(false);

          console.log("Editor content updated from external source");
        } catch (error) {
          console.error("Failed to update editor content:", error);
        }
      }
    };

    // Handle document updated notifications
    const handleDocumentUpdated = (e: CustomEvent) => {
      if (editor && e.detail?.path === currentFilePath && e.detail?.content) {
        try {
          const jsonContent = JSON.parse(e.detail.content);
          editor.commands.setContent(jsonContent);
          setHasUnsavedChanges(false);
          console.log("Editor content updated after document updated event");
        } catch (error) {
          console.error(
            "Failed to update editor with document updated event:",
            error
          );
        }
      }
    };

    // Set up event listeners
    window.addEventListener(
      "updateEditorContent",
      handleUpdateEditorContent as EventListener
    );
    window.addEventListener(
      "documentUpdated",
      handleDocumentUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        "updateEditorContent",
        handleUpdateEditorContent as EventListener
      );
      window.removeEventListener(
        "documentUpdated",
        handleDocumentUpdated as EventListener
      );
    };
  }, [
    editor,
    currentFilePath,
    setHasUnsavedChanges,
    instanceId,
    currentInstance,
    legacyContentJson,
  ]);

  // --- Sync editor when contentJson is externally updated (e.g., by AI tools) --- //
  useEffect(() => {
    if (!editor || !contentJson) return;

    // Avoid unnecessary updates by comparing with current editor JSON
    const currentJson = editor.getJSON();
    if (JSON.stringify(currentJson) === JSON.stringify(contentJson)) return;

    try {
      editor.commands.setContent(contentJson, false); // update silently
      setHasUnsavedChanges(false);
      console.log("[TextEdit] Editor content synced from store change");
    } catch (err) {
      console.error("[TextEdit] Failed to sync editor content:", err);
    }
  }, [contentJson, editor, setHasUnsavedChanges]);
  // --- End external sync effect --- //

  const handleTranscriptionComplete = (text: string) => {
    setIsTranscribing(false);
    if (editor) {
      // If editor is not focused, focus it first
      if (!editor.isFocused) {
        editor.commands.focus();
      }

      // If there's no selection (cursor position), move to the end and add a new paragraph
      if (editor.state.selection.empty && editor.state.selection.anchor === 0) {
        editor.commands.setTextSelection(editor.state.doc.content.size);
        editor.commands.insertContent("\n");
      }

      // Insert the transcribed text at current cursor position
      editor.commands.insertContent(text);
    }
  };

  const handleTranscriptionStart = () => {
    setIsTranscribing(true);
  };

  const handleNewFile = () => {
    // Instead of clearing current instance, create a new one
    const newInstanceId = launchAppInstance("textedit", null, "Untitled", true);
    console.log(`Created new TextEdit file in instance: ${newInstanceId}`);
  };

  const createNewFile = () => {
    // This is used for drag and drop - clears current instance content
    if (editor) {
      editor.commands.clearContent();
      setContentJson(null);
      setCurrentFilePath(null);
      setHasUnsavedChanges(false);

      // Check if there's a pending file to open after creating new file
      const pendingFileOpen = localStorage.getItem("pending_file_open");
      if (pendingFileOpen) {
        try {
          const { path, content } = JSON.parse(pendingFileOpen);
          if (path.startsWith("/Documents/")) {
            const processedContent = path.endsWith(".md")
              ? markdownToHtml(content)
              : content;
            editor.commands.setContent(processedContent);
            setCurrentFilePath(path);
            setHasUnsavedChanges(false);
            // Store the file path for next time
            setCurrentFilePath(path);
            // Store content in case app crashes
            setContentJson(editor.getJSON());
          }
        } catch (e) {
          console.error("Failed to parse pending file open data:", e);
        } finally {
          localStorage.removeItem("pending_file_open");
        }
      }
    }
  };

  const handleSave = async () => {
    if (!editor) return;

    if (!currentFilePath) {
      // Generate suggested filename using title or first line of content
      const suggestedName = generateSuggestedFilename(customTitle, editor);

      setIsSaveDialogOpen(true);
      setSaveFileName(`${suggestedName}.md`);
    } else {
      try {
        // Get the markdown content and JSON
        const htmlContent = editor.getHTML();
        const markdownContent = htmlToMarkdown(htmlContent);
        const jsonContent = editor.getJSON();

        // Save the file to IndexedDB
        await saveFile({
          name: currentFilePath.split("/").pop() || "Untitled.md",
          path: currentFilePath,
          content: markdownContent,
        });

        // Only update state after successful save
        setContentJson(jsonContent);
        setHasUnsavedChanges(false);

        console.log("[TextEdit] File saved successfully:", currentFilePath);
      } catch (error) {
        console.error("[TextEdit] Failed to save file:", error);
        // Could show a toast notification here
      }
    }
  };

  const handleSaveSubmit = async (fileName: string) => {
    if (!editor) return;

    const filePath = `/Documents/${fileName}${
      fileName.endsWith(".md") ? "" : ".md"
    }`;

    try {
      // Get the markdown content and JSON
      const htmlContent = editor.getHTML();
      const markdownContent = htmlToMarkdown(htmlContent);
      const jsonContent = editor.getJSON();

      // Save the file to IndexedDB
      await saveFile({
        name: fileName.endsWith(".md") ? fileName : `${fileName}.md`,
        path: filePath,
        content: markdownContent,
      });

      // Only update state after successful save
      setContentJson(jsonContent);
      setCurrentFilePath(filePath);
      setHasUnsavedChanges(false);
      setIsSaveDialogOpen(false);

      console.log("[TextEdit] File saved successfully:", filePath);
    } catch (error) {
      console.error("[TextEdit] Failed to save file:", error);
      // Could show a toast notification here
    }
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file && editor) {
      const filePath = `/Documents/${file.name}`;

      const text = await file.text();

      // Convert content based on file type
      let editorContent;
      if (file.name.endsWith(".html")) {
        editorContent = text;
      } else if (file.name.endsWith(".md")) {
        editorContent = markdownToHtml(text);
      } else {
        editorContent = `<p>${text}</p>`;
      }

      editor.commands.setContent(editorContent);

      // Always save in markdown format, converting from HTML if needed
      const markdownContent = file.name.endsWith(".md")
        ? text // Use original markdown if it's already markdown
        : htmlToMarkdown(editor.getHTML()); // Convert to markdown otherwise

      // Use saveFile API directly for file imports
      try {
        await saveFile({
          name: file.name,
          path: filePath,
          content: markdownContent,
        });

        // Only update state after successful save
        setCurrentFilePath(filePath);
        setHasUnsavedChanges(false);

        // Store JSON for internal recovery
        setContentJson(editor.getJSON());

        console.log("[TextEdit] File imported successfully:", filePath);
      } catch (error) {
        console.error("[TextEdit] Failed to import file:", error);
        // Revert the editor content on failure?
      }
    }

    // Reset the input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleExportFile = (format: "html" | "md" | "txt") => {
    if (!editor) return;

    const html = editor.getHTML();
    let content: string;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case "md":
        content = htmlToMarkdown(html);
        mimeType = "text/markdown";
        extension = "md";
        break;
      case "txt":
        content = htmlToPlainText(html);
        mimeType = "text/plain";
        extension = "txt";
        break;
      case "html":
      default:
        content = html;
        mimeType = "text/html";
        extension = "html";
        break;
    }

    // Use "Untitled" as default name for unsaved files
    const filename = currentFilePath
      ? removeFileExtension(currentFilePath.split("/").pop() || "")
      : "Untitled";

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = () => {
    launchApp("finder", { initialPath: "/Documents" });
  };

  // Handler for intercepting close events
  const handleClose = () => {
    // Check if there are unsaved changes or if it's an untitled file
    const isUntitled = !currentFilePath;
    const hasContent =
      editor &&
      (!editor.isEmpty ||
        editor.getText().trim().length > 0 ||
        editor.getHTML() !== "<p></p>");

    if (hasUnsavedChanges || (isUntitled && hasContent)) {
      // Suggest filename for untitled documents
      if (isUntitled && editor) {
        const suggestedName = generateSuggestedFilename(customTitle, editor);
        setCloseSaveFileName(`${suggestedName}.md`);
      } else {
        // For existing files, suggest the current filename
        setCloseSaveFileName(
          currentFilePath?.split("/").pop() || "Untitled.md"
        );
      }

      setIsCloseSaveDialogOpen(true);
    } else {
      // Dispatch close event to WindowFrame with callback
      window.dispatchEvent(
        new CustomEvent(`closeWindow-${instanceId || "textedit"}`, {
          detail: { onComplete: onClose },
        })
      );
    }
  };

  const handleCloseDelete = () => {
    setIsCloseSaveDialogOpen(false);
    // Close without saving
    window.dispatchEvent(
      new CustomEvent(`closeWindow-${instanceId || "textedit"}`, {
        detail: { onComplete: onClose },
      })
    );
  };

  const handleCloseSave = async (fileName: string) => {
    if (!editor) return;

    const filePath = `/Documents/${fileName}${
      fileName.endsWith(".md") ? "" : ".md"
    }`;

    try {
      // Get the markdown content and JSON
      const htmlContent = editor.getHTML();
      const markdownContent = htmlToMarkdown(htmlContent);
      const jsonContent = editor.getJSON();

      // Save the file to IndexedDB
      await saveFile({
        name: fileName.endsWith(".md") ? fileName : `${fileName}.md`,
        path: filePath,
        content: markdownContent,
      });

      // Only update state after successful save
      setContentJson(jsonContent);
      setCurrentFilePath(filePath);
      setHasUnsavedChanges(false);
      setIsCloseSaveDialogOpen(false);

      console.log(
        "[TextEdit] File saved successfully before closing:",
        filePath
      );

      // Close after saving
      window.dispatchEvent(
        new CustomEvent(`closeWindow-${instanceId || "textedit"}`, {
          detail: { onComplete: onClose },
        })
      );
    } catch (error) {
      console.error("[TextEdit] Failed to save file before closing:", error);
      // Don't close if save failed - user might want to try again
    }
  };

  // Function to handle dropped files
  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const file = e.dataTransfer.files[0];
    if (file && editor) {
      // Only accept text and markdown files
      if (!file.type.startsWith("text/") && !file.name.endsWith(".md")) {
        return;
      }

      const filePath = `/Documents/${file.name}`;

      const text = await file.text();

      // Convert content based on file type
      let content;
      if (file.name.endsWith(".html")) {
        content = text;
      } else if (file.name.endsWith(".md")) {
        content = markdownToHtml(text);
      } else {
        content = `<p>${text}</p>`;
      }

      // If there are unsaved changes, prompt the user
      if (hasUnsavedChanges) {
        setIsConfirmNewDialogOpen(true);
        // Store the dropped file temporarily
        localStorage.setItem(
          "pending_file_open",
          JSON.stringify({
            path: filePath,
            content: content,
          })
        );
      } else {
        editor.commands.clearContent();
        editor.commands.setContent(content);

        // Save in markdown format
        const markdownContent = file.name.endsWith(".md")
          ? text // Use original markdown if it's already markdown
          : htmlToMarkdown(editor.getHTML()); // Convert to markdown otherwise

        // Save the file using the unified approach
        try {
          await saveFile({
            name: file.name,
            path: filePath,
            content: markdownContent,
          });

          // Only update state after successful save
          setCurrentFilePath(filePath);
          setHasUnsavedChanges(false);

          // Store JSON for internal recovery
          setContentJson(editor.getJSON());

          console.log(
            "[TextEdit] File dropped and saved successfully:",
            filePath
          );
        } catch (error) {
          console.error("[TextEdit] Failed to save dropped file:", error);
          // Revert the editor content on failure?
          editor.commands.clearContent();
        }
      }
    }
  };

  // --- Text-to-Speech (TTS) --- //
  const { speak, stop, isSpeaking } = useTtsQueue();
  const speechEnabled = useAppStore((state) => state.speechEnabled);

  // Local UI state for TTS loading (waiting for audio to begin)
  const [isTtsLoading, setIsTtsLoading] = useState(false);

  // When speech starts, clear the loading state
  useEffect(() => {
    if (isSpeaking) {
      setIsTtsLoading(false);
    }
  }, [isSpeaking]);

  /** Speak either the current selection or the full document */
  const handleSpeak = () => {
    if (!editor) return;

    // Helper to highlight an editor range using the decoration plugin
    const highlightRange = (from: number, to: number) => {
      const { state, view } = editor;
      const tr = state.tr.setMeta(speechHighlightKey, { range: { from, to } });
      view.dispatch(tr);
    };

    // Helper to clear any existing highlight
    const clearHighlight = () => {
      const { state, view } = editor;
      const tr = state.tr.setMeta(speechHighlightKey, { clear: true });
      view.dispatch(tr);
    };

    // If currently speaking, clicking stops playback
    if (isSpeaking) {
      stop();
      clearHighlight();
      return;
    }

    // If we are already waiting for TTS response, cancel it on second click
    if (isTtsLoading) {
      stop();
      setIsTtsLoading(false);
      return;
    }

    const { from, to, empty } = editor.state.selection;

    if (empty) {
      // Collect all textblock nodes with their positions so we can highlight
      const blocks: { text: string; from: number; to: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock && node.textContent.trim()) {
          const from = pos + 1; // +1 to skip the opening tag
          const to = pos + node.nodeSize - 1; // -1 to skip the closing tag
          blocks.push({
            text: node.textContent.trim(),
            from,
            to,
          });
        }
      });

      if (blocks.length === 0) return;

      setIsTtsLoading(true);

      // Queue every block immediately so network fetches start in parallel
      blocks.forEach(({ text }, idx) => {
        speak(text, () => {
          const nextIdx = idx + 1;
          if (nextIdx < blocks.length) {
            const nextBlock = blocks[nextIdx];
            clearHighlight();
            highlightRange(nextBlock.from, nextBlock.to);
          } else {
            clearHighlight();
          }
        });
      });

      // Highlight the first block right away
      const { from: firstFrom, to: firstTo } = blocks[0];
      highlightRange(firstFrom, firstTo);
    } else {
      // Speak the selected text as-is
      const textToSpeak = editor.state.doc.textBetween(from, to, "\n").trim();
      if (textToSpeak) {
        setIsTtsLoading(true);

        // Highlight the selection
        highlightRange(from, to);

        speak(textToSpeak, () => {
          clearHighlight();
        });
      }
    }
  };

  // Determine if the window title should display the unsaved indicator. This
  // should show when there are unsaved changes or when an untitled document
  // contains any content but hasn't been saved to a file yet.
  const showUnsavedIndicator =
    hasUnsavedChanges ||
    (!currentFilePath &&
      editor &&
      (!editor.isEmpty ||
        editor.getText().trim().length > 0 ||
        editor.getHTML() !== "<p></p>"));

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".txt,.html,.md,.rtf,.doc,.docx"
        className="hidden"
      />
      <TextEditMenuBar
        editor={editor}
        onClose={handleClose}
        isWindowOpen={isWindowOpen}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        onNewFile={handleNewFile}
        onImportFile={handleImportFile}
        onExportFile={handleExportFile}
        onSave={handleSave}
        hasUnsavedChanges={hasUnsavedChanges}
        currentFilePath={currentFilePath}
        handleFileSelect={handleFileSelect}
      />
      <WindowFrame
        title={
          customTitle ||
          (currentFilePath
            ? `${removeFileExtension(currentFilePath.split("/").pop() || "")}${
                hasUnsavedChanges ? " •" : ""
              }`
            : `Untitled${showUnsavedIndicator ? " •" : ""}`)
        }
        onClose={handleClose}
        isForeground={isForeground}
        appId="textedit"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        interceptClose={true}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div className="flex flex-col h-full w-full">
          <div
            className={`flex-1 flex flex-col bg-white relative min-h-0 ${
              isDraggingOver
                ? "after:absolute after:inset-0 after:bg-black/20"
                : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isDraggingOver) setIsDraggingOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Check if we're leaving to a child element
              const relatedTarget = e.relatedTarget as Node | null;
              if (e.currentTarget.contains(relatedTarget)) {
                return;
              }
              setIsDraggingOver(false);
            }}
            onDragEnd={() => setIsDraggingOver(false)}
            onMouseLeave={() => setIsDraggingOver(false)}
            onDrop={handleFileDrop}
          >
            <div className="flex bg-[#c0c0c0] border-b border-black w-full flex-shrink-0">
              <div className="flex px-1 py-1 gap-x-1">
                {/* Text style group */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleBold().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/bold-${
                        editor?.isActive("bold") ? "depressed" : "off"
                      }.png`}
                      alt="Bold"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleItalic().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/italic-${
                        editor?.isActive("italic") ? "depressed" : "off"
                      }.png`}
                      alt="Italic"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleUnderline().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/underline-${
                        editor?.isActive("underline") ? "depressed" : "off"
                      }.png`}
                      alt="Underline"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* Heading selector */}
                <div className="flex">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="w-[80px] h-[22px] flex items-center justify-between px-2 bg-white border border-[#808080] text-sm">
                        {editor?.isActive("heading", { level: 1 })
                          ? "H1"
                          : editor?.isActive("heading", { level: 2 })
                          ? "H2"
                          : editor?.isActive("heading", { level: 3 })
                          ? "H3"
                          : "Text"}
                        <ChevronDown className="ml-1 h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[80px]">
                      <DropdownMenuItem
                        onClick={() =>
                          editor?.chain().focus().setParagraph().run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("paragraph") ? "bg-gray-200" : ""
                        }`}
                      >
                        Text
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          editor
                            ?.chain()
                            .focus()
                            .toggleHeading({ level: 1 })
                            .run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("heading", { level: 1 })
                            ? "bg-gray-200"
                            : ""
                        }`}
                      >
                        H1
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          editor
                            ?.chain()
                            .focus()
                            .toggleHeading({ level: 2 })
                            .run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("heading", { level: 2 })
                            ? "bg-gray-200"
                            : ""
                        }`}
                      >
                        H2
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          editor
                            ?.chain()
                            .focus()
                            .toggleHeading({ level: 3 })
                            .run()
                        }
                        className={`text-sm h-6 px-2 ${
                          editor?.isActive("heading", { level: 3 })
                            ? "bg-gray-200"
                            : ""
                        }`}
                      >
                        H3
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* Alignment group */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().setTextAlign("left").run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/align-left-${
                        editor?.isActive({ textAlign: "left" })
                          ? "depressed"
                          : "off"
                      }.png`}
                      alt="Align Left"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().setTextAlign("center").run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/align-center-${
                        editor?.isActive({ textAlign: "center" })
                          ? "depressed"
                          : "off"
                      }.png`}
                      alt="Align Center"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().setTextAlign("right").run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/align-right-${
                        editor?.isActive({ textAlign: "right" })
                          ? "depressed"
                          : "off"
                      }.png`}
                      alt="Align Right"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* List group */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleBulletList().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/unordered-list-${
                        editor?.isActive("bulletList") ? "depressed" : "off"
                      }.png`}
                      alt="Bullet List"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                  <button
                    onClick={() => {
                      playButtonClick();
                      editor?.chain().focus().toggleOrderedList().run();
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                  >
                    <img
                      src={`/icons/text-editor/ordered-list-${
                        editor?.isActive("orderedList") ? "depressed" : "off"
                      }.png`}
                      alt="Ordered List"
                      className="w-[26px] h-[22px]"
                    />
                  </button>
                </div>

                {/* Divider */}
                <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

                {/* Voice transcription & speech */}
                <div className="flex">
                  <AudioInputButton
                    onTranscriptionComplete={handleTranscriptionComplete}
                    onTranscriptionStart={handleTranscriptionStart}
                    isLoading={isTranscribing}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                    silenceThreshold={10000}
                  />
                  {speechEnabled && (
                    <button
                      onClick={() => {
                        playButtonClick();
                        handleSpeak();
                      }}
                      className="w-[26px] h-[22px] flex items-center justify-center"
                      aria-label={isSpeaking ? "Stop speech" : "Speak"}
                    >
                      {isTtsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isSpeaking ? (
                        <PlaybackBars color="black" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <EditorContent
              editor={editor}
              className="flex-1 overflow-y-auto w-full min-h-0"
            />
          </div>
          <InputDialog
            isOpen={isSaveDialogOpen}
            onOpenChange={setIsSaveDialogOpen}
            onSubmit={handleSaveSubmit}
            title="Save File"
            description="Enter a name for your file"
            value={saveFileName}
            onChange={setSaveFileName}
          />
          <ConfirmDialog
            isOpen={isConfirmNewDialogOpen}
            onOpenChange={setIsConfirmNewDialogOpen}
            onConfirm={() => {
              createNewFile();
              setIsConfirmNewDialogOpen(false);
            }}
            title="Discard Changes"
            description="Do you want to discard your changes and create a new file?"
          />
          <InputDialog
            isOpen={isCloseSaveDialogOpen}
            onOpenChange={setIsCloseSaveDialogOpen}
            onSubmit={handleCloseSave}
            title="Keep New Document"
            description={
              "Enter a filename to save, or delete it before closing."
            }
            value={closeSaveFileName}
            onChange={setCloseSaveFileName}
            submitLabel="Save"
            additionalActions={[
              {
                label: "Delete",
                onClick: handleCloseDelete,
                variant: "retro" as const,
                position: "left" as const,
              },
            ]}
          />
          <HelpDialog
            isOpen={isHelpDialogOpen}
            onOpenChange={setIsHelpDialogOpen}
            helpItems={helpItems}
            appName="TextEdit"
          />
          <AboutDialog
            isOpen={isAboutDialogOpen}
            onOpenChange={setIsAboutDialogOpen}
            metadata={appMetadata}
          />
        </div>
      </WindowFrame>
    </>
  );
}
