import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { Maximize, Minimize, Copy, Check, Save, Code, GripVertical, Plus } from "lucide-react";
import { createPortal } from "react-dom";
import * as shiki from "shiki";
import {
  loadHtmlPreviewSplit,
  saveHtmlPreviewSplit,
} from "../../utils/storage";
import { useSound, Sounds } from "../../hooks/useSound";

// Create a singleton highlighter instance
let highlighterPromise: Promise<shiki.Highlighter> | null = null;

const getHighlighterInstance = () => {
  if (!highlighterPromise) {
    highlighterPromise = shiki.createHighlighter({
      themes: ["github-dark"],
      langs: ["html"],
    });
  }
  return highlighterPromise;
};

// Check if a string is a HTML code block
export const isHtmlCodeBlock = (
  text: string
): { isHtml: boolean; content: string } => {
  // Check for markdown code blocks with html tag
  const codeBlockRegex = /```(?:html)?\s*([\s\S]*?)```/;
  const match = text.match(codeBlockRegex);

  if (match && match[1]) {
    const content = match[1].trim();
    // Check if content appears to be HTML (starts with a tag or has HTML elements)
    if (content.startsWith("<") || /<\/?[a-z][\s\S]*>/i.test(content)) {
      return { isHtml: true, content };
    }
  }

  // Also check for HTML content outside of code blocks
  const trimmedText = text.trim();
  if (
    trimmedText.startsWith("<") &&
    (/<\/[a-z][^>]*>/i.test(trimmedText) || // Has a closing tag
      /<[a-z][^>]*\/>/i.test(trimmedText) || // Has a self-closing tag
      trimmedText.includes("<style>") ||
      trimmedText.includes("<div>") ||
      trimmedText.includes("<span>"))
  ) {
    return { isHtml: true, content: trimmedText };
  }

  return { isHtml: false, content: "" };
};

// Extract HTML content even if the code block is incomplete/being streamed
export const extractHtmlContent = (
  text: string
): {
  htmlContent: string;
  textContent: string;
  hasHtml: boolean;
} => {
  // Check for complete HTML code blocks
  const completeRegex = /```(?:html)?\s*([\s\S]*?)```/g;
  let processedText = text;
  const htmlParts: string[] = [];
  let match;
  let hasHtml = false;

  // First check for complete HTML blocks
  while ((match = completeRegex.exec(text)) !== null) {
    const content = match[1].trim();
    if (
      content &&
      (content.startsWith("<") || /<\/?[a-z][\s\S]*>/i.test(content))
    ) {
      htmlParts.push(content);
      hasHtml = true;
      // Remove complete HTML blocks from text
      processedText = processedText.replace(match[0], "");
    }
  }

  // Then check for incomplete HTML blocks that are still streaming
  const incompleteRegex = /```(?:html)?\s*([\s\S]*?)$/;
  const incompleteMatch = processedText.match(incompleteRegex);

  if (
    incompleteMatch &&
    incompleteMatch[1] &&
    (incompleteMatch[1].trim().startsWith("<") ||
      /<\/?[a-z][\s\S]*>/i.test(incompleteMatch[1].trim()))
  ) {
    htmlParts.push(incompleteMatch[1].trim());
    hasHtml = true;
    // Remove incomplete HTML block from text
    processedText = processedText.replace(incompleteMatch[0], "");
  }

  // Check for standalone HTML content outside of code blocks
  const trimmedText = processedText.trim();
  if (
    !hasHtml &&
    trimmedText.startsWith("<") &&
    (/<\/[a-z][^>]*>/i.test(trimmedText) || // Has a closing tag
      /<[a-z][^>]*\/>/i.test(trimmedText) || // Has a self-closing tag
      trimmedText.includes("<style>") ||
      trimmedText.includes("<div>") ||
      trimmedText.includes("<span>"))
  ) {
    htmlParts.push(trimmedText);
    hasHtml = true;
    processedText = "";
  }

  // Join all HTML parts
  const htmlContent = htmlParts.join("\n\n");

  return {
    htmlContent,
    textContent: processedText,
    hasHtml,
  };
};

// Component to render ryOS Code Previews
interface HtmlPreviewProps {
  htmlContent: string;
  onInteractionChange?: (isInteracting: boolean) => void;
  isStreaming?: boolean;
  maxHeight?: number | string;
  minHeight?: number | string;
  initialFullScreen?: boolean;
  className?: string;
  playElevatorMusic?: () => void;
  stopElevatorMusic?: () => void;
  playDingSound?: () => void;
  maximizeSound?: { play: () => void };
  minimizeSound?: { play: () => void };
  isInternetExplorer?: boolean;
}

export default function HtmlPreview({
  htmlContent,
  onInteractionChange,
  isStreaming = false,
  maxHeight = "800px",
  minHeight = "200px",
  initialFullScreen = false,
  className = "",
  playElevatorMusic,
  stopElevatorMusic,
  playDingSound,
  maximizeSound: propMaximizeSound,
  minimizeSound: propMinimizeSound,
  isInternetExplorer = false,
}: HtmlPreviewProps) {
  const [isFullScreen, setIsFullScreen] = useState(initialFullScreen);
  const [copySuccess, setCopySuccess] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [isSplitView, setIsSplitView] = useState(loadHtmlPreviewSplit());
  const [highlightedCode, setHighlightedCode] = useState("");
  const [originalHeight, setOriginalHeight] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const wasDragging = useRef(false);
  const lastDragEndTime = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fullscreenIframeRef = useRef<HTMLIFrameElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const fullscreenWrapperRef = useRef<HTMLDivElement>(null);
  const iframeId = useRef(
    `iframe-${Math.random().toString(36).substring(2, 9)}`
  ).current;
  const prevStreamingRef = useRef(isStreaming);
  const contentTimestamp = useRef(Date.now());
  const dragControls = useDragControls();
  // Ref to store the final processed HTML content after streaming
  const finalProcessedHtmlRef = useRef<string | null>(null);
  const [streamPreviewHtml, setStreamPreviewHtml] = useState<string>(""); // NEW state to hold live HTML preview during streaming
  const lastStreamRenderRef = useRef<number>(0); // To throttle updates

  // Add sound hooks - fallback to local sound hooks if props not provided
  const localMaximizeSound = useSound(Sounds.WINDOW_EXPAND);
  const localMinimizeSound = useSound(Sounds.WINDOW_COLLAPSE);
  
  // Use prop sounds if provided, otherwise use local sounds
  const maximizeSound = propMaximizeSound || localMaximizeSound;
  const minimizeSound = propMinimizeSound || localMinimizeSound;

  // Save split view state when it changes
  useEffect(() => {
    saveHtmlPreviewSplit(isSplitView);
  }, [isSplitView]);

  // Capture the original height when toggling fullscreen
  useEffect(() => {
    if (isFullScreen && previewRef.current && !originalHeight) {
      // Store the current height of the element before going fullscreen
      const height = `${previewRef.current.offsetHeight}px`;
      setOriginalHeight(height);
    }
  }, [isFullScreen, originalHeight]);

  // Check for mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => {
      window.removeEventListener("resize", checkMobile);
    };
  }, []);

  // Listen for ESC key to exit fullscreen
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullScreen) {
        minimizeSound.play();
        setIsFullScreen(false);
      }
    };

    if (isFullScreen) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isFullScreen, minimizeSound]);

  // Enhanced processedHtmlContent with timestamp to force fresh execution
  const processedHtmlContent = (() => {
    // Add a timestamp comment to force the browser to treat this as new content
    const timestamp = `<!-- ts=${contentTimestamp.current} -->`;

    // Define the script tags and styles that should be added ONLY after streaming
    // Note: Tailwind is added via CDN in this version.
    const postStreamHeadContent = `
  <link rel="stylesheet" href="/fonts/fonts.css">
  <script type="module" src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.174.0/three.module.min.js"></script>
  <script src="https://cdn.tailwindcss.com/3.4.16"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ["Geneva-12", "ArkPixel", "SerenityOS-Emoji", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"],
            serif: ["AppleGaramond", "Georgia", "Palatino", "serif"],
            mono: ["Geneva-12", "ArkPixel", "SerenityOS-Emoji", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"]
          }
        }
      }
    }
  </script>
  <style>
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      overflow-x: auto; /* Allow horizontal scroll if content overflows */
      width: 100%;
      height: 100%;
      max-width: 100%; /* Prevent body from exceeding viewport width */
    }
    /* Ensure pre doesn't break layout */
    pre {
      white-space: pre-wrap; /* Allow wrapping */
      word-break: break-all; /* Break long words */
    }
  </style>
`;

    // REMOVED: Blur effect is no longer applied
    // const blurStyle = `
    // <style>
    //   body {
    //     transition: filter 0.5s ease-out;
    //     ${isStreaming ? "filter: blur(2px);" : "filter: blur(0px);"}
    //   }
    // </style>`;

    // Common base structure
    const baseHtmlStart = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
`; // Removed blurStyle from here
    const baseHtmlEnd = `
</head>
<body>
  ${htmlContent}
</body>
</html>`;

    // If the provided content is already a full HTML document, inject carefully
    if (
      htmlContent.includes("<!DOCTYPE html>") ||
      htmlContent.includes("<html")
    ) {
        let modifiedContent = timestamp + htmlContent;
        // Inject post-stream content into head
        // Removed blurStyle injection
        if (modifiedContent.includes("</head>")) {
            modifiedContent = modifiedContent.replace("</head>", `${postStreamHeadContent}</head>`);
        } else if (modifiedContent.includes("<body")) {
             modifiedContent = modifiedContent.replace("<body", `<head>${postStreamHeadContent}</head><body`);
        } else if (modifiedContent.includes("<html>")) {
            // Fallback if no head or body tag found but html tag exists
             modifiedContent = modifiedContent.replace("<html>", `<html><head>${postStreamHeadContent}</head>`);
        } else {
            // Add head if no html tag found (very unlikely)
            modifiedContent = `<head>${postStreamHeadContent}</head>` + modifiedContent;
        }
        return modifiedContent;
    }

    // For partial HTML content, construct the document
    const headContent = postStreamHeadContent; // Always include post-stream content

    return `${timestamp}${baseHtmlStart}${headContent}${baseHtmlEnd}`;
  })();

  // Function to update iframe content (now only called after streaming)
  const updateIframeContent = (finalContent: string) => {
    requestAnimationFrame(() => {
      // Update inline iframe
      if (iframeRef.current) {
        iframeRef.current.srcdoc = finalContent;
      }

      // Update fullscreen iframe if it exists
      if (fullscreenIframeRef.current) {
        fullscreenIframeRef.current.srcdoc = finalContent;
      }
    });
  };

  // NEW: Effect to update iframe *after* streaming finishes or when content changes while not streaming
  useEffect(() => {
    if (!isStreaming) {
      // Generate the final content ONLY when needed
      const finalContent = processedHtmlContent;
      finalProcessedHtmlRef.current = finalContent; // Store for fullscreen/code view
      updateIframeContent(finalContent);
    }
    // Dependency: htmlContent ensures update if content changes *after* streaming
    // Dependency: isStreaming ensures update when streaming stops
  }, [isStreaming, htmlContent]);

  // Initialize syntax highlighting only when code view is active
  useEffect(() => {
    let isMounted = true;

    const highlight = async () => {
      try {
        const highlighter = await getHighlighterInstance();
        // Use the stored final HTML content for highlighting
        const contentToHighlight = finalProcessedHtmlRef.current || processedHtmlContent;
        if (isMounted && contentToHighlight) {
          const highlighted = highlighter.codeToHtml(contentToHighlight, {
            lang: "html",
            theme: "github-dark",
          });
          setHighlightedCode(highlighted);
        }
      } catch (error) {
        console.error("Failed to highlight code:", error);
      }
    };

    // Only initialize Shiki and highlight code when code view is active
    // Reset highlightedCode if showCode becomes false
    if (showCode) {
        if (!highlightedCode) {
            highlight();
        }
    } else {
        setHighlightedCode(""); // Clear when code view is hidden
    }

    return () => {
      isMounted = false;
    };
  }, [showCode, finalProcessedHtmlRef.current]); // Depend on showCode and the final content ref

  // Play elevator music when streaming starts, stop when streaming ends
  useEffect(() => {
    if (isStreaming && playElevatorMusic) {
      playElevatorMusic();
    } else if (prevStreamingRef.current && !isStreaming) {
      // If we were streaming but now we're not, stop music and play ding
      if (stopElevatorMusic) {
        stopElevatorMusic();
      }
      if (playDingSound) {
        playDingSound();
      }
    }

    prevStreamingRef.current = isStreaming;

    // Clean up on unmount
    return () => {
      if (stopElevatorMusic) {
        stopElevatorMusic();
      }
    };
  }, [isStreaming, playElevatorMusic, stopElevatorMusic, playDingSound]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(htmlContent);
      setCopySuccess(true);

      // Reset after 2 seconds
      setTimeout(() => {
        setCopySuccess(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };

  const handleSaveToDisk = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blob = new Blob([processedHtmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .substring(0, 19);
    a.href = url;
    a.download = `ryOS-generated-${timestamp}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleFullScreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isFullScreen) {
      maximizeSound.play();
      // Ensure content is updated when going fullscreen
      const finalContent = finalProcessedHtmlRef.current || processedHtmlContent;
      updateIframeContent(finalContent);
    } else {
      minimizeSound.play();
    }
    setIsFullScreen(!isFullScreen);
  };

  // Add effect to update fullscreen content when it changes
  useEffect(() => {
    if (isFullScreen && !isStreaming) {
      const finalContent = finalProcessedHtmlRef.current || processedHtmlContent;
      updateIframeContent(finalContent);
    }
  }, [isFullScreen, isStreaming, processedHtmlContent]);

  // Document-level mouse move handler
  const handleDocumentMouseMove = (e: MouseEvent) => {
    const deltaX = Math.abs(e.clientX - lastDragEndTime.current);
    const deltaY = Math.abs(e.clientY - lastDragEndTime.current);
    
    if (deltaX > 5 || deltaY > 5) {
      setIsDragging(true);
      wasDragging.current = true;
    }
  };
  
  // Document-level touch move handler
  const handleDocumentTouchMove = (e: TouchEvent) => {
    if (!e.touches[0]) return;
    
    const deltaX = Math.abs(e.touches[0].clientX - lastDragEndTime.current);
    const deltaY = Math.abs(e.touches[0].clientY - lastDragEndTime.current);
    
    if (deltaX > 5 || deltaY > 5) {
      wasDragging.current = true;
    }
  };
  
  // Document-level mouse up handler
  const handleDocumentMouseUp = () => {
    cleanup();
  };
  
  // Document-level touch end handler
  const handleDocumentTouchUp = () => {
    cleanup();
  };
  
  // Clean up all handlers
  const cleanup = () => {
    document.removeEventListener('mousemove', handleDocumentMouseMove);
    document.removeEventListener('touchmove', handleDocumentTouchMove);
    document.removeEventListener('mouseup', handleDocumentMouseUp);
    document.removeEventListener('touchend', handleDocumentTouchUp);
    
    // Reset dragging state after cooldown
    setTimeout(() => {
      setIsDragging(false);
    }, 150);
  };

  // Function to handle toolbar toggle
  const toggleToolbarCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!isDragging) {
      setIsToolbarCollapsed(!isToolbarCollapsed);
      if (!isToolbarCollapsed) {
        minimizeSound.play();
      } else {
        maximizeSound.play();
      }
    }
  };
  
  // Handle direct click on plus icon (when collapsed)
  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsToolbarCollapsed(false);
    maximizeSound.play();
  };

  // NEW: Function to sanitize HTML for stream preview - removing fixed position elements
  const sanitizeHtmlForStream = (html: string): string => {
    if (!html) return html;
    
    // Remove inline position:fixed styles
    let sanitized = html.replace(/position\s*:\s*fixed/gi, "position: relative");
    sanitized = sanitized.replace(/position\s*:\s*sticky/gi, "position: relative");
    
    // Handle Tailwind classes - convert fixed/sticky to relative
    const processTailwindClasses = (classStr: string): string => {
      const classes = classStr.split(/\s+/);
      return classes.map(cls => {
        // Replace standalone fixed/sticky classes
        if (cls === 'fixed') return 'relative';
        if (cls === 'sticky') return 'relative';
        
        // Remove specific positioning classes
        if (/^(top|bottom|left|right|inset)(-|$)/.test(cls)) return '';
        
        // Keep all other classes unchanged
        return cls;
      }).filter(Boolean).join(' ');
    };
    
    // Process standard HTML class attributes
    sanitized = sanitized.replace(/class="([^"]*)"/gi, (_match, classContent) => {
      return `class="${processTailwindClasses(classContent)}"`;
    });
    
    // Process React className attributes
    sanitized = sanitized.replace(/className="([^"]*)"/gi, (_match, classContent) => {
      return `className="${processTailwindClasses(classContent)}"`;
    });
    
    // Handle inline styles
    sanitized = sanitized.replace(/(position\s*:\s*relative.*?)(top|left|right|bottom)\s*:\s*[^;]+/gi, '$1$2: auto');
    
    // Handle z-index in fixed elements that were converted
    sanitized = sanitized.replace(/z-index\s*:\s*\d+/gi, 'z-index: auto');
    
    return sanitized;
  };

  // NEW Effect: Update stream preview HTML with throttling while streaming
  useEffect(() => {
    if (isStreaming) {
      const now = Date.now();
      // Throttle updates to once every 500ms
      if (now - lastStreamRenderRef.current > 500) {
        lastStreamRenderRef.current = now;
        const { htmlContent: extracted } = extractHtmlContent(htmlContent);
        if (extracted) {
          // Apply sanitization to remove fixed positioning before setting stream preview
          const sanitizedHtml = sanitizeHtmlForStream(extracted);
          setStreamPreviewHtml(sanitizedHtml);
        }
      }
    } else {
      // Reset when not streaming
      setStreamPreviewHtml("");
    }
  }, [htmlContent, isStreaming]);

  // Normal inline display with optional maximized height
  return (
    <>
      <motion.div
        ref={previewRef}
        className={`${isInternetExplorer ? '' : 'rounded'} bg-white overflow-auto m-0 relative ${className} ${isStreaming ? 'loading-pulse' : ''}`}
        style={{
          maxHeight: isInternetExplorer ? "100%" : (isFullScreen ? originalHeight || minHeight : maxHeight),
          // pointerEvents: isStreaming ? "none" : "auto", // Allow interaction with text stream potentially
          opacity: isFullScreen ? 0 : 1,
          height: isInternetExplorer ? "100%" : (isFullScreen ? originalHeight || minHeight : "auto"),
          boxShadow: isInternetExplorer ? "none" : (isFullScreen ? "none" : "0 0 0 1px rgba(0, 0, 0, 0.3)"),
          visibility: isFullScreen ? "hidden" : "visible",
          minHeight: minHeight, // Ensure minHeight is respected
        }}
        animate={{
          opacity: isFullScreen ? 0 : 1,
        }}
        transition={{
          opacity: {
            duration: 0.3,
            ease: "easeInOut",
          },
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={() => !isStreaming && onInteractionChange?.(true)}
        onMouseLeave={() => !isStreaming && onInteractionChange?.(false)}
        tabIndex={-1}
      >
        {/* Loading PULSE overlay (kept for visual feedback) */}
        {isStreaming && (
          <div
            className="absolute inset-0 bg-gray-200 z-10 pointer-events-none"
            style={{ opacity: 0.2 }}
          >
            <motion.div
              className="w-full h-full bg-gray-400"
              animate={{
                opacity: [0.05, 0.2, 0.05]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </div>
        )}

        {!isInternetExplorer && (
          <motion.div
            className="flex justify-end p-1 absolute top-2 right-4 z-20"
            animate={{
              opacity: isStreaming ? 0 : 1, // Hide when streaming
            }}
            transition={{
              duration: 0.3,
            }}
            style={{
              pointerEvents: isStreaming ? "none" : "auto", // Disable interaction when streaming
            }}
          >
            <button
              onClick={handleSaveToDisk}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center w-6 h-6 hover:bg-black/10 rounded mr-1 group"
              aria-label="Save HTML to disk"
              disabled={isStreaming}
            >
              <Save
                size={16}
                className="text-neutral-400/50 group-hover:text-neutral-300"
              />
            </button>
            <button
              onClick={handleCopy}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center w-6 h-6 hover:bg-black/10 rounded mr-1 group"
              aria-label="Copy HTML code"
              disabled={isStreaming}
            >
              {copySuccess ? (
                <Check
                  size={16}
                  className="text-neutral-400/50 group-hover:text-neutral-300"
                />
              ) : (
                <Copy
                  size={16}
                  className="text-neutral-400/50 group-hover:text-neutral-300"
                />
              )}
            </button>
            <button
              onClick={toggleFullScreen}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex items-center justify-center w-6 h-6 hover:bg-black/10 rounded group"
              aria-label={isFullScreen ? "Minimize preview" : "Maximize preview"}
              disabled={isStreaming}
            >
              {isFullScreen ? (
                <Minimize
                  size={16}
                  className="text-neutral-400/50 group-hover:text-neutral-300"
                />
              ) : (
                <Maximize
                  size={16}
                  className="text-neutral-400/50 group-hover:text-neutral-300"
                />
              )}
            </button>
          </motion.div>
        )}
        {/* Conditional Rendering: Text Stream or Iframe */}
        {isStreaming ? (
          <div
            className="h-full w-full relative overflow-auto"
            style={{
              maxHeight: isInternetExplorer ? "100%" : (typeof minHeight === "string" ? minHeight : `${minHeight}px`),
            }}
          >
            {streamPreviewHtml ? (
              <div
                className="generated-html-stream font-geneva-12"
                dangerouslySetInnerHTML={{ __html: streamPreviewHtml }}
              />
            ) : (
              <pre className="p-2 text-xs font-geneva-12 text-gray-700 whitespace-pre-wrap break-words">
                {htmlContent.split('\n').slice(-8).join('\n')}
              </pre>
            )}
          </div>
        ) : (
          <motion.iframe
            ref={iframeRef}
            id={iframeId}
            // srcDoc is now set by useEffect after streaming finishes
            // srcDoc={processedHtmlContent()}
            title="ryOS Code Preview"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
            style={{
              height: isInternetExplorer ? "100%" : (typeof minHeight === "string" ? minHeight : `${minHeight}px`),
              display: "block",
              // pointerEvents: isStreaming ? "none" : "auto", // Already handled by parent div conditional
              position: "relative",
              zIndex: 1,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        )}
      </motion.div>

      {/* Fullscreen overlay */}
      {createPortal(
        <AnimatePresence mode="wait">
          {isFullScreen && (
            <motion.div
              className="fixed inset-0 z-[9999] flex flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => {
                minimizeSound.play();
                setIsFullScreen(false);
              }}
            >
              <motion.div
                className="absolute inset-0 flex flex-col"
                initial={{
                  y: "15%",
                  opacity: 0
                }}
                animate={{
                  y: 0,
                  opacity: 1
                }}
                exit={{
                  y: "15%",
                  opacity: 0
                }}
                transition={{
                  type: "spring",
                  stiffness: 250,
                  damping: 25,
                }}
              >
                <div 
                  ref={fullscreenWrapperRef}
                  className="relative w-full h-full overflow-hidden"
                >
                  {/* Code view layer - always 100% width underneath */}
                  <AnimatePresence>
                    {showCode ? (
                      <motion.div
                        key="code"
                        className="absolute inset-0 bg-[#24292e] font-geneva-12 overflow-auto p-4 z-10"
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: "12px" }}
                        dangerouslySetInnerHTML={{ __html: highlightedCode }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      />
                    ) : null}
                  </AnimatePresence>

                  {/* Preview iframe layer - positioned above code OR Text stream */}
                  <motion.div
                    className="absolute z-100 bg-white" // Added bg-white for text stream background
                    initial={false}
                    animate={{
                      width:
                        isSplitView && showCode
                          ? isMobile
                            ? "100%"
                            : "50%"
                          : "100%",
                      height:
                        isSplitView && showCode
                          ? isMobile
                            ? "50%"
                            : "100%"
                          : "100%",
                      right: 0,
                      opacity: showCode && !isSplitView ? 0 : 1,
                    }}
                    transition={{
                      duration: 0.3,
                      ease: [0.25, 0.1, 0.25, 1.0],
                    }}
                    style={{
                      position: "absolute",
                      top: showCode && isSplitView && isMobile ? "50%" : 0,
                      right: 0,
                      overflow: "hidden", // Clip content
                    }}
                  >
                    {/* Fullscreen Conditional Rendering: Text Stream or Iframe */}
                    {isStreaming ? (
                      <motion.div
                        className="h-full w-full overflow-auto"
                        initial={{ opacity: 0.8, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                      >
                        {streamPreviewHtml ? (
                          <div
                            className="generated-html-stream text-sm p-4"
                            dangerouslySetInnerHTML={{ __html: streamPreviewHtml }}
                          />
                        ) : (
                          <pre className="p-4 text-xs font-geneva-12 text-gray-700 whitespace-pre-wrap break-words">
                            {htmlContent.split('\n').slice(-15).join('\n')}
                          </pre>
                        )}
                      </motion.div>
                    ) : (
                      <iframe
                        ref={fullscreenIframeRef}
                        id={`fullscreen-${iframeId}`}
                        // srcDoc is now set by useEffect after streaming finishes
                        // srcDoc={processedHtmlContent()}
                        title="ryOS Code Preview Fullscreen"
                        className="border-0 bg-white w-full h-full"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          pointerEvents: isDragging ? "none" : "auto",
                          ...(isInternetExplorer && { position: 'absolute', inset: 0 })
                        }}
                      />
                    )}

                    {/* Loading PULSE overlay for fullscreen (kept for visual feedback) */}
                    {isStreaming && (
                      <div
                        className="absolute inset-0 bg-gray-100 z-10 pointer-events-none"
                        style={{ opacity: 0.2 }}
                      >
                        <motion.div
                          className="w-full h-full bg-gray-400"
                          animate={{
                            opacity: [0.05, 0.2, 0.05]
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                        />
                      </div>
                    )}
                  </motion.div>

                  {/* Toolbar - topmost layer */}
                  <motion.div 
                    ref={controlsRef}
                    className="absolute z-200"
                    initial={false}
                    drag
                    dragControls={dragControls}
                    dragConstraints={fullscreenWrapperRef}
                    dragElastic={0.2}
                    dragTransition={{ bounceStiffness: 600, bounceDamping: 20 }}
                    dragSnapToOrigin={false}
                    whileDrag={{ scale: 1.05 }}
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={() => {
                      // Set a short timeout to delay resetting isDragging
                      // This prevents click handlers from firing right after drag
                      if (clickTimerRef.current) {
                        clearTimeout(clickTimerRef.current);
                      }
                      
                      clickTimerRef.current = setTimeout(() => {
                        setIsDragging(false);
                      }, 100);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ top: 0, right: 0, padding: 16, minHeight: '40px', minWidth: '40px'}} // Default position: top-right
                  >
                    <motion.div 
                      className="bg-neutral-700/40 backdrop-blur-sm rounded-full overflow-hidden flex items-center justify-center gap-1"
                      layout
                      onClick={(e) => e.stopPropagation()}
                      initial={false}
                      animate={{
                        width: isToolbarCollapsed ? '40px' : 'auto',
                        height: isToolbarCollapsed ? '40px' : '40px',
                        padding: isToolbarCollapsed ? '0px' : '4px'
                      }}
                      transition={{ 
                        duration: 0.15,
                      }}
                    >
                      {/* Plus icon - only visible when collapsed */}
                      <motion.div
                        className="absolute w-[40px] h-[40px] flex items-center justify-center group hover:scale-110 transition-all duration-200"
                        initial={false}
                        animate={{
                          opacity: isToolbarCollapsed ? 1 : 0,
                        }}
                        transition={{ duration: 0.2 }}
                        style={{
                          pointerEvents: isToolbarCollapsed ? 'auto' : 'none',
                          cursor: 'pointer'
                        }}
                        onClick={handlePlusClick}
                      >
                        <Plus size={24} className="text-white/40 group-hover:text-white transition-all duration-200" />
                      </motion.div>

                      {/* Toolbar content - hidden when collapsed with zero width but still in DOM */}
                      <motion.div 
                        className="flex items-center justify-center"
                        initial={false}
                        animate={{
                          opacity: isToolbarCollapsed ? 0 : 1,
                          width: isToolbarCollapsed ? 40 : 'auto',
                        }}
                        transition={{ duration: 0.15 }}
                        style={{
                          pointerEvents: isToolbarCollapsed ? 'none' : 'auto',
                          overflow: 'hidden'
                        }}
                      >
                        <div 
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group cursor-move"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            dragControls.start(e);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleToolbarCollapse(e);
                          }}
                        >
                          <GripVertical 
                            size={18} 
                            className="text-white/70 group-hover:text-white"
                          />
                        </div>
                        
                        {showCode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsSplitView(!isSplitView);
                              if (!isSplitView) {
                                minimizeSound.play();
                              } else {
                                maximizeSound.play();
                              }
                            }}
                            className="flex items-center justify-center px-2 h-8 hover:bg-white/10 rounded-full group text-sm font-geneva-12"
                            aria-label="Toggle split view"
                          >
                            <span className="text-white/70 group-hover:text-white">
                              {isSplitView ? "Split" : "Full"}
                            </span>
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!showCode) {
                              setShowCode(true);
                              setIsSplitView(true);
                              maximizeSound.play();
                            } else {
                              setShowCode(false);
                              setIsSplitView(false);
                              minimizeSound.play();
                            }
                          }}
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group"
                          aria-label="Toggle code"
                        >
                          <Code
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                        <button
                          onClick={handleSaveToDisk}
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group"
                          aria-label="Save HTML to disk"
                        >
                          <Save
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                        <button
                          onClick={handleCopy}
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group"
                          aria-label="Copy HTML code"
                        >
                          {copySuccess ? (
                            <Check
                              size={20}
                              className="text-white/70 group-hover:text-white"
                            />
                          ) : (
                            <Copy
                              size={20}
                              className="text-white/70 group-hover:text-white"
                            />
                          )}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            minimizeSound.play();
                            setIsFullScreen(false);
                          }}
                          className="flex items-center justify-center w-8 h-8 hover:bg-white/10 rounded-full group"
                          aria-label="Exit fullscreen"
                        >
                          <Minimize
                            size={20}
                            className="text-white/70 group-hover:text-white"
                          />
                        </button>
                      </motion.div>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
