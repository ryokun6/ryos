import { Message } from "ai";
import { Loader2, AlertCircle, MessageSquare, Copy, Check } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { useChatSynth } from "@/hooks/useChatSynth";

// Helper function to parse markdown and segment text
const parseMarkdown = (text: string): { type: string; content: string }[] => {
  const tokens: { type: string; content: string }[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    // Check for bold text (**text**)
    const boldMatch = text.slice(currentIndex).match(/^\*\*(.*?)\*\*/);
    if (boldMatch) {
      tokens.push({ type: "bold", content: boldMatch[1] });
      currentIndex += boldMatch[0].length;
      continue;
    }

    // Check for italic text (*text*)
    const italicMatch = text.slice(currentIndex).match(/^\*(.*?)\*/);
    if (italicMatch) {
      tokens.push({ type: "italic", content: italicMatch[1] });
      currentIndex += italicMatch[0].length;
      continue;
    }

    // Match CJK characters, emojis, words, spaces, or other characters
    const wordMatch = text
      .slice(currentIndex)
      .match(
        /^([\p{Emoji_Presentation}\p{Extended_Pictographic}]|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[a-zA-Z0-9]+|[^\S\n]+|[^a-zA-Z0-9\s\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}*]+)/u
      );

    if (wordMatch) {
      tokens.push({ type: "text", content: wordMatch[0] });
      currentIndex += wordMatch[0].length;
      continue;
    }

    // If no match found (shouldn't happen), move forward one character
    tokens.push({ type: "text", content: text[currentIndex] });
    currentIndex++;
  }

  return tokens;
};

// Helper function to segment text properly for CJK and emojis
const segmentText = (text: string): { type: string; content: string }[] => {
  // First split by line breaks to preserve them
  return text.split(/(\n)/).flatMap((segment) => {
    if (segment === "\n") return [{ type: "text", content: "\n" }];
    // Parse markdown and maintain word boundaries in the segment
    return parseMarkdown(segment);
  });
};

// Helper function to check if text contains only emojis
const isEmojiOnly = (text: string): boolean => {
  const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
  return emojiRegex.test(text);
};

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  error?: Error;
  onRetry?: () => void;
  onClear?: () => void;
}

export function ChatMessages({
  messages,
  isLoading,
  error,
  onRetry,
  onClear,
}: ChatMessagesProps) {
  const [scrollLockedToBottom, setScrollLockedToBottom] = useState(true);
  const viewportRef = useRef<HTMLElement | null>(null);
  const { playNote } = useChatSynth();
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const previousMessagesLength = useRef(messages.length);
  const hasScrolled = useRef(false);
  const wasAtBottom = useRef(true);

  const copyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(
        message.id || `${message.role}-${message.content.substring(0, 10)}`
      );
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy message:", err);
      // Fallback to older method if clipboard API fails
      try {
        const textarea = document.createElement("textarea");
        textarea.value = message.content;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);

        setCopiedMessageId(
          message.id || `${message.role}-${message.content.substring(0, 10)}`
        );
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch (fallbackErr) {
        console.error("Fallback copy failed:", fallbackErr);
      }
    }
  };

  const scrollToBottom = useCallback((viewport: HTMLElement) => {
    viewport.scrollTop = viewport.scrollHeight;
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const viewport = e.currentTarget.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement;
    if (!viewport) return;

    hasScrolled.current = true;
    const isAtBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 10;

    // If we were at bottom and scrolled up, unlock
    if (wasAtBottom.current && !isAtBottom) {
      setScrollLockedToBottom(false);
    }
    // If we're at bottom, lock and remember we were at bottom
    if (isAtBottom) {
      setScrollLockedToBottom(true);
      wasAtBottom.current = true;
    }
  };

  // Initial scroll to bottom and handle new messages
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Always scroll to bottom on initial load
    if (!hasScrolled.current) {
      scrollToBottom(viewport);
      return;
    }

    // For subsequent updates, only scroll if locked to bottom
    if (scrollLockedToBottom) {
      scrollToBottom(viewport);
    }

    previousMessagesLength.current = messages.length;
  }, [messages, isLoading, scrollLockedToBottom, scrollToBottom]);

  const isUrgentMessage = (content: string) => content.startsWith("!!!!");

  return (
    <ScrollArea
      className="flex-1 bg-white border-2 border-gray-800 rounded mb-2 p-2 h-full w-full"
      onScroll={handleScroll}
      ref={(ref) => {
        const viewport = ref?.querySelector(
          "[data-radix-scroll-area-viewport]"
        ) as HTMLElement;
        viewportRef.current = viewport;
      }}
    >
      <AnimatePresence initial={false} mode="sync">
        <motion.div
          layout="position"
          className="flex flex-col gap-1"
          transition={{
            layout: {
              type: "spring",
              bounce: 0.1415,
              duration: 1,
            },
          }}
        >
          {messages.map((message) => (
            <motion.div
              key={
                message.id ||
                `${message.role}-${message.content.substring(0, 10)}`
              }
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className={`flex flex-col z-10 ${
                message.role === "user" ? "items-end" : "items-start"
              }`}
              style={{
                transformOrigin:
                  message.role === "user" ? "bottom right" : "bottom left",
              }}
              onMouseEnter={() =>
                setHoveredMessageId(
                  message.id ||
                    `${message.role}-${message.content.substring(0, 10)}`
                )
              }
              onMouseLeave={() => setHoveredMessageId(null)}
            >
              <div className="text-[16px] text-gray-500 mb-0.5 font-['Geneva-9'] mb-[-2px] select-text flex items-center gap-2">
                {message.role === "user" && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity:
                        hoveredMessageId ===
                        (message.id ||
                          `${message.role}-${message.content.substring(0, 10)}`)
                          ? 1
                          : 0,
                      scale: 1,
                    }}
                    className="h-3 w-3 text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => copyMessage(message)}
                  >
                    {copiedMessageId ===
                    (message.id ||
                      `${message.role}-${message.content.substring(0, 10)}`) ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </motion.button>
                )}
                {message.role === "user" ? "You" : "Ryo"}{" "}
                <span className="text-gray-400 select-text">
                  {message.createdAt ? (
                    new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                </span>
                {message.role === "assistant" && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{
                      opacity:
                        hoveredMessageId ===
                        (message.id ||
                          `${message.role}-${message.content.substring(0, 10)}`)
                          ? 1
                          : 0,
                      scale: 1,
                    }}
                    className="h-3 w-3 text-gray-400 hover:text-gray-600 transition-colors"
                    onClick={() => copyMessage(message)}
                  >
                    {copiedMessageId ===
                    (message.id ||
                      `${message.role}-${message.content.substring(0, 10)}`) ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </motion.button>
                )}
              </div>

              <motion.div
                layout="position"
                initial={{
                  backgroundColor:
                    message.role === "user" ? "#fef08a" : "#bfdbfe",
                  color: "#000000",
                }}
                animate={
                  isUrgentMessage(message.content)
                    ? {
                        backgroundColor: [
                          "#fecaca",
                          message.role === "user" ? "#fef08a" : "#bfdbfe",
                        ],
                        color: ["#ef4444", "#000000"],
                        transition: {
                          duration: 1,
                          repeat: 1,
                          repeatType: "reverse",
                          ease: "easeInOut",
                        },
                      }
                    : {}
                }
                className={`max-w-[90%] min-h-[12px] p-1.5 px-2 rounded leading-snug text-[12px] font-geneva-12 break-words select-text ${
                  message.role === "user"
                    ? "bg-yellow-200 text-black"
                    : "bg-blue-200 text-black"
                }`}
              >
                {message.role === "assistant" ? (
                  <motion.div
                    layout="position"
                    className="select-text whitespace-pre-wrap"
                  >
                    {(() => {
                      // Check for XML tags and their completeness
                      const hasXmlTags =
                        /<textedit:(insert|replace|delete)/i.test(
                          message.content
                        );
                      if (hasXmlTags) {
                        // Count opening and closing tags
                        const openTags = (
                          message.content.match(
                            /<textedit:(insert|replace|delete)/g
                          ) || []
                        ).length;
                        const closeTags = (
                          message.content.match(
                            /<\/textedit:(insert|replace)>|<textedit:delete[^>]*\/>/g
                          ) || []
                        ).length;

                        // If tags are incomplete, show *editing*
                        if (openTags !== closeTags) {
                          return (
                            <motion.span
                              initial={{ opacity: 1 }}
                              animate={{ opacity: 1 }}
                              transition={{ duration: 0 }}
                              className="select-text italic"
                            >
                              editing...
                            </motion.span>
                          );
                        }
                      }

                      // Remove "!!!!" prefix and following space from urgent messages
                      const displayContent = isUrgentMessage(message.content)
                        ? message.content.slice(4).trimStart()
                        : message.content;

                      return segmentText(displayContent).map((segment, idx) => (
                        <motion.span
                          key={idx}
                          initial={
                            hasXmlTags
                              ? { opacity: 1, y: 0 }
                              : { opacity: 0, y: 12 }
                          }
                          animate={{ opacity: 1, y: 0 }}
                          className={`select-text ${
                            isEmojiOnly(message.content) ? "text-[24px]" : ""
                          } ${
                            segment.type === "bold"
                              ? "font-bold"
                              : segment.type === "italic"
                              ? "italic"
                              : ""
                          }`}
                          style={{ userSelect: "text" }}
                          transition={
                            hasXmlTags
                              ? { duration: 0 }
                              : {
                                  duration: 0.15,
                                  delay: idx * 0.05,
                                  ease: "easeOut",
                                  onComplete: () => {
                                    if (idx % 2 === 0) {
                                      playNote();
                                    }
                                  },
                                }
                          }
                        >
                          {segment.content}
                        </motion.span>
                      ));
                    })()}
                  </motion.div>
                ) : (
                  <span
                    className={`select-text whitespace-pre-wrap ${
                      isEmojiOnly(message.content) ? "text-[24px]" : ""
                    }`}
                    style={{ userSelect: "text" }}
                  >
                    {segmentText(message.content).map((segment, idx) => (
                      <span
                        key={idx}
                        className={
                          segment.type === "bold"
                            ? "font-bold"
                            : segment.type === "italic"
                            ? "italic"
                            : ""
                        }
                      >
                        {segment.content}
                      </span>
                    ))}
                  </span>
                )}
              </motion.div>
            </motion.div>
          ))}
          {isLoading && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 text-gray-500 font-['Geneva-9'] text-[16px] antialiased h-[12px] z-1"
              style={{ transformOrigin: "bottom left" }}
            >
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking...
            </motion.div>
          )}
          {error && (
            <motion.div
              layout
              className="flex items-center gap-2 text-red-600 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
            >
              <AlertCircle className="h-3 w-3" />
              <span>{error.message}</span>
              {onRetry && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={onRetry}
                  className="m-0 p-0 text-[16px] h-0 text-amber-600"
                >
                  Try again
                </Button>
              )}
            </motion.div>
          )}
          {messages.length > 25 && (
            <motion.div
              layout
              className="flex items-center gap-2 text-gray-500 font-['Geneva-9'] text-[16px] antialiased h-[12px]"
            >
              <MessageSquare className="h-3 w-3" />
              <span>Start a new conversation?</span>
              {onClear && (
                <Button
                  size="sm"
                  variant="link"
                  onClick={onClear}
                  className="m-0 p-0 text-[16px] h-0 text-gray-500 hover:text-gray-700"
                >
                  New chat
                </Button>
              )}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </ScrollArea>
  );
}
