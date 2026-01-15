import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { TerminalMenuBar } from "./TerminalMenuBar";
import { appMetadata, helpItems } from "../index";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import {
  useFileSystem,
  dbOperations,
  DocumentContent,
} from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useAiChat } from "@/apps/chats/hooks/useAiChat";
import { useAppStore } from "@/stores/useAppStore";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import { track } from "@vercel/analytics";
import HtmlPreview, {
  isHtmlCodeBlock,
  extractHtmlContent,
} from "@/components/shared/HtmlPreview";
import { useSound, Sounds } from "@/hooks/useSound";
import { useChatsStore } from "@/stores/useChatsStore";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { getTranslatedAppName } from "@/utils/i18n";
import { generateHTML, type AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { htmlToMarkdown } from "@/utils/markdown";
import { useInternetExplorerStore } from "@/stores/useInternetExplorerStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useThemeStore } from "@/stores/useThemeStore";
import EmojiAquarium from "@/components/shared/EmojiAquarium";
import i18n from "@/lib/i18n";

// Import new components and utilities
import { CommandHistory, CommandContext, ToolInvocationData } from "../types";
import { parseCommand } from "../utils/commandParser";
import { commands, AVAILABLE_COMMANDS } from "../commands";
import { TerminalToolInvocation } from "./TerminalToolInvocation";
import { VimEditor } from "./VimEditor";
import { TypewriterText, parseSimpleMarkdown } from "./TypewriterText";
import { AnimatedEllipsis } from "./AnimatedEllipsis";
import { UrgentMessageAnimation } from "./UrgentMessageAnimation";

import { TERMINAL_ANALYTICS } from "@/utils/analytics";

// Removed interfaces and constants - now imported from separate files

// Helper function to detect user's operating system
const detectUserOS = (): string => {
  if (typeof navigator === "undefined") return i18n.t("apps.terminal.output.unknown");
  
  const userAgent = navigator.userAgent;
  const platform = navigator.platform || "";
  
  // Check for iOS (iPhone, iPad, iPod)
  if (/iPad|iPhone|iPod/.test(userAgent) || 
      (platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
    return "iOS";
  }
  
  // Check for Android
  if (/Android/.test(userAgent)) {
    return "Android";
  }
  
  // Check for Windows
  if (/Win/.test(platform)) {
    return "Windows";
  }
  
  // Check for macOS (not iOS)
  if (/Mac/.test(platform)) {
    return "macOS";
  }
  
  // Check for Linux
  if (/Linux/.test(platform)) {
    return "Linux";
  }
  
  return "Unknown";
};

// Minimal system state for AI chat requests
const getSystemState = () => {
  const appStore = useAppStore.getState();
  const { username } = useChatsStore.getState();
  const ieStore = useInternetExplorerStore.getState();
  const videoStore = useVideoStore.getState();
  const ipodStore = useIpodStore.getState();
  const textEditStore = useTextEditStore.getState();

  const currentVideo = videoStore.getCurrentVideo();
  const currentTrack = ipodStore.currentSongId
    ? ipodStore.tracks.find((t) => t.id === ipodStore.currentSongId)
    : ipodStore.tracks[0] ?? null;

  // Detect user's operating system
  const userOS = detectUserOS();

  // Use new instance-based model instead of legacy apps
  const runningInstances = Object.entries(appStore.instances)
    .filter(([, instance]) => instance.isOpen)
    .map(([instanceId, instance]) => {
      const base = {
        instanceId,
        appId: instance.appId,
        isForeground: instance.isForeground || false,
        title: instance.title,
      };
      // For applet-viewer instances, include the applet path
      if (instance.appId === "applet-viewer" && instance.initialData) {
        const appletData = instance.initialData as { path?: string; shareCode?: string };
        return {
          ...base,
          appletPath: appletData.path || undefined,
          appletId: appletData.shareCode || undefined,
        };
      }
      return base;
    });

  const foregroundInstance =
    runningInstances.find((inst) => inst.isForeground) || null;
  const backgroundInstances = runningInstances.filter(
    (inst) => !inst.isForeground
  );

  // --- Local browser time information (client side) ---
  const nowClient = new Date();
  const userTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || i18n.t("apps.terminal.output.unknown");
  const userTimeString = nowClient.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const userDateString = nowClient.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Convert TextEdit instances to compact markdown for prompt inclusion
  const textEditInstances = Object.values(textEditStore.instances);
  const textEditInstancesData = textEditInstances.map((instance) => {
    let contentMarkdown: string | null = null;
    if (instance.contentJson) {
      try {
        const htmlStr = generateHTML(instance.contentJson, [
          StarterKit,
          Underline,
          TextAlign.configure({ types: ["heading", "paragraph"] }),
          TaskList,
          TaskItem.configure({ nested: true }),
        ] as AnyExtension[]);
        contentMarkdown = htmlToMarkdown(htmlStr);
      } catch (err) {
        console.error("Failed to convert TextEdit content to markdown:", err);
      }
    }

    // Get title from app store instance
    const appInstance = appStore.instances[instance.instanceId];
    const title = appInstance?.title || i18n.t("apps.terminal.output.untitled");

    return {
      instanceId: instance.instanceId,
      filePath: instance.filePath,
      title,
      contentMarkdown,
      hasUnsavedChanges: instance.hasUnsavedChanges,
    };
  });

  // Convert IE HTML content to markdown for compact prompts
  let ieHtmlMarkdown: string | null = null;
  if (ieStore.aiGeneratedHtml) {
    try {
      ieHtmlMarkdown = htmlToMarkdown(ieStore.aiGeneratedHtml);
    } catch (err) {
      console.error("Failed to convert IE HTML to markdown:", err);
    }
  }

  return {
    // Keep legacy apps for backward compatibility, but mark that instances are preferred
    apps: appStore.apps,
    username,
    userOS,
    userLocalTime: {
      timeString: userTimeString,
      dateString: userDateString,
      timeZone: userTimeZone,
    },
    runningApps: {
      foreground: foregroundInstance,
      background: backgroundInstances,
      instanceWindowOrder: appStore.instanceOrder,
    },
    internetExplorer: {
      url: ieStore.url,
      year: ieStore.year,
      status: ieStore.status,
      currentPageTitle: ieStore.currentPageTitle,
      aiGeneratedHtml: ieStore.aiGeneratedHtml,
      aiGeneratedMarkdown: ieHtmlMarkdown,
    },
    video: {
      currentVideo: currentVideo
        ? {
            id: currentVideo.id,
            url: currentVideo.url,
            title: currentVideo.title,
            artist: currentVideo.artist,
          }
        : null,
      isPlaying: videoStore.isPlaying,
      loopAll: videoStore.loopAll,
      loopCurrent: videoStore.loopCurrent,
      isShuffled: videoStore.isShuffled,
    },
    ipod: {
      currentTrack: currentTrack
        ? {
            id: currentTrack.id,
            url: currentTrack.url,
            title: currentTrack.title,
            artist: currentTrack.artist,
          }
        : null,
      isPlaying: ipodStore.isPlaying,
      loopAll: ipodStore.loopAll,
      loopCurrent: ipodStore.loopCurrent,
      isShuffled: ipodStore.isShuffled,
      currentLyrics: ipodStore.currentLyrics,
      library: ipodStore.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
      })),
    },
    textEdit: {
      instances: textEditInstancesData,
    },
  };
};

// Helper function to check if a message is urgent (starts with "!!!!")
const isUrgentMessage = (content: string): boolean =>
  content.startsWith("!!!!");

// Function to clean urgent message prefix
const cleanUrgentPrefix = (content: string): string => {
  return isUrgentMessage(content) ? content.slice(4).trimStart() : content;
};

// Component to render HTML previews
interface HtmlPreviewProps {
  htmlContent: string;
  onInteractionChange: (isInteracting: boolean) => void;
  isStreaming?: boolean;
}

function TerminalHtmlPreview({
  htmlContent,
  onInteractionChange,
  isStreaming = false,
  playElevatorMusic,
  stopElevatorMusic,
  playDingSound,
}: HtmlPreviewProps & {
  playElevatorMusic: () => void;
  stopElevatorMusic: () => void;
  playDingSound: () => void;
}) {
  // Get UI sound hooks
  const maximizeSound = useSound(Sounds.WINDOW_EXPAND);
  const minimizeSound = useSound(Sounds.WINDOW_COLLAPSE);

  return (
    <HtmlPreview
      htmlContent={htmlContent}
      onInteractionChange={onInteractionChange}
      isStreaming={isStreaming}
      playElevatorMusic={playElevatorMusic}
      stopElevatorMusic={stopElevatorMusic}
      playDingSound={playDingSound}
      maximizeSound={maximizeSound}
      minimizeSound={minimizeSound}
      className="select-text"
    />
  );
}

// parseSimpleMarkdown is imported from TypewriterText exports

// TypewriterText component has been extracted to separate file

// AnimatedEllipsis component has been extracted to separate file

// Helper function to convert Blob content to string
// Unused function - removing to fix TS6133 error
// const blobToString = async (content: string | Blob): Promise<string> => {
//   if (content instanceof Blob) {
//     return await content.text();
//   }
//   return content;
// };

export function TerminalAppComponent({
  onClose,
  isWindowOpen,
  isForeground = true,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const translatedHelpItems = useTranslatedHelpItems("terminal", helpItems || []);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [currentCommand, setCurrentCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyCommands, setHistoryCommands] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(12); // Default font size in pixels
  // Get state from terminal store
  const {
    isInAiMode,
    setIsInAiMode,
    initialAiPrompt,
    setInitialAiPrompt,
    isInVimMode,
    setIsInVimMode,
    vimFile,
    setVimFile,
    vimPosition,
    setVimPosition,
    vimCursorLine,
    setVimCursorLine,
    vimCursorColumn,
    setVimCursorColumn,
    vimMode,
    setVimMode,
    vimClipboard,
    setVimClipboard,
  } = useTerminalStore();
  const [spinnerIndex, setSpinnerIndex] = useState(0);
  const [isInteractingWithPreview, setIsInteractingWithPreview] =
    useState(false);
  const [inputFocused, setInputFocused] = useState(false); // Add state for input focus
  const spinnerChars = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

  // Track if auto-scrolling is enabled
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Reference to track if user is at the bottom
  const isAtBottomRef = useRef(true);
  const hasScrolledRef = useRef(false);
  const previousCommandHistoryLength = useRef(0);
  const lastGPressTimeRef = useRef<number>(0); // Add ref for tracking 'g' key presses
  const lastKeyPressRef = useRef<{ key: string; time: number }>({
    key: "",
    time: 0,
  }); // Track last key for double-key commands

  // Keep track of the last processed message ID to avoid duplicates
  const lastProcessedMessageIdRef = useRef<string | null>(null);
  // Keep track of apps already launched in the current session
  const launchedAppsRef = useRef<Set<string>>(new Set());
  // Shared AI chat hook
  const {
    messages: aiMessages,
    append: appendAiMessage,
    isLoading: isAiLoading,
    stop: stopAiResponse,
  } = useAiChat();

  const setAiChatMessages = useChatsStore((state) => state.setAiMessages);

  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Get file operations from the hook
  // Get terminal state from the store
  const { currentPath: storedPath } = useTerminalStore();

  const { currentPath, files, navigateToPath, saveFile, moveToTrash } =
    useFileSystem(storedPath);

  const launchApp = useLaunchApp();
  const bringToForeground = useAppStore((state) => state.bringToForeground);

  const {
    playCommandSound,
    playErrorSound,
    playAiResponseSound,
    toggleMute,
    isMuted,
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
    playMooSound,
  } = useTerminalSounds();

  const { username } = useChatsStore();

  // Load command history from store
  useEffect(() => {
    const { commandHistory } = useTerminalStore.getState();
    setHistoryCommands(commandHistory.map((cmd) => cmd.command));
  }, []);

  // Initialize with welcome message
  useEffect(() => {
    const currentTime = new Date().toLocaleTimeString();
    const asciiArt = `     __  __ 
 _  /  \\(_  
| \\/\\__/__) 
  /         `;

    setCommandHistory([
      {
        command: "",
        output: `${asciiArt}\n${i18n.t("apps.terminal.output.lastLogin", { time: currentTime })}\n${i18n.t("apps.terminal.output.typeHelpForCommands")}\n\n`,
        path: "welcome-message",
      },
    ]);
  }, []);

  // Handle scroll events to enable/disable auto-scroll
  const handleScroll = () => {
    if (terminalRef.current) {
      hasScrolledRef.current = true;
      const { scrollTop, scrollHeight, clientHeight } = terminalRef.current;
      // Check if user is at the bottom (allowing for a small buffer of 10px)
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;

      // If we were at bottom and scrolled up, disable auto-scroll
      if (isAtBottomRef.current && !isAtBottom) {
        setAutoScrollEnabled(false);
      }
      // If we're at bottom, enable auto-scroll
      if (isAtBottom) {
        setAutoScrollEnabled(true);
        isAtBottomRef.current = true;
      }
    }
  };

  // Improved scroll to bottom function
  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, []);

  // Auto-scroll to bottom when command history changes
  useEffect(() => {
    if (!terminalRef.current) return;

    // Always scroll to bottom on initial load
    if (!hasScrolledRef.current) {
      scrollToBottom();
      return;
    }

    // For subsequent updates, only scroll if auto-scroll is enabled
    if (autoScrollEnabled) {
      scrollToBottom();
    }

    previousCommandHistoryLength.current = commandHistory.length;
  }, [commandHistory, autoScrollEnabled, scrollToBottom]);

  // Modify the focus effect to respect preview interaction
  useEffect(() => {
    if (inputRef.current && isForeground && !isInteractingWithPreview) {
      inputRef.current.focus();
    }
  }, [isForeground, commandHistory, isInteractingWithPreview]);

  // Save current path to store when it changes
  useEffect(() => {
    useTerminalStore.getState().setCurrentPath(currentPath);
  }, [currentPath]);

  // Spinner animation effect
  useEffect(() => {
    if (isAiLoading) {
      const interval = setInterval(() => {
        setSpinnerIndex((prevIndex) => (prevIndex + 1) % spinnerChars.length);
      }, 100);

      return () => clearInterval(interval);
    }
  }, [isAiLoading, spinnerChars.length]);

  const [isClearingTerminal, setIsClearingTerminal] = useState(false);

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentCommand.trim()) return;

    if (isInVimMode) {
      handleVimInput(currentCommand);
      return;
    }

    if (isInAiMode) {
      // Handle AI mode commands
      handleAiCommand(currentCommand);
      return;
    }

    // Add command to history commands array
    const newHistoryCommands = [...historyCommands, currentCommand];
    setHistoryCommands(newHistoryCommands);
    setHistoryIndex(-1);

    // Store command in history via Zustand store
    useTerminalStore.getState().addCommand(currentCommand);

    // Process the command asynchronously
    processCommand(currentCommand).then((result) => {
      // Play appropriate sound based on command result
      if (result.isError) {
        playErrorSound();
      } else {
        playCommandSound();
      }

      // Reset animated lines to ensure only new content gets animated
      setAnimatedLines(new Set());

      // Add to command history
      setCommandHistory([
        ...commandHistory,
        {
          command: currentCommand,
          output: result.output,
          path: currentPath,
          // Style system messages in gray (errors, or explicitly marked system messages)
          isSystemMessage: result.isSystemMessage ?? result.isError,
        },
      ]);
    });

    // Clear current command
    setCurrentCommand("");
  };

  // parseCommand is now imported from utils/commandParser

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isInVimMode) {
      // Insert mode handling
      if (vimMode === "insert") {
        if (e.key === "Escape") {
          // Exit insert mode
          e.preventDefault();
          setVimMode("normal");
          return;
        }

        // Handle backspace in insert mode
        if (e.key === "Backspace") {
          e.preventDefault();

          if (!vimFile) return;

          const lines = vimFile.content.split("\n");

          // Check if we are at the beginning of a line and not on the first line
          if (vimCursorColumn === 0 && vimCursorLine > 0) {
            // We need to merge with the previous line
            const previousLine = lines[vimCursorLine - 1];
            const currentLine = lines[vimCursorLine];
            const previousLineLength = previousLine.length;

            // Merge the lines
            lines[vimCursorLine - 1] = previousLine + currentLine;

            // Remove the current line
            lines.splice(vimCursorLine, 1);

            // Update file content
            setVimFile({
              ...vimFile,
              content: lines.join("\n"),
            });

            // Move cursor to the end of the previous line
            setVimCursorLine((prev) => prev - 1);
            setVimCursorColumn(previousLineLength);

            // Auto-scroll if needed
            const maxVisibleLines = 20;
            const lowerThreshold = Math.floor(maxVisibleLines * 0.4);

            if (
              vimCursorLine - 1 - vimPosition < lowerThreshold &&
              vimPosition > 0
            ) {
              setVimPosition((prev) => Math.max(prev - 1, 0));
            }

            return;
          }

          // Regular backspace in the middle of a line
          if (vimCursorColumn > 0) {
            const currentLine = lines[vimCursorLine] || "";

            // Remove character before cursor
            const newLine =
              currentLine.substring(0, vimCursorColumn - 1) +
              currentLine.substring(vimCursorColumn);
            lines[vimCursorLine] = newLine;

            // Update file content
            setVimFile({
              ...vimFile,
              content: lines.join("\n"),
            });

            // Move cursor backward
            setVimCursorColumn((prev) => Math.max(0, prev - 1));
          }

          return;
        }

        // Handle Enter key in insert mode to create a new line
        if (e.key === "Enter") {
          e.preventDefault();

          if (!vimFile) return;

          const lines = vimFile.content.split("\n");
          const currentLine = lines[vimCursorLine] || "";

          // Split the line at cursor position
          const beforeCursor = currentLine.substring(0, vimCursorColumn);
          const afterCursor = currentLine.substring(vimCursorColumn);

          // Update the current line and add a new line
          lines[vimCursorLine] = beforeCursor;
          lines.splice(vimCursorLine + 1, 0, afterCursor);

          // Update file content
          setVimFile({
            ...vimFile,
            content: lines.join("\n"),
          });

          // Move cursor to the beginning of the new line
          setVimCursorLine((prev) => prev + 1);
          setVimCursorColumn(0);

          // Auto-scroll if the cursor moves out of view
          const maxVisibleLines = 20;
          const upperThreshold = Math.floor(maxVisibleLines * 0.6);
          const maxPosition = Math.max(0, lines.length - maxVisibleLines);

          if (
            vimCursorLine + 1 - vimPosition > upperThreshold &&
            vimPosition < maxPosition
          ) {
            setVimPosition((prev) => Math.min(prev + 1, maxPosition));
          }

          return;
        }

        // Handle Tab key in insert mode
        if (e.key === "Tab") {
          e.preventDefault();

          if (!vimFile) return;

          const lines = vimFile.content.split("\n");
          const currentLine = lines[vimCursorLine] || "";

          // Insert 2 spaces (standard tab size)
          const newLine =
            currentLine.substring(0, vimCursorColumn) +
            "  " +
            currentLine.substring(vimCursorColumn);
          lines[vimCursorLine] = newLine;

          // Update file content
          setVimFile({
            ...vimFile,
            content: lines.join("\n"),
          });

          // Move cursor after the tab
          setVimCursorColumn((prev) => prev + 2);

          return;
        }

        // Handle Delete key in insert mode
        if (e.key === "Delete") {
          e.preventDefault();

          if (!vimFile) return;

          const lines = vimFile.content.split("\n");
          const currentLine = lines[vimCursorLine] || "";

          // Check if we are at the end of a line and not on the last line
          if (
            vimCursorColumn === currentLine.length &&
            vimCursorLine < lines.length - 1
          ) {
            // We need to merge with the next line
            const nextLine = lines[vimCursorLine + 1];

            // Merge the lines
            lines[vimCursorLine] = currentLine + nextLine;

            // Remove the next line
            lines.splice(vimCursorLine + 1, 1);

            // Update file content
            setVimFile({
              ...vimFile,
              content: lines.join("\n"),
            });

            return;
          }

          // Regular delete in the middle of a line
          if (vimCursorColumn < currentLine.length) {
            // Remove character after cursor
            const newLine =
              currentLine.substring(0, vimCursorColumn) +
              currentLine.substring(vimCursorColumn + 1);
            lines[vimCursorLine] = newLine;

            // Update file content
            setVimFile({
              ...vimFile,
              content: lines.join("\n"),
            });
          }

          return;
        }

        // Handle Home/End keys in insert mode
        if (e.key === "Home") {
          e.preventDefault();
          setVimCursorColumn(0);
          return;
        }

        if (e.key === "End") {
          e.preventDefault();
          if (!vimFile) return;

          const lines = vimFile.content.split("\n");
          const currentLine = lines[vimCursorLine] || "";
          setVimCursorColumn(currentLine.length);
          return;
        }

        // Let most keys pass through to be handled by onChange in insert mode
        // Only handle special navigation cases here
        if (
          e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight"
        ) {
          e.preventDefault();

          if (!vimFile) return;
          const lines = vimFile.content.split("\n");

          // Handle arrow navigation in insert mode
          if (e.key === "ArrowDown" && vimCursorLine < lines.length - 1) {
            // Move cursor down
            const newCursorLine = vimCursorLine + 1;
            setVimCursorLine(newCursorLine);

            // Adjust column position if needed
            const newLineLength = lines[newCursorLine].length;
            if (newLineLength < vimCursorColumn) {
              setVimCursorColumn(Math.max(0, newLineLength));
            }

            // Auto-scroll if needed
            const maxVisibleLines = 20;
            const upperThreshold = Math.floor(maxVisibleLines * 0.6);
            const maxPosition = Math.max(0, lines.length - maxVisibleLines);

            if (
              newCursorLine - vimPosition > upperThreshold &&
              vimPosition < maxPosition
            ) {
              setVimPosition((prev) => Math.min(prev + 1, maxPosition));
            }
          } else if (e.key === "ArrowUp" && vimCursorLine > 0) {
            // Move cursor up
            const newCursorLine = vimCursorLine - 1;
            setVimCursorLine(newCursorLine);

            // Adjust column position if needed
            const newLineLength = lines[newCursorLine].length;
            if (newLineLength < vimCursorColumn) {
              setVimCursorColumn(Math.max(0, newLineLength));
            }

            // Auto-scroll if needed
            const maxVisibleLines = 20;
            const lowerThreshold = Math.floor(maxVisibleLines * 0.4);

            if (
              newCursorLine - vimPosition < lowerThreshold &&
              vimPosition > 0
            ) {
              setVimPosition((prev) => Math.max(prev - 1, 0));
            }
          } else if (e.key === "ArrowLeft" && vimCursorColumn > 0) {
            // Move cursor left
            setVimCursorColumn((prev) => prev - 1);
          } else if (e.key === "ArrowRight") {
            // Move cursor right, but don't go beyond the end of the line
            const currentLineLength = lines[vimCursorLine]?.length || 0;
            if (vimCursorColumn < currentLineLength) {
              setVimCursorColumn((prev) => prev + 1);
            }
          }

          return;
        }

        return;
      }

      // Normal mode handling
      if (
        e.key === "j" ||
        e.key === "k" ||
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "ArrowLeft" ||
        e.key === "ArrowRight" ||
        e.key === "h" ||
        e.key === "l" ||
        e.key === "0" ||
        e.key === "$" ||
        e.key === "w" ||
        e.key === "b" ||
        e.key === "g" ||
        e.key === "G" ||
        e.key === "a" ||
        e.key === "o" ||
        e.key === "O" ||
        e.key === "d" ||
        e.key === "y" ||
        e.key === "p" ||
        (e.key === "d" && e.ctrlKey) ||
        (e.key === "u" && e.ctrlKey)
      ) {
        e.preventDefault();

        // Directly handle navigation keys
        if (!vimFile) return;

        const lines = vimFile.content.split("\n");
        const maxVisibleLines = 20;
        const maxPosition = Math.max(0, lines.length - maxVisibleLines);

        // Calculate scroll threshold for comfortable viewing
        const lowerThreshold = Math.floor(maxVisibleLines * 0.4); // 40% from top
        const upperThreshold = Math.floor(maxVisibleLines * 0.6); // 60% from top

        // Handle vertical movement (up/down)
        if (
          (e.key === "j" || e.key === "ArrowDown") &&
          vimCursorLine < lines.length - 1
        ) {
          // Move cursor down
          const newCursorLine = vimCursorLine + 1;
          setVimCursorLine(newCursorLine);

          // Adjust column position if the new line is shorter than current column
          const newLineLength = lines[newCursorLine].length;
          if (newLineLength < vimCursorColumn) {
            setVimCursorColumn(Math.max(0, newLineLength));
          }

          // Auto-scroll if cursor is below the upper threshold
          if (
            newCursorLine - vimPosition > upperThreshold &&
            vimPosition < maxPosition
          ) {
            setVimPosition((prev) => Math.min(prev + 1, maxPosition));
          }
        } else if (
          (e.key === "k" || e.key === "ArrowUp") &&
          vimCursorLine > 0
        ) {
          // Move cursor up
          const newCursorLine = vimCursorLine - 1;
          setVimCursorLine(newCursorLine);

          // Adjust column position if the new line is shorter than current column
          const newLineLength = lines[newCursorLine].length;
          if (newLineLength < vimCursorColumn) {
            setVimCursorColumn(Math.max(0, newLineLength));
          }

          // Auto-scroll if cursor is above the lower threshold
          if (newCursorLine - vimPosition < lowerThreshold && vimPosition > 0) {
            setVimPosition((prev) => Math.max(prev - 1, 0));
          }
        }
        // Handle horizontal movement (left/right)
        else if (
          (e.key === "ArrowLeft" || e.key === "h") &&
          vimCursorColumn > 0
        ) {
          // Move cursor left
          setVimCursorColumn((prev) => prev - 1);
        } else if (e.key === "ArrowRight" || e.key === "l") {
          // Move cursor right, but don't go beyond the end of the line
          const currentLineLength = lines[vimCursorLine]?.length || 0;
          if (vimCursorColumn < currentLineLength) {
            setVimCursorColumn((prev) => prev + 1);
          }
        }
        // Go to start of line (0)
        else if (e.key === "0") {
          setVimCursorColumn(0);
        }
        // Go to end of line ($)
        else if (e.key === "$") {
          const currentLineLength = lines[vimCursorLine]?.length || 0;
          setVimCursorColumn(Math.max(0, currentLineLength));
        }
        // Move to next word (w)
        else if (e.key === "w") {
          const currentLine = lines[vimCursorLine] || "";
          // Find next word boundary
          const wordRegex = /\b\w/g;
          wordRegex.lastIndex = vimCursorColumn + 1; // Start from next character

          const match = wordRegex.exec(currentLine);
          if (match) {
            // Found a word boundary in current line
            setVimCursorColumn(match.index);
          } else if (vimCursorLine < lines.length - 1) {
            // Move to beginning of next line
            setVimCursorLine((prev) => prev + 1);
            setVimCursorColumn(0);

            // Auto-scroll if needed
            if (
              vimCursorLine + 1 - vimPosition > upperThreshold &&
              vimPosition < maxPosition
            ) {
              setVimPosition((prev) => Math.min(prev + 1, maxPosition));
            }
          }
        }
        // Move to previous word (b)
        else if (e.key === "b") {
          const currentLine = lines[vimCursorLine] || "";

          // If at start of line and not first line, go to end of previous line
          if (vimCursorColumn === 0 && vimCursorLine > 0) {
            setVimCursorLine((prev) => prev - 1);
            const prevLineLength = lines[vimCursorLine - 1]?.length || 0;
            setVimCursorColumn(prevLineLength);

            // Auto-scroll if needed
            if (
              vimCursorLine - 1 - vimPosition < lowerThreshold &&
              vimPosition > 0
            ) {
              setVimPosition((prev) => Math.max(prev - 1, 0));
            }
            return;
          }

          // Find previous word boundary
          let position = vimCursorColumn - 1;
          while (position > 0) {
            // Check if this position is at a word boundary
            const isWordBoundary =
              /\w/.test(currentLine[position]) &&
              (position === 0 || /\W/.test(currentLine[position - 1]));

            if (isWordBoundary) {
              setVimCursorColumn(position);
              return;
            }
            position--;
          }

          // If no word boundary found, go to start of line
          setVimCursorColumn(0);
        }
        // Go to top of file (gg)
        else if (e.key === "g") {
          // Track 'g' press for double-g (gg) command
          const now = Date.now();
          const lastGPress = lastGPressTimeRef.current;
          lastGPressTimeRef.current = now;

          // If pressed 'g' twice quickly
          if (now - lastGPress < 500) {
            setVimCursorLine(0);
            setVimCursorColumn(0);
            setVimPosition(0);
            lastGPressTimeRef.current = 0; // Reset timer
          }
        }
        // Go to bottom of file (G)
        else if (e.key === "G") {
          const lastLineIndex = Math.max(0, lines.length - 1);
          setVimCursorLine(lastLineIndex);
          setVimCursorColumn(0);

          // Update scroll position to show the last lines
          setVimPosition(Math.max(0, lines.length - maxVisibleLines));
        }
        // Page down (Ctrl+d) - move half screen down
        else if (e.key === "d" && e.ctrlKey) {
          const halfScreen = Math.floor(maxVisibleLines / 2);
          const newPosition = Math.min(vimPosition + halfScreen, maxPosition);
          setVimPosition(newPosition);

          // Move cursor down too if possible
          const newCursorLine = Math.min(
            vimCursorLine + halfScreen,
            lines.length - 1
          );
          setVimCursorLine(newCursorLine);

          // Adjust column if needed
          const newLineLength = lines[newCursorLine]?.length || 0;
          if (vimCursorColumn > newLineLength) {
            setVimCursorColumn(Math.max(0, newLineLength));
          }
        }
        // Page up (Ctrl+u) - move half screen up
        else if (e.key === "u" && e.ctrlKey) {
          const halfScreen = Math.floor(maxVisibleLines / 2);
          const newPosition = Math.max(vimPosition - halfScreen, 0);
          setVimPosition(newPosition);

          // Move cursor up too if possible
          const newCursorLine = Math.max(vimCursorLine - halfScreen, 0);
          setVimCursorLine(newCursorLine);

          // Adjust column if needed
          const newLineLength = lines[newCursorLine]?.length || 0;
          if (vimCursorColumn > newLineLength) {
            setVimCursorColumn(Math.max(0, newLineLength));
          }
        }
        // Insert after cursor (a)
        else if (e.key === "a") {
          setVimMode("insert");
          // Move cursor one position right if not at end of line
          const currentLineLength = lines[vimCursorLine]?.length || 0;
          if (vimCursorColumn < currentLineLength) {
            setVimCursorColumn((prev) => prev + 1);
          }
        }
        // Open new line below cursor (o)
        else if (e.key === "o") {
          // Insert a new line below current line
          const newLines = [...lines];
          newLines.splice(vimCursorLine + 1, 0, "");

          // Update file content
          setVimFile({
            ...vimFile,
            content: newLines.join("\n"),
          });

          // Move cursor to the beginning of the new line
          setVimCursorLine((prev) => prev + 1);
          setVimCursorColumn(0);

          // Enter insert mode
          setVimMode("insert");

          // Auto-scroll if needed
          if (
            vimCursorLine + 1 - vimPosition > upperThreshold &&
            vimPosition < maxPosition
          ) {
            setVimPosition((prev) => Math.min(prev + 1, maxPosition));
          }
        }
        // Open new line above cursor (O)
        else if (e.key === "O") {
          // Insert a new line above current line
          const newLines = [...lines];
          newLines.splice(vimCursorLine, 0, "");

          // Update file content
          setVimFile({
            ...vimFile,
            content: newLines.join("\n"),
          });

          // Keep cursor at the same line (which is now the new empty line)
          setVimCursorColumn(0);

          // Enter insert mode
          setVimMode("insert");
        }

        // Delete line (dd)
        else if (e.key === "d") {
          // Track for double-d (dd) command
          const now = Date.now();
          const lastKey = lastKeyPressRef.current;

          // Update last key press
          lastKeyPressRef.current = { key: "d", time: now };

          // If pressed 'd' twice quickly
          if (lastKey.key === "d" && now - lastKey.time < 500) {
            // Can't delete the last line - vim always keeps at least one line
            if (lines.length > 1) {
              // Copy the line to clipboard before deleting
              setVimClipboard(lines[vimCursorLine]);

              // Remove the current line
              const newLines = [...lines];
              newLines.splice(vimCursorLine, 1);

              // Update file content
              setVimFile({
                ...vimFile,
                content: newLines.join("\n"),
              });

              // Adjust cursor position if we deleted the last line
              if (vimCursorLine >= newLines.length) {
                setVimCursorLine(Math.max(0, newLines.length - 1));
              }

              // Reset column position to the start of the line
              setVimCursorColumn(0);
            } else {
              // If it's the last line, just clear it and copy its content
              setVimClipboard(lines[0]);

              // Clear the line content but keep the line
              const newLines = [""];
              setVimFile({
                ...vimFile,
                content: newLines.join("\n"),
              });

              setVimCursorColumn(0);
            }

            // Reset the last key press
            lastKeyPressRef.current = { key: "", time: 0 };
          }
        }

        // Yank (copy) line (yy)
        else if (e.key === "y") {
          // Track for double-y (yy) command
          const now = Date.now();
          const lastKey = lastKeyPressRef.current;

          // Update last key press
          lastKeyPressRef.current = { key: "y", time: now };

          // If pressed 'y' twice quickly
          if (lastKey.key === "y" && now - lastKey.time < 500) {
            // Copy the current line to clipboard
            setVimClipboard(lines[vimCursorLine]);

            // Reset the last key press
            lastKeyPressRef.current = { key: "", time: 0 };
          }
        }

        // Paste (p)
        else if (e.key === "p") {
          // Only paste if there's content in the clipboard
          if (vimClipboard) {
            const newLines = [...lines];

            // Paste after current line
            newLines.splice(vimCursorLine + 1, 0, vimClipboard);

            // Update file content
            setVimFile({
              ...vimFile,
              content: newLines.join("\n"),
            });

            // Move cursor to the next line (the pasted line)
            setVimCursorLine((prev) => prev + 1);
            setVimCursorColumn(0);

            // Auto-scroll if needed
            if (
              vimCursorLine + 1 - vimPosition > upperThreshold &&
              vimPosition < maxPosition
            ) {
              setVimPosition((prev) => Math.min(prev + 1, maxPosition));
            }
          }
        }

        return;
      } else if (e.key === "i") {
        // Enter insert mode
        e.preventDefault();
        setVimMode("insert");
        return;
      } else if (e.key === ":") {
        // Switch to command mode without adding colon to the input
        e.preventDefault();
        setVimMode("command");
        setCurrentCommand("");
        return;
      } else if (e.key === "Escape" && vimMode === "command") {
        // Return to normal mode
        setVimMode("normal");
        setCurrentCommand("");
        return;
      } else if (e.key === "Enter" && vimMode === "command") {
        // Execute command on Enter
        e.preventDefault();

        // Add colon prefix to command if needed
        const command = ":" + currentCommand;
        handleVimInput(command);
        return;
      }
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      // Navigate up through command history
      if (historyCommands.length > 0) {
        const newIndex =
          historyIndex < historyCommands.length - 1
            ? historyIndex + 1
            : historyIndex;
        setHistoryIndex(newIndex);
        const historicCommand =
          historyCommands[historyCommands.length - 1 - newIndex] || "";

        // If we're not in AI mode and the historic command was from AI mode
        // (doesn't start with 'ryo' and was saved with 'ryo' prefix)
        const savedCommands = useTerminalStore.getState().commandHistory;
        const commandEntry = savedCommands[savedCommands.length - 1 - newIndex];
        if (
          !isInAiMode &&
          commandEntry &&
          commandEntry.command.startsWith("ryo ") &&
          !historicCommand.startsWith("ryo ")
        ) {
          setCurrentCommand("ryo " + historicCommand);
        } else {
          setCurrentCommand(historicCommand);
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      // Navigate down through command history
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const historicCommand =
          historyCommands[historyCommands.length - 1 - newIndex] || "";

        // Same logic for down arrow
        const savedCommands = useTerminalStore.getState().commandHistory;
        const commandEntry = savedCommands[savedCommands.length - 1 - newIndex];
        if (
          !isInAiMode &&
          commandEntry &&
          commandEntry.command.startsWith("ryo ") &&
          !historicCommand.startsWith("ryo ")
        ) {
          setCurrentCommand("ryo " + historicCommand);
        } else {
          setCurrentCommand(historicCommand);
        }
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCurrentCommand("");
      }
    } else if (e.key === "Tab") {
      e.preventDefault();
      const completedCommand = autoComplete(currentCommand);
      setCurrentCommand(completedCommand);
    }
  };

  // Update autoComplete to handle quotes
  const autoComplete = (input: string): string => {
    // If the input ends with a space, don't try to autocomplete
    if (input.endsWith(" ")) return input;

    const { cmd, args } = parseCommand(input);

    // If this is the first word (command autocomplete)
    if (!input.includes(" ")) {
      const matches = AVAILABLE_COMMANDS.filter((availableCmd) =>
        availableCmd.startsWith(cmd)
      );

      if (matches.length === 1) {
        // Exact match, replace the command
        return matches[0];
      } else if (matches.length > 1) {
        // Show matching commands
        setCommandHistory([
          ...commandHistory,
          {
            command: input,
            output: matches.join("  "),
            path: currentPath,
          },
        ]);
        return input;
      }
    }
    // File/directory autocompletion (for commands that take file arguments)
    else if (["cd", "cat", "rm", "edit", "vim"].includes(cmd)) {
      const lastArg = args.length > 0 ? args[args.length - 1] : "";

      const matches = files
        .filter((file) =>
          file.name.toLowerCase().startsWith(lastArg.toLowerCase())
        )
        .map((file) => file.name);

      if (matches.length === 1) {
        // Exact match, replace the last part
        // Handle filenames with spaces by adding quotes if needed
        const matchedName = matches[0];
        const needsQuotes = matchedName.includes(" ");

        // Rebuild the command with the matched filename
        const commandParts = input.split(" ");

        // Remove the last part (partial filename)
        commandParts.pop();

        // Add the completed filename (with quotes if needed)
        if (
          needsQuotes &&
          !lastArg.startsWith('"') &&
          !lastArg.startsWith("'")
        ) {
          commandParts.push(`"${matchedName}"`);
        } else {
          commandParts.push(matchedName);
        }

        return commandParts.join(" ");
      } else if (matches.length > 1) {
        // Show matching files/directories
        setCommandHistory([
          ...commandHistory,
          {
            command: input,
            output: matches.join("  "),
            path: currentPath,
          },
        ]);
        return input;
      }
    }

    return input; // Return original if no completions
  };

  const processCommand = async (
    command: string
  ): Promise<{ output: string; isError: boolean; isSystemMessage?: boolean }> => {
    const { cmd, args } = parseCommand(command);

    // Create command context
    const context: CommandContext = {
      currentPath,
      files,
      navigateToPath,
      saveFile,
      moveToTrash,
      playCommandSound,
      playErrorSound,
      playMooSound,
      launchApp,
      setIsAboutDialogOpen,
      username,
    };

    // Check if command exists in registry
    if (commands[cmd]) {
      const result = await commands[cmd].handler(args, context);

      // Special handling for clear command
      if (cmd === "clear") {
        // Trigger clearing animation
        setIsClearingTerminal(true);
        // Stop any ongoing AI responses
        if (isInAiMode) {
          stopAiResponse();
        }
        setTimeout(() => {
          setIsClearingTerminal(false);
          setCommandHistory([]);
          // Reset tracking refs for AI responses
          lastProcessedMessageIdRef.current = null;
        }, 500); // Animation duration
      }

      return result;
    }

    // Handle commands that are not yet in the registry
    switch (cmd) {
      case "cat": {
        if (args.length === 0) {
          return {
            output: "usage: cat <filename>",
            isError: true,
          };
        }

        const fileName = args[0];
        const file = files.find((f) => f.name === fileName);

        if (!file) {
          return {
            output: `file not found: ${fileName}`,
            isError: true,
          };
        }

        if (file.isDirectory) {
          return {
            output: `${fileName} is a directory, not a file`,
            isError: true,
          };
        }

        // Use a loading message while we fetch content
        const tempOutput = `Loading ${fileName}...`;

        // Create a class to handle file content reading - using same pattern as vim
        class FileReader {
          async readContent() {
            try {
              if (this.isRealFile()) {
                await this.loadRealFileContent();
              } else {
                this.handleVirtualFile();
              }
            } catch (error) {
              this.handleError(error);
            }
          }

          isRealFile() {
            // Ensure file exists and check path properties
            return (
              file &&
              (file.path.startsWith("/Documents/") ||
                file.path.startsWith("/Images/"))
            );
          }

          async loadRealFileContent() {
            // Ensure file exists first
            if (!file) return;

            // Get file metadata from the store to find UUID
            const fileStore = useFilesStore.getState();
            const fileMetadata = fileStore.getItem(file.path);

            if (!fileMetadata || !fileMetadata.uuid) {
              this.updateOutput(`${fileName}: file metadata not found`);
              return;
            }

            // Determine store based on file path
            const storeName = file.path.startsWith("/Documents/")
              ? STORES.DOCUMENTS
              : STORES.IMAGES;

            const contentData = await dbOperations.get<DocumentContent>(
              storeName,
              fileMetadata.uuid
            );

            if (contentData && contentData.content) {
              // Convert content to text based on type
              let fileContent = "";
              if (contentData.content instanceof Blob) {
                fileContent = await contentData.content.text();
              } else if (typeof contentData.content === "string") {
                fileContent = contentData.content;
              }

              // Update terminal with content
              this.updateOutput(fileContent || `${fileName} is empty`);
            } else {
              // Handle missing content
              this.updateOutput(`${fileName} is empty or could not be read`);
            }
          }

          handleVirtualFile() {
            this.updateOutput(
              `${fileName} content not available (virtual file)`
            );
          }

          updateOutput(content: string) {
            // Update the terminal history with the content
            setCommandHistory((prev) => {
              const lastCommand = prev[prev.length - 1];
              if (lastCommand.output === tempOutput) {
                return [
                  ...prev.slice(0, -1),
                  {
                    ...lastCommand,
                    output: content,
                  },
                ];
              }
              return prev;
            });
          }

          handleError(error: unknown) {
            const err = error as Error;
            console.error("Error reading file content:", err);
            this.updateOutput(
              `Error reading file: ${err.message || "Unknown error"}`
            );
          }
        }

        // Start the reading process asynchronously
        setTimeout(() => {
          const reader = new FileReader();
          reader.readContent();
        }, 100);

        return {
          output: tempOutput,
          isError: false,
        };
      }

      case "edit": {
        if (args.length === 0) {
          return {
            output: "usage: edit <filename>",
            isError: true,
          };
        }

        const fileToEdit = args[0];
        const fileToEditObj = files.find((f) => f.name === fileToEdit);

        if (!fileToEditObj) {
          return {
            output: `file not found: ${fileToEdit}`,
            isError: true,
          };
        }

        if (fileToEditObj.isDirectory) {
          return {
            output: `${fileToEdit} is a directory, not a file`,
            isError: true,
          };
        }

        // Check if the file is already in Documents folder or needs copying
        if (!fileToEditObj.path.startsWith("/Documents/")) {
          // Create a copy in the Documents folder
          const fileName = fileToEditObj.name;
          const documentsPath = `/Documents/${fileName}`;

          // Helper function to handle document copying asynchronously
          setTimeout(async () => {
            try {
              // Get the content if it's a real file
              if (fileToEditObj && fileToEditObj.path.startsWith("/Images/")) {
                // For image files, we need to get the content from IndexedDB
                // Get file metadata from the store to find UUID
                const fileStore = useFilesStore.getState();
                const fileMetadata = fileStore.getItem(fileToEditObj.path);

                if (fileMetadata && fileMetadata.uuid) {
                  const contentData = await dbOperations.get<DocumentContent>(
                    STORES.IMAGES,
                    fileMetadata.uuid
                  );
                  let fileContent = "";

                  if (contentData && contentData.content) {
                    if (contentData.content instanceof Blob) {
                      fileContent = await contentData.content.text();
                    } else if (typeof contentData.content === "string") {
                      fileContent = contentData.content;
                    }
                  }

                  // Save to Documents
                  await saveFile({
                    name: fileName,
                    path: documentsPath,
                    content: fileContent || "",
                    type: "text",
                    icon: "/icons/file-text.png",
                  });
                } else {
                  // No UUID found, create empty document
                  await saveFile({
                    name: fileName,
                    path: documentsPath,
                    content: "",
                    type: "text",
                    icon: "/icons/file-text.png",
                  });
                }
              } else {
                // For virtual files, create an empty document
                await saveFile({
                  name: fileName,
                  path: documentsPath,
                  content: "",
                  type: "text",
                  icon: "/icons/file-text.png",
                });
              }

              // Launch TextEdit with the copied file
              launchApp("textedit", {
                initialData: { path: documentsPath, content: "" },
              });
            } catch (error) {
              console.error("Error preparing file for editing:", error);
            }
          }, 100);
        } else {
          // If already in Documents, just launch TextEdit directly with the file path
          // Let TextEdit use its own content loading mechanism
          launchApp("textedit", {
            initialData: { path: fileToEditObj.path, content: "" },
          });
        }

        return {
          output: `opening ${fileToEdit} in textedit...`,
          isError: false,
        };
      }

      case "history": {
        const cmdHistory = useTerminalStore.getState().commandHistory;
        if (cmdHistory.length === 0) {
          return {
            output: "no command history",
            isError: false,
          };
        }

        // Calculate padding for index column based on number of commands
        const indexPadding = cmdHistory.length.toString().length;

        // Find the longest command to determine command column width
        const longestCmd = Math.min(
          25, // Maximum width to prevent extremely long commands from using too much space
          Math.max(...cmdHistory.map((cmd) => cmd.command.length))
        );

        return {
          output: cmdHistory
            .map((cmd, idx) => {
              const date = new Date(cmd.timestamp);
              const indexStr = (idx + 1).toString().padStart(indexPadding, " ");

              // Truncate very long commands and add ellipsis
              const displayCmd =
                cmd.command.length > 25
                  ? cmd.command.substring(0, 22) + "..."
                  : cmd.command;

              // Pad command to align timestamps
              const paddedCmd = displayCmd.padEnd(longestCmd, " ");

              // Simplified date format: MM/DD HH:MM
              const dateStr = `${(date.getMonth() + 1)
                .toString()
                .padStart(2, "0")}/${date
                .getDate()
                .toString()
                .padStart(2, "0")} ${date
                .getHours()
                .toString()
                .padStart(2, "0")}:${date
                .getMinutes()
                .toString()
                .padStart(2, "0")}`;

              return `${indexStr}  ${paddedCmd}  # ${dateStr}`;
            })
            .join("\n"),
          isError: false,
        };
      }

      case "su": {
        if (args.length === 0) {
          return {
            output: "usage: su <username> [password]",
            isError: true,
          };
        }

        const targetUsername = args[0].trim();
        const passwordArg = args[1] ? args[1].trim() : undefined;
        const tempOutput = `switching to ${targetUsername}...`;

        class SuHandler {
          async perform() {
            try {
              const store = useChatsStore.getState();

              // If already that user, nothing to do
              if (store.username === targetUsername) {
                this.updateOutput(`already user ${targetUsername}`);
                return;
              }

              // Logout current user if different
              if (store.username && store.username !== targetUsername) {
                await store.logout();
              }

              // If password provided, attempt authentication first
              if (passwordArg) {
                const authResp = await fetch(
                  "/api/auth/login",
                  {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      username: targetUsername,
                      password: passwordArg,
                    }),
                  }
                );

                if (authResp.ok) {
                  const responseData = await authResp.json();
                  // Handle both old format and new format
                  const data = responseData.data || responseData;
                  if (data.token) {
                    const uname = data.user?.username || data.username || targetUsername;
                    store.setUsername(uname);
                    store.setAuthToken(data.token);
                    this.updateOutput(`logged in as ${uname}`);
                    return;
                  }
                }
                // fallthrough if auth failed -> will attempt create
              }

              // Attempt to create user; password is required by server
              if (!passwordArg) {
                this.updateOutput(
                  "su failed: password required for new user creation"
                );
                return;
              }

              const createResult = await store.createUser(
                targetUsername,
                passwordArg
              );

              if (createResult.ok) {
                this.updateOutput(`created and logged in as ${targetUsername}`);
              } else {
                // If creation failed and we didn't succeed auth, show error
                this.updateOutput(
                  `su failed: ${createResult.error || "unknown error"}`
                );
              }
            } catch (err) {
              const errorMsg =
                err instanceof Error ? err.message : "unknown error";
              this.updateOutput(`su failed: ${errorMsg}`);
            }
          }

          updateOutput(content: string) {
            setCommandHistory((prev) => {
              const last = prev[prev.length - 1];
              if (last.output === tempOutput) {
                return [...prev.slice(0, -1), { ...last, output: content }];
              }
              return prev;
            });
          }
        }

        setTimeout(() => {
          new SuHandler().perform();
        }, 50);

        return { output: tempOutput, isError: false };
      }

      case "logout": {
        if (!username) {
          return { output: "not logged in", isError: true };
        }

        const tempOutput = "logging out...";

        class LogoutHandler {
          async perform() {
            try {
              await useChatsStore.getState().logout();
              this.updateOutput("logged out");
            } catch (err) {
              const errorMsg =
                err instanceof Error ? err.message : "unknown error";
              this.updateOutput(`logout failed: ${errorMsg}`);
            }
          }

          updateOutput(content: string) {
            setCommandHistory((prev) => {
              const last = prev[prev.length - 1];
              if (last.output === tempOutput) {
                return [...prev.slice(0, -1), { ...last, output: content }];
              }
              return prev;
            });
          }
        }

        setTimeout(() => {
          new LogoutHandler().perform();
        }, 50);

        return { output: tempOutput, isError: false };
      }

      default:
        return {
          output: i18n.t("apps.terminal.output.commandNotFound", { cmd }),
          isError: true,
        };
    }
  };

  // New simple pass-through processor (still keeps urgent prefix for styling elsewhere)
  const processMessageContent = useCallback(
    (messageContent: string) => messageContent,
    []
  );

  // Reset launched apps when leaving AI mode
  useEffect(() => {
    if (!isInAiMode) {
      launchedAppsRef.current.clear();
    }
  }, [isInAiMode]);

  // Handle initial AI prompt when entering AI mode
  useEffect(() => {
    if (isInAiMode && initialAiPrompt) {
      // Send the initial prompt
      appendAiMessage(
        { text: initialAiPrompt },
        { body: { systemState: getSystemState() } }
      );

      // Clear the initial prompt after using it
      setInitialAiPrompt(undefined);
    }
  }, [isInAiMode, initialAiPrompt, appendAiMessage, setInitialAiPrompt]);

  // Memoize the AI response sound function to prevent dependency changes
  const playAiResponseSoundMemoized = useCallback(() => {
    playAiResponseSound();
  }, [playAiResponseSound]);

  // Watch for changes in the AI messages to update the terminal display
  useEffect(() => {
    if (!isInAiMode || aiMessages.length <= 1) return;

    const lastMessage = aiMessages[aiMessages.length - 1];
    if (lastMessage.role !== "assistant") return;

    const messageKey = `${lastMessage.id}-${JSON.stringify(
      (lastMessage as { parts?: unknown[] }).parts ??
        (lastMessage as { text?: string }).text
    )}`;
    if (messageKey === lastProcessedMessageIdRef.current) return;

    const parts = (lastMessage as { parts?: unknown[] }).parts as
      | unknown[]
      | undefined;
    const lines: string[] = [];
    let hasAquarium = false;
    const toolInvocations: ToolInvocationData[] = [];

    if (parts && parts.length > 0) {
      parts.forEach((part) => {
        const partType = (part as { type: string }).type;
        if (partType === "text") {
          const processed = processMessageContent(
            (part as { text: string }).text
          );
          if (processed) lines.push(processed);
        } else if (partType.startsWith("tool-")) {
          // AI SDK v5 tool parts have type like "tool-launchApp", "tool-ipodControl", etc.
          const toolName = partType.slice(5); // Remove "tool-" prefix
          const toolPart = part as {
            type: string;
            toolCallId: string;
            state: "input-streaming" | "input-available" | "output-available" | "output-error";
            input?: Record<string, unknown>;
            output?: unknown;
          };
          
          if (toolName === "aquarium") {
            hasAquarium = true;
          } else {
            // Store tool invocation for visual rendering
            toolInvocations.push({
              toolName,
              state: toolPart.state,
              input: toolPart.input,
              output: toolPart.output,
            });
          }
        }
      });
    } else {
      lines.push(
        processMessageContent((lastMessage as { text?: string }).text || "")
      );
    }

    const cleanedContent = lines.join("\n");
    if (isClearingTerminal) return;

    setCommandHistory((prev) => {
      const filteredHistory = prev.filter(
        (item) => item.path !== "ai-thinking"
      );
      const existingIndex = filteredHistory.findIndex(
        (item) =>
          item.path === "ai-assistant" && item.messageId === lastMessage.id
      );

      if (existingIndex !== -1) {
        const existing = filteredHistory[existingIndex];
        if (
          existing.output === cleanedContent &&
          existing.hasAquarium === hasAquarium &&
          JSON.stringify(existing.toolInvocations) === JSON.stringify(toolInvocations)
        )
          return prev;

        const updated = [...filteredHistory];
        updated[existingIndex] = {
          command: "",
          output: cleanedContent,
          path: "ai-assistant",
          messageId: lastMessage.id,
          hasAquarium,
          toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
        };
        return updated;
      }

      playAiResponseSoundMemoized();

      return [
        ...filteredHistory,
        {
          command: "",
          output: cleanedContent,
          path: "ai-assistant",
          messageId: lastMessage.id,
          hasAquarium,
          toolInvocations: toolInvocations.length > 0 ? toolInvocations : undefined,
        },
      ];
    });

    lastProcessedMessageIdRef.current = messageKey;
  }, [
    aiMessages,
    isInAiMode,
    isClearingTerminal,
    processMessageContent,
    playAiResponseSoundMemoized,
  ]);

  // Function to handle AI mode commands
  const handleAiCommand = (command: string) => {
    const lowerCommand = command.trim().toLowerCase();

    // Play command sound for AI mode commands too
    playCommandSound();

    // Add command to history commands array (for up/down arrow navigation)
    const newHistoryCommands = [...historyCommands, command];
    setHistoryCommands(newHistoryCommands);
    setHistoryIndex(-1);

    // Store in Zustand (including AI commands)
    useTerminalStore
      .getState()
      .addCommand(command.startsWith("ryo ") ? command : `ryo ${command}`);

    // Reset animated lines to ensure only new content gets animated
    setAnimatedLines(new Set());

    // If user types 'exit' or 'quit', leave AI mode
    if (lowerCommand === "exit" || lowerCommand === "quit") {
      track(TERMINAL_ANALYTICS.CHAT_EXIT);
      setIsInAiMode(false);
      stopAiResponse();
      // Reset to empty (system message handled on backend)
      setAiChatMessages([]);

      // Reset tracking refs
      lastProcessedMessageIdRef.current = null;
      launchedAppsRef.current.clear();

      // Add exit command to history
      setCommandHistory([
        ...commandHistory,
        {
          command: command,
          output: "Bye! ♥",
          path: currentPath,
        },
      ]);

      setCurrentCommand("");
      return;
    }

    // If user types 'clear', clear the chat history
    if (lowerCommand === "clear") {
      track(TERMINAL_ANALYTICS.CHAT_CLEAR);
      // Stop any ongoing AI response
      stopAiResponse();

      // Reset AI messages (system message handled on backend)
      setAiChatMessages([]);

      // Trigger clearing animation
      setIsClearingTerminal(true);

      // Reset animated lines to prevent typewriter effect on old content
      setAnimatedLines(new Set());

      // Reset tracking refs
      lastProcessedMessageIdRef.current = null;

      // Clear launched apps tracking
      launchedAppsRef.current.clear();

      setTimeout(() => {
        setIsClearingTerminal(false);
        // Set command history to just the welcome message
        setCommandHistory([
          {
            command: "",
            output: i18n.t("apps.terminal.output.chatCleared"),
            path: "ai-assistant",
          },
        ]);
      }, 300); // Short delay for animation

      setCurrentCommand("");
      return;
    }

    // Track AI command
    track(TERMINAL_ANALYTICS.AI_COMMAND, { prompt: command });

    // Add user command to chat history with special AI mode formatting
    // Remove any existing thinking messages
    const filteredHistory = commandHistory.filter(
      (item) => item.path !== "ai-thinking"
    );

    // Add only the user message - no thinking message in history
    setCommandHistory([
      ...filteredHistory,
      {
        command: command,
        output: "",
        path: "ai-user", // Special marker for AI mode user message
      },
    ]);

    // Send the message using useAiChat hook
    appendAiMessage(
      { text: command },
      { body: { systemState: getSystemState() } }
    );

    // Clear current command
    setCurrentCommand("");
  };

  const handleVimInput = (input: string) => {
    // Handle commands that start with ":"
    if (input.startsWith(":")) {
      if (input === ":q" || input === ":q!" || input === ":wq") {
        // Exit vim mode
        const output = input === ":wq" ? `"${vimFile?.name}" written` : "";

        setCommandHistory([
          ...commandHistory,
          {
            command: input,
            output,
            path: currentPath,
          },
        ]);

        // Save file if using :wq
        if (input === ":wq" && vimFile) {
          saveVimFile(vimFile);
        }

        // Clear vim state
        setIsInVimMode(false);
        setVimFile(null);
        setVimPosition(0);
        setVimMode("normal");
      } else {
        // Unsupported vim command
        setCommandHistory([
          ...commandHistory,
          {
            command: input,
            output: `unsupported vim command: ${input}`,
            path: currentPath,
          },
        ]);
      }
    } else if (input === "j" || input === "k") {
      // Handle navigation (j: down, k: up)
      if (!vimFile) return;

      const lines = vimFile.content.split("\n");
      const maxVisibleLines = 20; // Number of lines to display
      const maxPosition = Math.max(0, lines.length - maxVisibleLines);

      if (input === "j" && vimPosition < maxPosition) {
        setVimPosition((prev) => prev + 1);
      } else if (input === "k" && vimPosition > 0) {
        setVimPosition((prev) => prev - 1);
      }
    }

    // Clear the input field
    setCurrentCommand("");
  };

  // Helper function to save vim file content
  const saveVimFile = async (vimFile: { name: string; content: string }) => {
    try {
      // Find the file in the current files list to get its path
      const fileObj = files.find((f) => f.name === vimFile.name);

      if (!fileObj) {
        console.error(`Could not find file ${vimFile.name} for saving`);
        return;
      }

      // Use the saveFile API directly from useFileSystem
      await saveFile({
        path: fileObj.path,
        name: vimFile.name,
        content: vimFile.content,
        type: "text",
      });

      console.log(`Saved vim file ${vimFile.name} to ${fileObj.path}`);
    } catch (error) {
      const err = error as Error;
      console.error(`Error saving vim file: ${err.message || "Unknown error"}`);

      // Show error in terminal
      setCommandHistory((prev) => [
        ...prev,
        {
          command: "",
          output: `Error saving file: ${err.message || "Unknown error"}`,
          path: currentPath,
        },
      ]);
    }
  };

  const handleVimTextInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isInVimMode || !vimFile || vimMode !== "insert") return;

    const inputText = e.target.value;
    const lastChar = inputText.slice(-1);

    // Process the character input by modifying the file content
    const lines = vimFile.content.split("\n");
    const currentLine = lines[vimCursorLine] || "";

    // Insert the character at cursor position
    const newLine =
      currentLine.substring(0, vimCursorColumn) +
      lastChar +
      currentLine.substring(vimCursorColumn);
    lines[vimCursorLine] = newLine;

    // Update file content
    setVimFile({
      ...vimFile,
      content: lines.join("\n"),
    });

    // Move cursor forward
    setVimCursorColumn((prev) => prev + 1);

    // Clear the input field after processing
    setCurrentCommand("");
  };

  const increaseFontSize = () => {
    if (fontSize < 24) {
      setFontSize((prevSize) => prevSize + 2);
    }
  };

  const decreaseFontSize = () => {
    if (fontSize > 10) {
      setFontSize((prevSize) => prevSize - 2);
    }
  };

  const [terminalFlash, setTerminalFlash] = useState(false);

  const resetFontSize = () => {
    setFontSize(12); // Reset to default

    // Create a flash effect when resetting font size
    setTerminalFlash(true);
    setTimeout(() => setTerminalFlash(false), 300);
  };

  // Animation variants for terminal lines
  const lineVariants = {
    initial: {
      opacity: 0,
      y: 10,
      filter: "blur(2px)",
    },
    animate: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring" as const,
        stiffness: 100,
        damping: 25,
        mass: 0.8,
      },
    },
    exit: {
      opacity: 0,
      transition: { duration: 0.2 },
    },
  };

  // Track which output lines should use typewriter effect
  const [animatedLines, setAnimatedLines] = useState<Set<number>>(new Set());

  // Add new line to the animated lines set - optimize to prevent unnecessary updates
  useEffect(() => {
    if (commandHistory.length === 0) return;

    const newIndex = commandHistory.length - 1;
    const item = commandHistory[newIndex];

    // Skip adding animation if we've already processed this length
    if (previousCommandHistoryLength.current === commandHistory.length) return;
    previousCommandHistoryLength.current = commandHistory.length;

    setAnimatedLines((prev) => {
      // If the line is already animated, don't update the set
      if (prev.has(newIndex)) return prev;

      const newSet = new Set(prev);

      // Only animate certain types of output
      if (
        !item.path.startsWith("ai-") &&
        item.output &&
        item.output.length > 0 &&
        item.output.length < 150 &&
        !item.output.startsWith("command not found") &&
        !item.output.includes("commands") &&
        !item.output.includes("     __  __") &&
        !item.output.includes("ask ryo anything.") &&
        // Don't animate ls command output
        !(item.command && item.command.trim().startsWith("ls"))
      ) {
        newSet.add(newIndex);
      }

      return newSet;
    });
  }, [commandHistory]);

  // Update HTML preview usage in the component
  const handleHtmlPreviewInteraction = (isInteracting: boolean) => {
    setIsInteractingWithPreview(isInteracting);
  };

  // Add the following style in a useEffect that runs once to add the global animation
  useEffect(() => {
    // Add breathing animation if it doesn't exist
    if (!document.getElementById("breathing-animation")) {
      const style = document.createElement("style");
      style.id = "breathing-animation";
      style.innerHTML = `
        @keyframes breathing {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        
        .shimmer-subtle {
          animation: shimmer-text 2.5s ease-in-out infinite;
        }
        
        @keyframes shimmer-text {
          0% { opacity: 0.5; }
          50% { opacity: 0.8; }
          100% { opacity: 0.5; }
        }

        @keyframes gradient-spin {
          0% { color: #FFB3BA; }  /* Pastel Pink */
          20% { color: #BAFFC9; } /* Pastel Green */
          40% { color: #BAE1FF; } /* Pastel Blue */
          60% { color: #FFFFBA; } /* Pastel Yellow */
          80% { color: #FFE4BA; } /* Pastel Orange */
          100% { color: #FFB3BA; } /* Back to Pastel Pink */
        }

        .gradient-spin {
          animation: gradient-spin 4s ease-in-out infinite;
          text-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      // Clean up on unmount
      const styleElement = document.getElementById("breathing-animation");
      if (styleElement) {
        styleElement.remove();
      }
    };
  }, []);

  // Only apply to AI assistant messages and user messages in AI mode
  const shouldApplyMarkdown = (path: string): boolean => {
    return path === "ai-assistant" || path === "ai-user";
  };

  // VimEditor component has been extracted to separate file

  // Add a helper function to render the main terminal or vim editor
  const renderMainContent = () => {
    if (isInVimMode && vimFile) {
      return (
        <div className="mb-4">
          <VimEditor
            file={vimFile}
            position={vimPosition}
            vimCursorLine={vimCursorLine}
            vimCursorColumn={vimCursorColumn}
            vimMode={vimMode}
          />
          <div className="flex items-center mt-1">
            <span 
              className="text-green-400 mr-1 flex-shrink-0"
              style={{ 
                fontSize: `${fontSize}px`,
                lineHeight: `${Math.round(fontSize * 1.5)}px`,
                height: `${Math.round(fontSize * 1.5)}px`,
                fontFamily: 'inherit',
              }}
            >
              {vimMode === "normal" ? "" : vimMode === "insert" ? "" : ":"}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={currentCommand}
              onChange={
                vimMode === "insert"
                  ? handleVimTextInput
                  : (e) => setCurrentCommand(e.target.value)
              }
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              className={`flex-1 bg-transparent text-white font-monaco focus:outline-none terminal-input ${
                inputFocused ? "input--focused" : ""
              }`}
              style={{ 
                fontSize: `${fontSize}px`,
                lineHeight: `${Math.round(fontSize * 1.5)}px`,
                height: `${Math.round(fontSize * 1.5)}px`,
                fontFamily: 'inherit',
              }}
              autoFocus
            />
          </div>
        </div>
      );
    }

    return (
      <>
        <AnimatePresence>
          {commandHistory.map((item, index) => (
            <motion.div
              key={index}
              className="mb-1 select-text cursor-text"
              variants={lineVariants}
              initial="initial"
              animate={
                isClearingTerminal
                  ? {
                      opacity: 0,
                      y: -100,
                      filter: "blur(4px)",
                      transition: {
                        duration: 0.3,
                        delay: 0.02 * (commandHistory.length - index),
                      },
                    }
                  : "animate"
              }
              exit="exit"
            >
              {item.command && (
                <div className="flex select-text">
                  {item.path === "ai-user" ? (
                    <span className="text-purple-400 mr-2 select-text cursor-text">
                      <span className="inline-block w-2 text-center">→</span>{" "}
                      ryo
                    </span>
                  ) : (
                    <span className="text-green-400 mr-2 select-text cursor-text">
                      <span className="inline-block w-2 text-center">→</span>{" "}
                      {item.path === "/" ? "/" : item.path}
                    </span>
                  )}
                  <span className="select-text cursor-text">
                    {item.command}
                  </span>
                </div>
              )}
              {(item.output || (item.toolInvocations && item.toolInvocations.length > 0)) && (
                <div
                  className={`ml-0 select-text ${
                    item.path === "ai-thinking" ? "text-gray-400" : ""
                  } ${item.path === "ai-assistant" ? "text-purple-100" : ""} ${
                    item.path === "ai-error" ? "text-red-400" : ""
                  } ${item.path === "welcome-message" ? "text-gray-400" : ""} ${
                    // Add urgent message styling
                    item.output && isUrgentMessage(item.output) ? "text-red-400" : ""
                  } ${
                    // System messages (errors, usage hints) styled in gray
                    item.isSystemMessage ? "text-gray-400" : ""
                  }`}
                >
                  {item.path === "ai-thinking" ? (
                    <div>
                      <span className="gradient-spin">
                        <span className="inline-block w-2 text-center">
                          {(item.output || "").split(" ")[0]}
                        </span>{" "}
                        ryo
                      </span>
                      <span className="text-gray-500 italic shimmer-subtle">
                        {" "}{i18n.t("apps.terminal.output.isThinking")}
                        <AnimatedEllipsis />
                      </span>
                    </div>
                  ) : item.path === "ai-assistant" ? (
                    <div className="select-text cursor-text">
                      {(() => {
                        // Process the message to extract HTML and text parts
                        const { htmlContent, textContent, hasHtml } =
                          extractHtmlContent(item.output || "");

                        // Check if this is an urgent message
                        const urgent = isUrgentMessage(item.output || "");
                        // Clean content by removing !!!! prefix if urgent
                        const cleanedTextContent = urgent
                          ? cleanUrgentPrefix(textContent || "")
                          : textContent;

                        // Only mark as streaming if this specific message is the one currently being updated
                        const isThisMessageStreaming =
                          isAiLoading &&
                          aiMessages.length > 0 &&
                          aiMessages[aiMessages.length - 1].id ===
                            item.messageId &&
                          index === commandHistory.length - 1;

                        return (
                          <>
                            {/* Render tool invocations FIRST (before text content) */}
                            {item.toolInvocations && item.toolInvocations.length > 0 && (
                              <div className="space-y-0.5 mb-1">
                                {item.toolInvocations.map((invocation, invIdx) => (
                                  <TerminalToolInvocation
                                    key={`${item.messageId}-tool-${invIdx}`}
                                    invocation={invocation}
                                    fontSize={fontSize}
                                  />
                                ))}
                              </div>
                            )}

                            {/* Show only non-HTML text content with markdown parsing */}
                            {cleanedTextContent &&
                              (() => {
                                const parts = cleanedTextContent.split("\n");
                                return parts.map((line, idx) => {
                                  const trimmed = line.trimStart();
                                  const isSpin = trimmed.startsWith(":::");
                                  const isRes = trimmed.startsWith("→");
                                  const displayLine = isSpin
                                    ? line.replace(
                                        ":::",
                                        spinnerChars[spinnerIndex]
                                      )
                                    : line;
                                  const cls = urgent
                                    ? "text-red-300"
                                    : isSpin
                                    ? "gradient-spin italic"
                                    : isRes
                                    ? "text-gray-400"
                                    : "text-purple-300";
                                  return (
                                    <span
                                      key={idx}
                                      className={`select-text cursor-text ${cls}`}
                                    >
                                      {idx > 0 && <br />}
                                      {idx === 0 && urgent && (
                                        <UrgentMessageAnimation />
                                      )}
                                      {parseSimpleMarkdown(displayLine)}
                                    </span>
                                  );
                                });
                              })()}

                            {/* Show HTML preview if there's HTML content */}
                            {hasHtml && htmlContent && (
                              <TerminalHtmlPreview
                                htmlContent={htmlContent}
                                onInteractionChange={
                                  handleHtmlPreviewInteraction
                                }
                                isStreaming={isThisMessageStreaming}
                                playElevatorMusic={playElevatorMusic}
                                stopElevatorMusic={stopElevatorMusic}
                                playDingSound={playDingSound}
                              />
                            )}

                            {/* Render aquarium tool visually when present */}
                            {item.hasAquarium && (
                              <div className="mt-1">
                                <EmojiAquarium />
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : animatedLines.has(index) ? (
                    <>
                      {isUrgentMessage(item.output) && (
                        <UrgentMessageAnimation />
                      )}
                      <TypewriterText
                        text={
                          isUrgentMessage(item.output)
                            ? cleanUrgentPrefix(item.output)
                            : item.output
                        }
                        speed={10}
                        className=""
                        renderMarkdown={shouldApplyMarkdown(item.path)}
                      />
                    </>
                  ) : (
                    <>
                      {isUrgentMessage(item.output) && (
                        <UrgentMessageAnimation />
                      )}
                      {isUrgentMessage(item.output)
                        ? shouldApplyMarkdown(item.path)
                          ? parseSimpleMarkdown(cleanUrgentPrefix(item.output))
                          : cleanUrgentPrefix(item.output)
                        : shouldApplyMarkdown(item.path)
                        ? parseSimpleMarkdown(item.output)
                        : item.output}
                      {isHtmlCodeBlock(item.output).isHtml && (
                        <TerminalHtmlPreview
                          htmlContent={isHtmlCodeBlock(item.output).content}
                          onInteractionChange={handleHtmlPreviewInteraction}
                          isStreaming={false}
                          playElevatorMusic={playElevatorMusic}
                          stopElevatorMusic={stopElevatorMusic}
                          playDingSound={playDingSound}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        <div className="relative select-text">
          <form
            onSubmit={handleCommandSubmit}
            className="flex items-center transition-all duration-200 select-text"
          >
            {isInAiMode ? (
              <span 
                className="text-purple-400 mr-2 whitespace-nowrap select-text cursor-text flex-shrink-0"
                style={{ 
                  fontSize: `${fontSize}px`,
                  lineHeight: `${Math.round(fontSize * 1.5)}px`,
                  height: `${Math.round(fontSize * 1.5)}px`,
                  fontFamily: 'inherit',
                }}
              >
                {isAiLoading ? (
                  <span>
                    <span className="gradient-spin">
                      <span className="inline-block w-2 text-center">
                        {spinnerChars[spinnerIndex]}
                      </span>{" "}
                      ryo
                    </span>
                  </span>
                ) : (
                  <>
                    <span className="inline-block w-2 text-center">→</span> ryo
                  </>
                )}
              </span>
            ) : (
              <span 
                className="text-green-400 mr-2 whitespace-nowrap select-text cursor-text flex-shrink-0"
                style={{ 
                  fontSize: `${fontSize}px`,
                  lineHeight: `${Math.round(fontSize * 1.5)}px`,
                  height: `${Math.round(fontSize * 1.5)}px`,
                  fontFamily: 'inherit',
                }}
              >
                <span className="inline-block w-2 text-center">→</span>{" "}
                {currentPath === "/" ? "/" : currentPath}
              </span>
            )}
            <div className="flex-1 relative min-w-0">
              <input
                ref={inputRef}
                type="text"
                value={currentCommand}
                onChange={(e) => setCurrentCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                onTouchStart={(e) => {
                  e.preventDefault();
                }}
                className={`w-full text-white font-monaco focus:outline-none bg-transparent terminal-input ${
                  inputFocused ? "input--focused" : ""
                }`}
                style={{ 
                  fontSize: `${fontSize}px`,
                  lineHeight: `${Math.round(fontSize * 1.5)}px`,
                  height: `${Math.round(fontSize * 1.5)}px`,
                  fontFamily: 'inherit',
                }}
                autoFocus
              />
              {isAiLoading && isInAiMode && (
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex items-center">
                  <span className="text-gray-400/40 opacity-30 shimmer">
                    {i18n.t("apps.terminal.output.isThinking")}
                    <AnimatedEllipsis />
                  </span>
                </div>
              )}
            </div>
          </form>
        </div>
      </>
    );
  };

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const menuBar = (
    <TerminalMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onClear={() => {
        setIsClearingTerminal(true);
        setTimeout(() => {
          setIsClearingTerminal(false);
          setCommandHistory([]);
        }, 500);
      }}
      onIncreaseFontSize={increaseFontSize}
      onDecreaseFontSize={decreaseFontSize}
      onResetFontSize={resetFontSize}
      onToggleMute={toggleMute}
      isMuted={isMuted}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        appId="terminal"
        title={getTranslatedAppName("terminal")}
        onClose={onClose}
        isForeground={isForeground}
        material="transparent"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <motion.div
          className="terminal-content flex flex-col h-full w-full bg-black/80 backdrop-blur-lg text-white antialiased font-monaco overflow-hidden select-text"
          style={{
            // Use CSS custom property to allow !important override in macOS theme
            "--terminal-font-size": `${fontSize}px`,
            fontSize: `${fontSize}px`,
            fontFamily:
              '"Monaco", "ArkPixel", "SerenityOS-Emoji", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
          } as React.CSSProperties}
          animate={
            terminalFlash
              ? {
                  filter: ["brightness(1)", "brightness(1.5)", "brightness(1)"],
                  scale: [1, 1.01, 1],
                }
              : {}
          }
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <div
            ref={terminalRef}
            className="flex-1 overflow-auto whitespace-pre-wrap select-text cursor-text p-2"
            onClick={(e) => {
              // Only focus input if this isn't a text selection
              if (window.getSelection()?.toString() === "") {
                e.stopPropagation();
                inputRef.current?.focus();
                if (!isForeground) {
                  bringToForeground("terminal");
                }
              }
            }}
            onScroll={handleScroll}
          >
            {renderMainContent()}
          </div>
        </motion.div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="terminal"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={
          appMetadata || {
            name: "Terminal",
            version: "1.0",
            creator: {
              name: "Ryo Lu",
              url: "https://ryo.lu",
            },
            github: "https://github.com/ryokun6/ryos",
            icon: "/icons/default/terminal.png",
          }
        }
        appId="terminal"
      />
    </>
  );
}

// --- Debounce helper copied from useAiChat for insertText tool ---
// Currently unused. Remove if not needed in the future.
