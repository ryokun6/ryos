import { useState, useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { WorkIntelMenuBar } from "./WorkIntelMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata, helpItems } from "..";
import { useWorkIntelStore } from "@/stores/useWorkIntelStore";
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
import { ChevronDown, Volume2, Loader2, Eye, EyeOff } from "lucide-react";
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

// Define the type for WorkIntel initial data
interface WorkIntelInitialData {
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

export function WorkIntelAppComponent({
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
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { saveFile } = useFileSystem("/Documents");
  const launchApp = useLaunchApp();
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const clearInitialData = useAppStore((state) => state.clearInitialData);
  const launchAppInstance = useAppStore((state) => state.launchApp);

  // Use store actions directly to avoid reference changes
  const createWorkIntelInstance = useWorkIntelStore(
    (state) => state.createInstance
  );
  const removeWorkIntelInstance = useWorkIntelStore(
    (state) => state.removeInstance
  );
  const updateWorkIntelInstance = useWorkIntelStore(
    (state) => state.updateInstance
  );
  const workIntelInstances = useWorkIntelStore((state) => state.instances);

  // Legacy store methods for single-window mode
  const legacySetFilePath = useWorkIntelStore((state) => state.setLastFilePath);
  const legacySetContentJson = useWorkIntelStore(
    (state) => state.setContentJson
  );
  const legacySetHasUnsavedChanges = useWorkIntelStore(
    (state) => state.setHasUnsavedChanges
  );
  const legacyFilePath = useWorkIntelStore((state) => state.lastFilePath);
  const legacyContentJson = useWorkIntelStore((state) => state.contentJson);
  const legacyHasUnsavedChanges = useWorkIntelStore(
    (state) => state.hasUnsavedChanges
  );

  // Create instance when component mounts (only if using instanceId)
  useEffect(() => {
    if (instanceId) {
      createWorkIntelInstance(instanceId);
    }
  }, [instanceId, createWorkIntelInstance]);

  // Clean up instance when component unmounts (only if using instanceId)
  useEffect(() => {
    if (!instanceId) return;

    return () => {
      removeWorkIntelInstance(instanceId);
    };
  }, [instanceId]);

  // Get current instance data (only if using instanceId)
  const currentInstance = instanceId ? workIntelInstances[instanceId] : null;

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
        updateWorkIntelInstance(instanceId, { filePath: path });
      } else {
        // Only use legacy method for non-instance mode
        legacySetFilePath(path);
      }
    },
    [instanceId, updateWorkIntelInstance, legacySetFilePath]
  );

  const setCurrentContentJson = useCallback(
    (json: JSONContent | null) => {
      if (instanceId) {
        // Always use instance-specific method for instances
        updateWorkIntelInstance(instanceId, { contentJson: json });
      } else {
        // Only use legacy method for non-instance mode
        legacySetContentJson(json);
      }
    },
    [instanceId, updateWorkIntelInstance, legacySetContentJson]
  );

  const setCurrentHasUnsavedChanges = useCallback(
    (val: boolean) => {
      if (instanceId) {
        // Always use instance-specific method for instances
        updateWorkIntelInstance(instanceId, { hasUnsavedChanges: val });
      } else {
        // Only use legacy method for non-instance mode
        legacySetHasUnsavedChanges(val);
      }
    },
    [instanceId, updateWorkIntelInstance, legacySetHasUnsavedChanges]
  );

  // Initialize editor with extensions
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      SlashCommands,
      SpeechHighlight.configure({
        HTMLAttributes: {
          class: "bg-yellow-200",
        },
      }),
    ],
    content: contentJson,
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      setCurrentContentJson(json);
      setCurrentHasUnsavedChanges(true);
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none p-4",
      },
    },
  });

  // Load content from initial data or file path
  useEffect(() => {
    const loadContent = async () => {
      if (!editor) return;

      // If we have initial data, load it
      if (initialData) {
        const data = initialData as WorkIntelInitialData;
        
        if (data.path) {
          setCurrentFilePath(data.path);
        }
        
        if (data.content) {
          const content = await getContentAsString(data.content);
          
          // Check if content is markdown
          const isMarkdown = content.trim().startsWith('#') || 
                           content.includes('**') || 
                           content.includes('*') || 
                           content.includes('[') ||
                           content.includes('```');
          
          if (isMarkdown) {
            // Convert markdown to HTML and then to editor JSON
            const html = markdownToHtml(content);
            const json = editor.parser.parse(html);
            editor.commands.setContent(json);
          } else {
            // Treat as plain text
            editor.commands.setContent(content);
          }
          
          setCurrentHasUnsavedChanges(false);
        }
        
        // Clear initial data after loading
        clearInitialData(instanceId || "workintel");
        return;
      }

      // If we have a file path but no content, try to load from file system
      if (currentFilePath && !contentJson) {
        try {
          const fileContent = await dbOperations.getFileContent(currentFilePath);
          if (fileContent) {
            const content = await getContentAsString(fileContent);
            
            // Check if content is markdown
            const isMarkdown = content.trim().startsWith('#') || 
                             content.includes('**') || 
                             content.includes('*') || 
                             content.includes('[') ||
                             content.includes('```');
            
            if (isMarkdown) {
              // Convert markdown to HTML and then to editor JSON
              const html = markdownToHtml(content);
              const json = editor.parser.parse(html);
              editor.commands.setContent(json);
            } else {
              // Treat as plain text
              editor.commands.setContent(content);
            }
            
            setCurrentHasUnsavedChanges(false);
          }
        } catch (error) {
          console.error("Failed to load file content:", error);
        }
      }
    };

    loadContent();
  }, [editor, initialData, currentFilePath, contentJson, instanceId, clearInitialData]);

  // Handle external content updates
  useEffect(() => {
    const handleUpdateEditorContent = (e: CustomEvent) => {
      if (!editor) return;
      
      const { content, isMarkdown = false } = e.detail;
      
      if (isMarkdown) {
        // Convert markdown to HTML and then to editor JSON
        const html = markdownToHtml(content);
        const json = editor.parser.parse(html);
        editor.commands.setContent(json);
      } else {
        // Treat as plain text
        editor.commands.setContent(content);
      }
      
      setCurrentHasUnsavedChanges(true);
    };

    const handleDocumentUpdated = (e: CustomEvent) => {
      if (!editor) return;
      
      const { path, content } = e.detail;
      
      // Only update if this is the current file
      if (path === currentFilePath) {
        const isMarkdown = path.endsWith('.md') || path.endsWith('.markdown');
        
        if (isMarkdown) {
          // Convert markdown to HTML and then to editor JSON
          const html = markdownToHtml(content);
          const json = editor.parser.parse(html);
          editor.commands.setContent(json);
        } else {
          // Treat as plain text
          editor.commands.setContent(content);
        }
        
        setCurrentHasUnsavedChanges(false);
      }
    };

    window.addEventListener("updateEditorContent", handleUpdateEditorContent);
    window.addEventListener("documentUpdated", handleDocumentUpdated);

    return () => {
      window.removeEventListener("updateEditorContent", handleUpdateEditorContent);
      window.removeEventListener("documentUpdated", handleDocumentUpdated);
    };
  }, [editor, currentFilePath]);

  // Transcription handlers
  const handleTranscriptionComplete = (text: string) => {
    if (editor) {
      editor.chain().focus().insertContent(text).run();
      setCurrentHasUnsavedChanges(true);
    }
    setIsTranscribing(false);
  };

  const handleTranscriptionStart = () => {
    setIsTranscribing(true);
  };

  // File management handlers
  const handleNewFile = () => {
    if (hasUnsavedChanges) {
      setIsConfirmNewDialogOpen(true);
    } else {
      createNewFile();
    }
  };

  const createNewFile = () => {
    if (editor) {
      editor.commands.clearContent();
      setCurrentFilePath(null);
      setCurrentHasUnsavedChanges(false);
    }
  };

  const handleSave = async () => {
    if (!editor) return;

    if (currentFilePath) {
      // Save to existing file
      const content = editor.getHTML();
      const isMarkdown = currentFilePath.endsWith('.md') || currentFilePath.endsWith('.markdown');
      
      let saveContent: string;
      if (isMarkdown) {
        // Convert HTML to markdown for markdown files
        saveContent = htmlToMarkdown(content);
      } else {
        // Keep as HTML for other file types
        saveContent = content;
      }
      
      await saveFile({
        path: currentFilePath,
        name: currentFilePath.split("/").pop() || "document",
        content: saveContent,
        type: currentFilePath.endsWith('.md') || currentFilePath.endsWith('.markdown') ? 'markdown' : 'text'
      });
      setCurrentHasUnsavedChanges(false);
    } else {
      // Show save dialog for new file
      setIsSaveDialogOpen(true);
    }
  };

  const handleSaveSubmit = async (fileName: string) => {
    if (!editor) return;

    const content = editor.getHTML();
    const isMarkdown = fileName.endsWith('.md') || fileName.endsWith('.markdown');
    
    let saveContent: string;
    if (isMarkdown) {
      // Convert HTML to markdown for markdown files
      saveContent = htmlToMarkdown(content);
    } else {
      // Keep as HTML for other file types
      saveContent = content;
    }
    
    const filePath = `/Documents/${fileName}`;
    await saveFile({
      path: filePath,
      name: fileName,
      content: saveContent,
      type: fileName.endsWith('.md') || fileName.endsWith('.markdown') ? 'markdown' : 'text'
    });
    setCurrentFilePath(filePath);
    setCurrentHasUnsavedChanges(false);
    setIsSaveDialogOpen(false);
  };

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file || !editor) return;

    try {
      const content = await file.text();
      const isMarkdown = file.name.endsWith('.md') || file.name.endsWith('.markdown');
      
      if (isMarkdown) {
        // Convert markdown to HTML and then to editor JSON
        const html = markdownToHtml(content);
        const json = editor.parser.parse(html);
        editor.commands.setContent(json);
      } else {
        // Treat as plain text
        editor.commands.setContent(content);
      }
      
      setCurrentFilePath(`/Documents/${file.name}`);
      setCurrentHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to read file:", error);
    }

    // Reset file input
    event.target.value = "";
  };

  const handleExportFile = (format: "html" | "md" | "txt") => {
    if (!editor) return;

    const content = editor.getHTML();
    let exportContent: string;
    let fileName: string;

    switch (format) {
      case "html":
        exportContent = content;
        fileName = "document.html";
        break;
      case "md":
        exportContent = htmlToMarkdown(content);
        fileName = "document.md";
        break;
      case "txt":
        exportContent = htmlToPlainText(content);
        fileName = "document.txt";
        break;
    }

    const blob = new Blob([exportContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = () => {
    fileInputRef.current?.click();
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      setIsCloseSaveDialogOpen(true);
    } else {
      onClose();
    }
  };

  const handleCloseDelete = () => {
    if (editor) {
      editor.commands.clearContent();
      setCurrentFilePath(null);
      setCurrentHasUnsavedChanges(false);
    }
    setIsCloseSaveDialogOpen(false);
    onClose();
  };

  const handleCloseSave = async (fileName: string) => {
    await handleSaveSubmit(fileName);
    setIsCloseSaveDialogOpen(false);
    onClose();
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const files = Array.from(e.dataTransfer.files);
    const textFile = files.find(
      (file) =>
        file.type === "text/plain" ||
        file.type === "text/html" ||
        file.type === "text/markdown" ||
        file.name.endsWith(".txt") ||
        file.name.endsWith(".html") ||
        file.name.endsWith(".md") ||
        file.name.endsWith(".markdown")
    );

    if (textFile && editor) {
      try {
        const content = await textFile.text();
        const isMarkdown = textFile.name.endsWith('.md') || textFile.name.endsWith('.markdown');
        
        if (isMarkdown) {
          // Convert markdown to HTML and then to editor JSON
          const html = markdownToHtml(content);
          const json = editor.parser.parse(html);
          editor.commands.setContent(json);
        } else {
          // Treat as plain text
          editor.commands.setContent(content);
        }
        
        setCurrentFilePath(`/Documents/${textFile.name}`);
        setCurrentHasUnsavedChanges(false);
      } catch (error) {
        console.error("Failed to read dropped file:", error);
      }
    }
  };

  // Speech synthesis
  const { speak, isSpeaking, isTtsLoading, setIsTtsLoading } = useTtsQueue();
  const speechEnabled = true;

  const handleSpeak = () => {
    if (!editor) return;

    const { from, to } = editor.state.selection;

    if (from === to) {
      // No selection - speak all content
      const blocks: Array<{ text: string; from: number; to: number }> = [];

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

  // Highlight functions for speech
  const highlightRange = (from: number, to: number) => {
    editor?.chain().setMark(speechHighlightKey).run();
  };

  const clearHighlight = () => {
    editor?.chain().unsetMark(speechHighlightKey).run();
  };

  // Determine if the window title should display the unsaved indicator
  const showUnsavedIndicator =
    hasUnsavedChanges ||
    (!currentFilePath &&
      editor &&
      (!editor.isEmpty ||
        editor.getText().trim().length > 0 ||
        editor.getHTML() !== "<p></p>"));

  // State for save dialogs
  const [saveFileName, setSaveFileName] = useState(
    generateSuggestedFilename(customTitle, editor)
  );
  const [closeSaveFileName, setCloseSaveFileName] = useState(
    generateSuggestedFilename(customTitle, editor)
  );

  // Update suggested filenames when editor content changes
  useEffect(() => {
    const newFileName = generateSuggestedFilename(customTitle, editor);
    setSaveFileName(newFileName);
    setCloseSaveFileName(newFileName);
  }, [customTitle, editor]);

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".txt,.html,.md,.markdown,.rtf,.doc,.docx"
        className="hidden"
      />
      <WorkIntelMenuBar
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
        isPreviewMode={isPreviewMode}
        onTogglePreview={() => setIsPreviewMode(!isPreviewMode)}
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
        appId="workintel"
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

                {/* Preview mode toggle */}
                <div className="flex">
                  <button
                    onClick={() => {
                      playButtonClick();
                      setIsPreviewMode(!isPreviewMode);
                    }}
                    className="w-[26px] h-[22px] flex items-center justify-center"
                    title={isPreviewMode ? "Edit Mode" : "Preview Mode"}
                  >
                    {isPreviewMode ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
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
            
            {isPreviewMode ? (
              <div className="flex-1 overflow-y-auto w-full min-h-0 p-4 prose prose-sm max-w-none">
                <div 
                  dangerouslySetInnerHTML={{ 
                    __html: editor ? markdownToHtml(htmlToMarkdown(editor.getHTML())) : "" 
                  }} 
                />
              </div>
            ) : (
              <EditorContent
                editor={editor}
                className="flex-1 overflow-y-auto w-full min-h-0"
              />
            )}
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
            appName="WorkIntel"
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