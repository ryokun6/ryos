import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps } from "@/apps/base/types";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { TerminalMenuBar } from "./TerminalMenuBar";
import { appMetadata, helpItems } from "../index";
import { useFileSystem, dbOperations, STORES, DocumentContent } from "@/apps/finder/hooks/useFileSystem";
import { useTerminalStore } from "@/stores/useTerminalStore";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useChat } from "ai/react";
import { useAppContext } from "@/contexts/AppContext";
import { useAppStore } from "@/stores/useAppStore";
import { AppId, appRegistry } from "@/config/appRegistry";
import { useTerminalSounds } from "@/hooks/useTerminalSounds";
import { track } from "@vercel/analytics";
import HtmlPreview, {
  isHtmlCodeBlock,
  extractHtmlContent,
} from "@/components/shared/HtmlPreview";
import { useSound, Sounds } from "@/hooks/useSound";
import { useChatsStore } from "@/stores/useChatsStore";

// Analytics event namespace for terminal AI events
export const TERMINAL_ANALYTICS = {
  AI_COMMAND: "terminal:ai_command",
  CHAT_START: "terminal:chat_start",
  CHAT_EXIT: "terminal:chat_exit",
  CHAT_CLEAR: "terminal:chat_clear",
};

interface CommandHistory {
  command: string;
  output: string;
  path: string;
  messageId?: string; // Optional since not all commands will have a message ID
}

// Available commands for autocompletion
const AVAILABLE_COMMANDS = [
  "help",
  "clear",
  "pwd",
  "ls",
  "cd",
  "cat",
  "mkdir",
  "touch",
  "rm",
  "edit",
  "history",
  "about",
  "ryo",
  "ai",
  "chat",
  "echo",
  "whoami",
  "date",
  "vim",
];

// Helper: prettify tool names
const formatToolName = (name: string): string =>
  name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (ch) => ch.toUpperCase())
    .trim();

const getAppName = (id?: string): string => {
  if (!id) return "app";
  const entry = (appRegistry as Record<string, { name?: string }>)[id];
  return entry?.name || formatToolName(id);
};

// Minimal system state for AI chat requests
const getSystemState = () => {
  const appStore = useAppStore.getState();
  const { username } = useChatsStore.getState();

  const runningApps = Object.entries(appStore.apps)
    .filter(([, state]) => state.isOpen)
    .map(([id, state]) => ({ id, isForeground: state.isForeground || false }));

  const foregroundApp = runningApps.find((a) => a.isForeground)?.id || null;
  const backgroundApps = runningApps
    .filter((a) => !a.isForeground)
    .map((a) => a.id);

  const now = new Date();
  const userTimeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
  const userTimeString = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const userDateString = now.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    apps: appStore.apps,
    username,
    userLocalTime: {
      timeString: userTimeString,
      dateString: userDateString,
      timeZone: userTimeZone,
    },
    runningApps: {
      foreground: foregroundApp,
      background: backgroundApps,
      windowOrder: appStore.windowOrder,
    },
  };
};

// Helper function to parse app control markup
const parseAppControlMarkup = (
  message: string
): {
  type: "launch" | "close";
  id: string;
}[] => {
  const operations: { type: "launch" | "close"; id: string }[] = [];

  try {
    // Find all app control tags
    const launchRegex = /<app:launch\s+id\s*=\s*"([^"]+)"\s*\/>/g;
    const closeRegex = /<app:close\s+id\s*=\s*"([^"]+)"\s*\/>/g;

    // Find all launch operations
    let match;
    while ((match = launchRegex.exec(message)) !== null) {
      operations.push({
        type: "launch" as const,
        id: match[1],
      });
    }

    // Find all close operations
    while ((match = closeRegex.exec(message)) !== null) {
      operations.push({
        type: "close" as const,
        id: match[1],
      });
    }
  } catch (error) {
    console.error("Error parsing app control markup:", error);
  }

  return operations;
};

// Helper function to clean app control markup from message
const cleanAppControlMarkup = (message: string): string => {
  // Replace launch tags with human readable text
  message = message.replace(
    /<app:launch\s+id\s*=\s*"([^"]+)"\s*\/>/g,
    (_match, id) => `*opened ${id}*`
  );

  // Replace close tags with human readable text
  message = message.replace(
    /<app:close\s+id\s*=\s*"([^"]+)"\s*\/>/g,
    (_match, id) => `*closed ${id}*`
  );

  return message.trim();
};

// Helper function to check if a message is urgent (starts with "!!!!")
const isUrgentMessage = (content: string): boolean =>
  content.startsWith("!!!!");

// Function to clean urgent message prefix
const cleanUrgentPrefix = (content: string): string => {
  return isUrgentMessage(content) ? content.slice(4).trimStart() : content;
};

// Animated ASCII for urgent messages
function UrgentMessageAnimation() {
  const [frame, setFrame] = useState(0);
  const frames = ["!   ", "!!  ", "!!! ", "!!  ", "!   "];

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % frames.length);
    }, 300);

    return () => clearInterval(interval);
  }, []);

  return <span className="text-red-400 animate-pulse">{frames[frame]}</span>;
}

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

// Helper function to parse simple markdown formatting
const parseSimpleMarkdown = (text: string): React.ReactNode[] => {
  if (!text) return [text];

  // Process the bold formatting first, then italic
  let result: React.ReactNode[] = [];
  const currentText = text;

  // Process bold patterns first (**text** or __text__)
  const boldRegex = /(\*\*.*?\*\*|__.*?__)/g;
  let lastIndex = 0;
  let boldMatch;

  while ((boldMatch = boldRegex.exec(currentText)) !== null) {
    // Add text before the match
    if (boldMatch.index > lastIndex) {
      result.push(currentText.substring(lastIndex, boldMatch.index));
    }

    // Add the bold text
    const boldContent = boldMatch[0].replace(/^\*\*|\*\*$|^__|__$/g, "");
    result.push(
      <span key={`bold-${boldMatch.index}`} className="font-bold">
        {boldContent}
      </span>
    );

    lastIndex = boldMatch.index + boldMatch[0].length;
  }

  // Add any remaining text after the last bold match
  if (lastIndex < currentText.length) {
    result.push(currentText.substring(lastIndex));
  }

  // Now process italic in each text segment
  result = result.flatMap((segment, i) => {
    if (typeof segment !== "string") return segment;

    const italicParts: React.ReactNode[] = [];
    const italicRegex = /(\*[^*]+\*|_[^_]+_)/g;
    let lastItalicIndex = 0;
    let italicMatch;

    while ((italicMatch = italicRegex.exec(segment)) !== null) {
      // Add text before the match
      if (italicMatch.index > lastItalicIndex) {
        italicParts.push(segment.substring(lastItalicIndex, italicMatch.index));
      }

      // Add the italic text
      const italicContent = italicMatch[0].replace(/^\*|\*$|^_|_$/g, "");
      italicParts.push(
        <span key={`italic-${i}-${italicMatch.index}`} className="italic">
          {italicContent}
        </span>
      );

      lastItalicIndex = italicMatch.index + italicMatch[0].length;
    }

    // Add any remaining text after the last italic match
    if (lastItalicIndex < segment.length) {
      italicParts.push(segment.substring(lastItalicIndex));
    }

    return italicParts.length > 0 ? italicParts : segment;
  });

  return result;
};

interface ToolInvocation {
  state: "partial-call" | "call" | "result";
  step?: number;
  toolCallId: string;
  toolName: string;
  args?: Record<string, any>;
  result?: any;
}

const formatToolInvocation = (invocation: ToolInvocation): string | null => {
  const { toolName, state, args, result } = invocation;
  if (state === "call" || state === "partial-call") {
    switch (toolName) {
      case "textEditSearchReplace":
        return "Replacing text…";
      case "textEditInsertText":
        return "Inserting text…";
      case "launchApp":
        return `Launching ${getAppName(args?.id)}…`;
      case "closeApp":
        return `Closing ${getAppName(args?.id)}…`;
      case "textEditNewFile":
        return "Creating new document…";
      default:
        return `Running ${formatToolName(toolName)}…`;
    }
  }

  if (state === "result") {
    if (toolName === "launchApp" && args?.id === "internet-explorer") {
      const urlPart = args.url ? ` ${args.url}` : "";
      const yearPart = args.year && args.year !== "" ? ` in ${args.year}` : "";
      return `Launched${urlPart}${yearPart}`;
    } else if (toolName === "launchApp") {
      return `Launched ${getAppName(args?.id)}`;
    } else if (toolName === "closeApp") {
      return `Closed ${getAppName(args?.id)}`;
    }
    if (toolName === "generateHtml" && typeof result === "string" && result.trim().length > 0) {
      return result.trim();
    }
    if (typeof result === "string") return result;
    return formatToolName(toolName);
  }

  return null;
};

// TypewriterText component for terminal output
function TypewriterText({
  text,
  className,
  speed = 15,
  renderMarkdown = false,
}: {
  text: string;
  className?: string;
  speed?: number;
  renderMarkdown?: boolean;
}) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const textRef = useRef(text);

  useEffect(() => {
    // Reset when text changes
    setDisplayedText("");
    setIsComplete(false);
    textRef.current = text;

    // Skip animation for long text (performance)
    if (text.length > 200) {
      setDisplayedText(text);
      setIsComplete(true);
      return;
    }

    // Adjust speed based on text length - faster for longer text
    const adjustedSpeed =
      text.length > 100 ? speed * 0.7 : text.length > 50 ? speed * 0.85 : speed;

    // Split into reasonable chunks for better performance
    // This makes animation smoother by reducing React state updates
    const chunkSize = text.length > 100 ? 3 : text.length > 50 ? 2 : 1;
    const chunks: string[] = [];

    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, Math.min(i + chunkSize, text.length)));
    }

    // Use a recursive setTimeout for more reliable animation
    let currentIndex = 0;
    let timeoutId: NodeJS.Timeout;

    const typeNextChunk = () => {
      if (currentIndex < chunks.length) {
        const chunk = chunks[currentIndex];
        setDisplayedText((prev) => prev + chunk);
        currentIndex++;

        // Pause longer after punctuation for natural rhythm
        const endsWithPunctuation = /[.,!?;:]$/.test(chunk);
        const delay = endsWithPunctuation ? adjustedSpeed * 3 : adjustedSpeed;

        timeoutId = setTimeout(typeNextChunk, delay);
      } else {
        setIsComplete(true);
      }
    };

    // Start the typing animation
    timeoutId = setTimeout(typeNextChunk, adjustedSpeed);

    // Clean up on unmount
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [text, speed]);

  return (
    <span className={`select-text cursor-text ${className || ""}`}>
      {renderMarkdown ? parseSimpleMarkdown(displayedText) : displayedText}
      {!isComplete && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ repeat: Infinity, duration: 0.8 }}
        >
          _
        </motion.span>
      )}
    </span>
  );
}

// Animated ellipsis component for thinking indicator
function AnimatedEllipsis() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const patterns = [".", "..", "...", "..", ".", ".", "..", "..."];
    let index = 0;

    const interval = setInterval(() => {
      setDots(patterns[index]);
      index = (index + 1) % patterns.length;
    }, 200);

    return () => clearInterval(interval);
  }, []);

  return <span>{dots}</span>;
}

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
}: AppProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [currentCommand, setCurrentCommand] = useState("");
  const [commandHistory, setCommandHistory] = useState<CommandHistory[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [historyCommands, setHistoryCommands] = useState<string[]>([]);
  const [fontSize, setFontSize] = useState(12); // Default font size in pixels
  const [isInAiMode, setIsInAiMode] = useState(false);
  const [isInVimMode, setIsInVimMode] = useState(false);
  const [vimFile, setVimFile] = useState<{
    name: string;
    content: string;
  } | null>(null);
  const [vimPosition, setVimPosition] = useState(0); // Current position for pagination
  const [vimCursorLine, setVimCursorLine] = useState(0); // Current cursor line position
  const [vimCursorColumn, setVimCursorColumn] = useState(0); // Current cursor column position
  const [vimMode, setVimMode] = useState<"normal" | "command" | "insert">(
    "normal"
  ); // Vim mode
  const [vimClipboard, setVimClipboard] = useState<string>(""); // Add clipboard state for vim copy/paste
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

  const launchApp = useLaunchApp();
  const { toggleApp, bringToForeground } = useAppContext();

  // Execute side effects for tool invocations
  const handleToolInvocation = useCallback(
    (invocation: ToolInvocation) => {
      if (invocation.state !== "call") return;

      const { toolName, args } = invocation;

      if (toolName === "launchApp") {
        const id = args?.id as string | undefined;
        if (id && !launchedAppsRef.current.has(id)) {
          const options: { initialData?: any } = {};
          if (id === "internet-explorer" && (args?.url || args?.year)) {
            options.initialData = { url: args.url, year: args.year || "current" };
          }
          launchApp(id as AppId, options);
          launchedAppsRef.current.add(id);
        }
      } else if (toolName === "closeApp") {
        const id = args?.id as string | undefined;
        if (id) {
          toggleApp(id as AppId);
          launchedAppsRef.current.delete(id);
        }
      }
    },
    [launchApp, toggleApp]
  );

  // Add useChat hook
  const {
    messages: aiMessages,
    append: appendAiMessage,
    isLoading: isAiLoading,
    stop: stopAiResponse,
    setMessages: setAiChatMessages,
  } = useChat({
    api: "/api/chat",
    body: { systemState: getSystemState() },
    initialMessages: [
      {
        id: "system",
        role: "system",
        content:
          "You are a helpful AI assistant and genius web front-end programmer running in a terminal on ryOS.",
      },
    ],
    experimental_throttle: 50,
    async onToolCall({ toolCall }) {
      try {
        handleToolInvocation(toolCall as ToolInvocation);

        if (toolCall.toolName === "launchApp") {
          const id = (toolCall.args as any)?.id as string | undefined;
          const appName = getAppName(id);
          if (id === "internet-explorer") {
            const url = (toolCall.args as any)?.url;
            const year = (toolCall.args as any)?.year;
            const urlPart = url ? ` to ${url}` : "";
            const yearPart = year && year !== "current" ? ` in ${year}` : "";
            return `Launched ${appName}${urlPart}${yearPart}.`;
          }
          return `Launched ${appName}.`;
        }

        if (toolCall.toolName === "closeApp") {
          const id = (toolCall.args as any)?.id as string | undefined;
          return `Closed ${getAppName(id)}.`;
        }

        if (toolCall.toolName === "generateHtml") {
          const html = (toolCall.args as any)?.html as string;
          return html?.trim() || "";
        }

        return "";
      } catch (err) {
        console.error("Error executing tool call:", err);
        return `Failed to execute ${toolCall.toolName}`;
      }
    },
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  // Get file operations from the hook
  // Get terminal state from the store
  const { currentPath: storedPath } = useTerminalStore();
  
  const { 
    currentPath, 
    files, 
    navigateToPath, 
    saveFile, 
    moveToTrash
  } = useFileSystem(storedPath);


  const {
    playCommandSound,
    playErrorSound,
    playAiResponseSound,
    toggleMute,
    isMuted,
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
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
        output: `${asciiArt}\nlast login: ${currentTime}\ntype 'help' to see available commands\n\n`,
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

    // Process the command
    const result = processCommand(currentCommand);

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
      },
    ]);

    // Clear current command
    setCurrentCommand("");
  };

  // Parse command respecting quotes for arguments with spaces
  const parseCommand = (command: string): { cmd: string; args: string[] } => {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) return { cmd: "", args: [] };

    // Handle quoted arguments
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const parts: string[] = [];
    let match;

    // Extract all parts including quoted sections
    while ((match = regex.exec(trimmedCommand)) !== null) {
      // If it's a quoted string, use the capture group (without quotes)
      if (match[1]) parts.push(match[1]);
      else if (match[2]) parts.push(match[2]);
      else parts.push(match[0]);
    }

    return {
      cmd: parts[0].toLowerCase(),
      args: parts.slice(1),
    };
  };

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

  const processCommand = (
    command: string
  ): { output: string; isError: boolean } => {
    const { cmd, args } = parseCommand(command);

    switch (cmd) {
      case "help":
        return {
          output: `
navigation & files
  pwd              show current directory
  ls               list directory contents  
  cd <dir>         change directory
  cat <file>       view file contents
  touch <file>     create empty file
  mkdir <dir>      create directory
  rm <file>        move file to trash
  edit <file>      open in text editor
  vim <file>       open in vim editor

terminal
  clear            clear screen
  help             show this help
  history          show command history
  about            about terminal
  echo <text>      display text
  whoami           display current user
  date             display current date/time

assistant
  ryo <prompt>     chat with ryo

`,
          isError: false,
        };

      case "clear":
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
        return { output: "", isError: false };

      case "pwd":
        return { output: currentPath, isError: false };

      case "ls": {
        if (files.length === 0) {
          return { output: "no files found", isError: false };
        }
        return {
          output: files
            .map((file) => (file.isDirectory ? file.name : file.name))
            .join("\n"),
          isError: false,
        };
      }

      case "cd": {
        if (args.length === 0) {
          navigateToPath("/");
          return { output: "", isError: false };
        }

        // Handle special case for parent directory
        if (args[0] === "..") {
          const pathParts = currentPath.split("/").filter(Boolean);
          const parentPath =
            pathParts.length > 0 ? "/" + pathParts.slice(0, -1).join("/") : "/";
          navigateToPath(parentPath);
          return { output: "", isError: false };
        }

        let newPath = args[0];

        // Handle relative paths
        if (!newPath.startsWith("/")) {
          newPath = `${currentPath === "/" ? "" : currentPath}/${newPath}`;
        }

        // Verify the path exists before navigating
        // First normalize the path to prevent issues with trailing slashes
        const normalizedPath =
          newPath.endsWith("/") && newPath !== "/"
            ? newPath.slice(0, -1)
            : newPath;

        // Get the parent directory to check if target exists
        const pathParts = normalizedPath.split("/").filter(Boolean);
        const targetDir = pathParts.pop(); // Remove the target directory from the path
        const parentPath =
          pathParts.length > 0 ? "/" + pathParts.join("/") : "/";

        // Special case for root directory
        if (normalizedPath === "/") {
          navigateToPath("/");
          return { output: "", isError: false };
        }

        // Get files in the parent directory
        const filesInParent = files.filter((file) => {
          const parentPathWithSlash = parentPath.endsWith("/")
            ? parentPath
            : parentPath + "/";
          return (
            file.path.startsWith(parentPathWithSlash) &&
            !file.path.replace(parentPathWithSlash, "").includes("/")
          );
        });

        // Check if the target directory exists
        const targetExists = filesInParent.some(
          (file) => file.name === targetDir && file.isDirectory
        );

        if (!targetExists) {
          return {
            output: `cd: ${args[0]}: no such directory`,
            isError: true,
          };
        }

        // Directory exists, navigate to it
        navigateToPath(normalizedPath);
        return { output: "", isError: false };
      }

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
            return file && (file.path.startsWith("/Documents/") || file.path.startsWith("/Images/"));
          }
          
          async loadRealFileContent() {
            // Ensure file exists first
            if (!file) return;
            
            // Determine store based on file path
            const storeName = file.path.startsWith("/Documents/") 
              ? STORES.DOCUMENTS 
              : STORES.IMAGES;
              
            const contentData = await dbOperations.get<DocumentContent>(storeName, file.name);
            
            if (contentData && contentData.content) {
              // Convert content to text based on type
              let fileContent = "";
              if (contentData.content instanceof Blob) {
                fileContent = await contentData.content.text();
              } else if (typeof contentData.content === 'string') {
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
            this.updateOutput(`${fileName} content not available (virtual file)`);
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
            this.updateOutput(`Error reading file: ${err.message || 'Unknown error'}`);
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

      case "mkdir":
        return {
          output:
            "command not implemented: mkdir requires filesystem write access",
          isError: true,
        };

      case "touch": {
        if (args.length === 0) {
          return {
            output: "usage: touch <filename>",
            isError: true,
          };
        }

        const newFileName = args[0];

        // Check if file already exists
        if (files.find((f) => f.name === newFileName)) {
          return {
            output: `file already exists: ${newFileName}`,
            isError: true,
          };
        }

        // Create empty file
        saveFile({
          name: newFileName,
          path: `${currentPath}/${newFileName}`,
          content: "",
          type: "text",
          icon: "/icons/file-text.png"
        });

        return {
          output: `created file: ${newFileName}`,
          isError: false,
        };
      }

      case "rm": {
        if (args.length === 0) {
          return {
            output: "usage: rm <filename>",
            isError: true,
          };
        }

        const fileToDelete = args[0];
        const fileObj = files.find((f) => f.name === fileToDelete);

        if (!fileObj) {
          return {
            output: `file not found: ${fileToDelete}`,
            isError: true,
          };
        }

        moveToTrash(fileObj);
        return {
          output: `moved to trash: ${fileToDelete}`,
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
                const contentData = await dbOperations.get<DocumentContent>(STORES.IMAGES, fileToEditObj.name);
                let fileContent = "";
                
                if (contentData && contentData.content) {
                  if (contentData.content instanceof Blob) {
                    fileContent = await contentData.content.text();
                  } else if (typeof contentData.content === 'string') {
                    fileContent = contentData.content;
                  }
                }
                
                // Save to Documents
                await saveFile({
                  name: fileName,
                  path: documentsPath,
                  content: fileContent || "",
                  type: "text",
                  icon: "/icons/file-text.png"
                });
              } else {
                // For virtual files, create an empty document
                await saveFile({
                  name: fileName,
                  path: documentsPath,
                  content: "",
                  type: "text",
                  icon: "/icons/file-text.png"
                });
              }
              
              // Launch TextEdit with the copied file
              launchApp("textedit", { initialData: { path: documentsPath, content: "" } });
            } catch (error) {
              console.error("Error preparing file for editing:", error);
            }
          }, 100);
        } else {
          // If already in Documents, just launch TextEdit directly with the file path
          // Let TextEdit use its own content loading mechanism
          launchApp("textedit", { initialData: { path: fileToEditObj.path, content: "" } });
        }

        return {
          output: `opening ${fileToEdit} in textedit...`,
          isError: false,
        };
      }

      case "about":
        setTimeout(() => setIsAboutDialogOpen(true), 100);
        return {
          output: "opening about dialog...",
          isError: false,
        };

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

      case "echo": {
        return {
          output: args.join(" "),
          isError: false,
        };
      }

      case "whoami": {
        return {
          output: username || "you",
          isError: false,
        };
      }

      case "date": {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          year: "numeric",
          timeZoneName: "short",
        };
        return {
          output: now.toLocaleString("en-US", options),
          isError: false,
        };
      }

      case "vim": {
        if (args.length === 0) {
          return {
            output: "usage: vim <filename>",
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
        const tempOutput = `opening ${fileName} in vim...`;

        // Create a class to capture file content during the async process
        class FileContentCapture {
          async captureContent() {
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
            return file && (file.path.startsWith("/Documents/") || file.path.startsWith("/Images/"));
          }
          
          async loadRealFileContent() {
            // Ensure file exists first (this should always be true, but TypeScript doesn't know that)
            if (!file) return;
            
            // Determine if this is a document or image
            const storeName = file.path.startsWith("/Documents/") 
              ? STORES.DOCUMENTS 
              : STORES.IMAGES;
              
            const contentData = await dbOperations.get<DocumentContent>(storeName, file.name);
            
            if (contentData && contentData.content) {
              // Convert content to text
              let textContent = "";
              if (contentData.content instanceof Blob) {
                textContent = await contentData.content.text();
              } else if (typeof contentData.content === 'string') {
                textContent = contentData.content;
              }
              
              // Enter vim mode with the fetched content
              this.openInVim(textContent);
            } else {
              // File exists in metadata but has no content - create empty
              this.openInVim("");
            }
          }
          
          handleVirtualFile() {
            // For virtual files, just create an empty file in vim
            this.openInVim("");
            
            // Show a warning
            setCommandHistory((prev) => [
              ...prev,
              {
                command: `vim ${fileName}`,
                output: `Warning: ${fileName} appears to be a virtual file without content`,
                path: currentPath,
              },
            ]);
          }
          
          openInVim(content: string) {
            setIsInVimMode(true);
            setVimFile({
              name: fileName,
              content: content || "", 
            });
            setVimPosition(0);
            setVimCursorLine(0);
            setVimCursorColumn(0);
            setVimMode("normal");
          }
          
          handleError(error: unknown) {
            const err = error as Error;
            console.error("Error reading file for vim:", err);
            
            setCommandHistory((prev) => [
              ...prev,
              {
                command: `vim ${fileName}`,
                output: `Error reading file: ${err.message || 'Unknown error'}`,
                path: currentPath,
              },
            ]);
          }
        }
        
        // Start the content capture process asynchronously
        setTimeout(() => {
          const contentCapture = new FileContentCapture();
          contentCapture.captureContent();
        }, 100);

        return {
          output: tempOutput,
          isError: false,
        };
      }

      case "ai":
      case "chat":
      case "ryo": {
        // Enter AI chat mode
        setIsInAiMode(true);

        // Track chat start
        track(TERMINAL_ANALYTICS.CHAT_START);

        // Reset AI messages to just the system message
        setAiChatMessages([
          {
            id: "system",
            role: "system",
            content:
              "You are a coding assistant running in the terminal app on ryOS.",
          },
        ]);

        // If there's an initial prompt, add it to messages and immediately send it
        if (args.length > 0) {
          const initialPrompt = args.join(" ");

          // Track AI command
          track(TERMINAL_ANALYTICS.AI_COMMAND, { prompt: initialPrompt });

          // Add prompt to command history
          setCommandHistory((prev) => [
            ...prev,
            {
              command: initialPrompt,
              output: "",
              path: "ai-user",
            },
            {
              command: "",
              output: `${spinnerChars[spinnerIndex]} ryo is thinking...`,
              path: "ai-thinking",
            },
          ]);

          // Send the initial prompt
          appendAiMessage(
            { role: "user", content: initialPrompt },
            { body: { systemState: getSystemState() } }
          );

          return {
            output: `ask ryo anything. type 'exit' to return to terminal.\n→ from your command: ${initialPrompt}`,
            isError: false,
          };
        }

        return {
          output: `ask ryo anything. type 'exit' to return to terminal.`,
          isError: false,
        };
      }

      default:
        return {
          output: `command not found: ${cmd}. type 'help' for a list of available commands.`,
          isError: true,
        };
    }
  };

  // Function to handle app controls - memoized to prevent recreation on every render
  const handleAppControls = useCallback(
    (messageContent: string) => {
      if (!/<app:(launch|close)/i.test(messageContent)) {
        return messageContent;
      }

      const operations = parseAppControlMarkup(messageContent);
      if (operations.length === 0) {
        return messageContent;
      }

      // Execute app control operations - but only once per app
      operations.forEach((op) => {
        if (op.type === "launch") {
          // Only launch each app once
          if (!launchedAppsRef.current.has(op.id)) {
            launchApp(op.id as AppId);
            launchedAppsRef.current.add(op.id);
          }
        } else if (op.type === "close") {
          toggleApp(op.id as AppId);
          // Remove from launched apps so it can be launched again later
          launchedAppsRef.current.delete(op.id);
        }
      });

      // Clean the message content of markup
      return cleanAppControlMarkup(messageContent);
    },
    [launchApp, toggleApp]
  );


  // Process message content: handle app controls and urgent prefixes
  const processMessageContent = useCallback(
    (messageContent: string) => {
      // First handle app controls
      const processedContent = handleAppControls(messageContent);

      // The urgent prefix processing is separate from app controls
      // We don't clean it here as we want to preserve it for styling in the UI

      return processedContent;
    },
    [handleAppControls]
  );

  // Reset launched apps when leaving AI mode
  useEffect(() => {
    if (!isInAiMode) {
      launchedAppsRef.current.clear();
    }
  }, [isInAiMode]);

  // Memoize the AI response sound function to prevent dependency changes
  const playAiResponseSoundMemoized = useCallback(() => {
    playAiResponseSound();
  }, [playAiResponseSound]);

  // Watch for changes in the AI messages to update the terminal display
  useEffect(() => {
    if (!isInAiMode || aiMessages.length <= 1) return;

    const lastMessage = aiMessages[aiMessages.length - 1];
    if (lastMessage.role !== "assistant") return;

    const messageKey = `${lastMessage.id}-${JSON.stringify((lastMessage as any).parts ?? lastMessage.content)}`;
    if (messageKey === lastProcessedMessageIdRef.current) return;

    const parts = (lastMessage as any).parts as any[] | undefined;
    const lines: string[] = [];

    if (parts && parts.length > 0) {
      parts.forEach((part) => {
        if (part.type === "text") {
          const processed = processMessageContent(part.text);
          if (processed) lines.push(processed);
        } else if (part.type === "tool-invocation") {
          const invocation = part.toolInvocation as ToolInvocation;
          handleToolInvocation(invocation);
          const txt = formatToolInvocation(invocation);
          if (txt) lines.push(txt);
        }
      });
    } else {
      lines.push(processMessageContent(lastMessage.content));
    }

    const cleanedContent = lines.join("\n");
    if (isClearingTerminal) return;

    setCommandHistory((prev) => {
      const filteredHistory = prev.filter((item) => item.path !== "ai-thinking");
      const existingIndex = filteredHistory.findIndex(
        (item) => item.path === "ai-assistant" && item.messageId === lastMessage.id
      );

      if (existingIndex !== -1) {
        const existing = filteredHistory[existingIndex];
        if (existing.output === cleanedContent) return prev;

        const updated = [...filteredHistory];
        updated[existingIndex] = {
          command: "",
          output: cleanedContent,
          path: "ai-assistant",
          messageId: lastMessage.id,
        };
        return updated;
      }

      playAiResponseSoundMemoized();

      return [
        ...filteredHistory,
        { command: "", output: cleanedContent, path: "ai-assistant", messageId: lastMessage.id },
      ];
    });

    lastProcessedMessageIdRef.current = messageKey;
  }, [aiMessages, isInAiMode, isClearingTerminal, processMessageContent, playAiResponseSoundMemoized]);

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
    useTerminalStore.getState().addCommand(
      command.startsWith("ryo ") ? command : `ryo ${command}`
    );

    // Reset animated lines to ensure only new content gets animated
    setAnimatedLines(new Set());

    // If user types 'exit' or 'quit', leave AI mode
    if (lowerCommand === "exit" || lowerCommand === "quit") {
      track(TERMINAL_ANALYTICS.CHAT_EXIT);
      setIsInAiMode(false);
      stopAiResponse();
      setAiChatMessages([
        {
          id: "system",
          role: "system",
          content:
            "You are a coding assistant running in the terminal app on ryOS.",
        },
      ]);

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

      // Reset AI messages to just the system message
      setAiChatMessages([
        {
          id: "system",
          role: "system",
          content:
            "You are a coding assistant running in the terminal app on ryOS.",
        },
      ]);

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
            output:
              "chat cleared. you're still chatting with ryo. type 'exit' to return to terminal.",
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

    // Send the message using useChat hook
    appendAiMessage(
      { role: "user", content: command },
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
      console.error(`Error saving vim file: ${err.message || 'Unknown error'}`);
      
      // Show error in terminal
      setCommandHistory((prev) => [
        ...prev,
        {
          command: "",
          output: `Error saving file: ${err.message || 'Unknown error'}`,
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
        type: "spring",
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

  // Add a VimEditor component
  function VimEditor({
    file,
    position,
  }: {
    file: { name: string; content: string };
    position: number;
  }) {
    const lines = file.content.split("\n");
    const maxVisibleLines = 20; // Show up to 20 lines at a time

    // Get the visible lines based on the current position
    const visibleLines = lines.slice(position, position + maxVisibleLines);

    // Fill with empty lines if there are fewer lines than maxVisibleLines
    while (visibleLines.length < maxVisibleLines) {
      visibleLines.push("~");
    }

    // Calculate percentage through the file
    const percentage =
      lines.length > 0
        ? Math.min(
            100,
            Math.floor(((position + maxVisibleLines) / lines.length) * 100)
          )
        : 100;

    return (
      <div className="vim-editor font-monaco text-white">
        {visibleLines.map((line, i) => {
          const lineNumber = position + i;
          const isCursorLine = lineNumber === vimCursorLine;

          return (
            <div
              key={i}
              className={`vim-line flex ${isCursorLine ? "bg-white/10" : ""}`}
            >
              <span className="text-gray-500 w-6 text-right mr-2">
                {lineNumber + 1}
              </span>
              {isCursorLine ? (
                // Render line with cursor
                <span className="select-text flex-1">
                  {line.substring(0, vimCursorColumn)}
                  <span className="bg-orange-300 text-black">
                    {line.charAt(vimCursorColumn) || " "}
                  </span>
                  {line.substring(vimCursorColumn + 1)}
                </span>
              ) : (
                // Render line without cursor
                <span className="select-text flex-1">{line}</span>
              )}
            </div>
          );
        })}
        <div className="vim-status-bar flex text-white text-xs mt-2">
          <div
            className={`px-2 py-1 font-bold ${
              vimMode === "insert" ? "bg-green-600/50" : "bg-blue-600/50"
            }`}
          >
            {vimMode === "normal"
              ? "NORMAL"
              : vimMode === "insert"
              ? "INSERT"
              : "COMMAND"}
          </div>
          <div className="flex-1 bg-white/10 px-2 py-1 flex items-center justify-between">
            <span className="flex-1 mx-2">[{file.name}]</span>
            <span>{percentage}%</span>
            <span className="ml-4 mr-2">
              {vimCursorLine + 1}:{vimCursorColumn + 1}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Add a helper function to render the main terminal or vim editor
  const renderMainContent = () => {
    if (isInVimMode && vimFile) {
      return (
        <div className="mb-4">
          <VimEditor file={vimFile} position={vimPosition} />
          <div className="flex mt-1">
            <span className="text-green-400 mr-1">
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
              className={`flex-1 bg-transparent text-white focus:outline-none ${
                inputFocused ? "input--focused" : ""
              }`}
              style={{ fontSize: `${fontSize}px` }}
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
              layoutId={`terminal-line-${index}`}
              layout="preserve-aspect"
              transition={{
                type: "spring",
                duration: 0.3,
                stiffness: 100,
                damping: 25,
                mass: 0.8,
              }}
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
              {item.output && (
                <div
                  className={`ml-0 select-text ${
                    item.path === "ai-thinking" ? "text-gray-400" : ""
                  } ${item.path === "ai-assistant" ? "text-purple-100" : ""} ${
                    item.path === "ai-error" ? "text-red-400" : ""
                  } ${item.path === "welcome-message" ? "text-gray-400" : ""} ${
                    // Add urgent message styling
                    isUrgentMessage(item.output) ? "text-red-400" : ""
                  } ${
                    // Add system message styling
                    item.output.startsWith("ask ryo anything") ||
                    item.output.startsWith("usage:") ||
                    item.output.startsWith("command not found:") ||
                    item.output.includes("type 'help' for") ||
                    item.output.includes("no such") ||
                    item.output.includes("not implemented") ||
                    item.output.includes("already exists") ||
                    item.output.startsWith("file not found:") ||
                    item.output.startsWith("no files found")
                      ? "text-gray-400"
                      : ""
                  }`}
                >
                  {item.path === "ai-thinking" ? (
                    <div>
                      <span className="gradient-spin">
                        <span className="inline-block w-2 text-center">
                          {item.output.split(" ")[0]}
                        </span>{" "}
                        ryo
                      </span>
                      <span className="text-gray-500 italic shimmer-subtle">
                        {" is thinking"}
                        <AnimatedEllipsis />
                      </span>
                    </div>
                  ) : item.path === "ai-assistant" ? (
                    <motion.div
                      layout="position"
                      className="select-text cursor-text"
                      transition={{
                        type: "spring",
                        duration: 0.3,
                        stiffness: 100,
                        damping: 25,
                        mass: 0.8,
                      }}
                    >
                      {(() => {
                        // Process the message to extract HTML and text parts
                        const { htmlContent, textContent, hasHtml } =
                          extractHtmlContent(item.output);

                        // Check if this is an urgent message
                        const urgent = isUrgentMessage(item.output);
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
                            {/* Show only non-HTML text content with markdown parsing */}
                            {cleanedTextContent && (
                              <span
                                className={`select-text cursor-text ${
                                  urgent ? "text-red-300" : "text-purple-300"
                                }`}
                              >
                                {urgent && <UrgentMessageAnimation />}
                                {parseSimpleMarkdown(cleanedTextContent)}
                              </span>
                            )}

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
                          </>
                        );
                      })()}
                    </motion.div>
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
            className="flex transition-all duration-200 select-text"
          >
            {isInAiMode ? (
              <span className="text-purple-400 mr-2 whitespace-nowrap select-text cursor-text">
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
              <span className="text-green-400 mr-2 whitespace-nowrap select-text cursor-text">
                <span className="inline-block w-2 text-center">→</span>{" "}
                {currentPath === "/" ? "/" : currentPath}
              </span>
            )}
            <div className="flex-1 relative">
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
                className={`w-full text-white focus:outline-none bg-transparent ${
                  inputFocused ? "input--focused" : ""
                }`}
                style={{ fontSize: `${fontSize}px` }}
                autoFocus
              />
              {isAiLoading && isInAiMode && (
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none flex items-center">
                  <span className="text-gray-400/40 opacity-30 shimmer">
                    is thinking
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

  if (!isWindowOpen) return null;

  return (
    <>
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
      <WindowFrame
        appId="terminal"
        title="Terminal"
        onClose={onClose}
        isForeground={isForeground}
        transparentBackground={true}
        skipInitialSound={skipInitialSound}
      >
        <motion.div
          className="flex flex-col h-full w-full bg-black/80 backdrop-blur-lg text-white antialiased font-monaco p-2 overflow-hidden select-text"
          style={{
            fontSize: `${fontSize}px`,
            fontFamily:
              '"Monaco", "ArkPixel", "SerenityOS-Emoji", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace',
          }}
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
            className="flex-1 overflow-auto whitespace-pre-wrap select-text cursor-text"
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
        appName="Terminal"
        helpItems={helpItems || []}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={
          appMetadata || {
            name: "Terminal",
            version: "1.0",
            creator: {
              name: "Ryo",
              url: "https://github.com/ryokun6/ryos",
            },
            github: "https://github.com/ryokun6/ryos",
            icon: "/icons/terminal.png",
          }
        }
      />
    </>
  );
}
