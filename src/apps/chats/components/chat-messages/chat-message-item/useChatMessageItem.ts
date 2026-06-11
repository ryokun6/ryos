import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ToolInvocationPart } from "@/components/shared/ToolInvocationMessage";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import { getVisibleTextPartText } from "../../../utils/aiMessageText";
import {
  applyTtsHighlight,
  clearTtsHighlight,
} from "../../../utils/ttsHighlight";
import type { ChatMessageItemProps } from "../types";
import {
  getMessageText,
  getUserColorClass,
  isUrgentMessage,
} from "../utils";
import { extractUrlsFromContent } from "./utils";

export type ChatMessageItemViewModel = ReturnType<typeof useChatMessageItem>;

export function useChatMessageItem(props: ChatMessageItemProps) {
  const { t } = useTranslation();
  const {
    message,
    isStreamingMessage,
    isLoadingGreeting,
    isRoomView,
    highlightSegment,
    playNote,
  } = props;

  const [isHovered, setIsHovered] = useState(false);
  const [isInteractingWithPreview, setIsInteractingWithPreview] =
    useState(false);

  const playNoteRef = useRef(playNote);
  useEffect(() => {
    playNoteRef.current = playNote;
  }, [playNote]);

  const animationCountRef = useRef(0);
  const handleStreamdownAnimationStart = useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.dataset || target.dataset.sdAnimate === undefined) {
        return;
      }
      animationCountRef.current += 1;
      if (animationCountRef.current % 2 !== 0) {
        return;
      }
      try {
        playNoteRef.current();
      } catch {
        // useChatSynth handles audio context errors internally
      }
    },
    []
  );

  const isStaticGreeting = message.role === "assistant" && message.id === "1";
  const showTypingDots = isLoadingGreeting && !isRoomView && isStaticGreeting;

  // Message objects are referentially stable across renders (only the
  // streaming message gets a new reference per tick), so memoizing on
  // `message` means the decode / markdown-tokenize passes below don't re-run
  // on unrelated re-renders (hover state, sibling streaming, etc.).
  const { isUrgent, decodedContent } = useMemo(() => {
    let text = getMessageText(message);
    if (isStaticGreeting && !text) {
      text = t("apps.chats.messages.greeting");
    }
    const urgent = isUrgentMessage(text);
    const raw = urgent ? text.slice(4).trimStart() : text;
    return {
      isUrgent: urgent,
      decodedContent: decodeHtmlEntities(raw),
    };
  }, [message, isStaticGreeting, t]);

  let bgColorClass = "";
  if (isUrgent) {
    bgColorClass = "bg-transparent text-current";
  } else if (message.role === "user")
    bgColorClass = "bg-yellow-100 text-black";
  else if (message.role === "assistant")
    bgColorClass = "bg-blue-100 text-black";
  else if (message.role === "human")
    bgColorClass = getUserColorClass(message.username);

  const hasAquariumToken = decodedContent.includes("[[AQUARIUM]]");
  const displayContent = useMemo(
    () => decodedContent.replace(/\[\[AQUARIUM\]\]/g, "").trim(),
    [decodedContent]
  );
  const activeHighlight =
    !isStreamingMessage &&
    message.role === "assistant" &&
    highlightSegment?.messageId === message.id
      ? highlightSegment
      : null;

  const fullAssistantSource = useMemo(
    () =>
      message.role === "assistant" && message.parts
        ? message.parts.reduce((acc, part) => {
            if (part.type === "text") {
              return (
                acc +
                decodeHtmlEntities(
                  getVisibleTextPartText(
                    (part as { type: string; text?: string }).text ||
                      (isStaticGreeting
                        ? t("apps.chats.messages.greeting")
                        : "")
                  )
                )
              );
            }
            return acc;
          }, "")
        : "",
    [message, isStaticGreeting, t]
  );

  const assistantContentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!activeHighlight || !fullAssistantSource) {
      return;
    }
    const container = assistantContentRef.current;
    if (!container) return;
    const start = Math.max(
      0,
      Math.min(activeHighlight.start, fullAssistantSource.length)
    );
    const end = Math.max(
      start,
      Math.min(activeHighlight.end, fullAssistantSource.length)
    );
    const prefix = fullAssistantSource.slice(0, start);
    const target = fullAssistantSource.slice(start, end);
    const ownerToken = applyTtsHighlight(container, target, prefix);
    return () => {
      clearTtsHighlight(ownerToken);
    };
  }, [activeHighlight, fullAssistantSource]);

  let hasAquarium = false;
  if (message.role === "assistant" && message.parts) {
    const aquariumParts = message.parts.filter(
      (p: ToolInvocationPart | { type: string }) => p.type === "tool-aquarium"
    );
    hasAquarium = aquariumParts.length > 0;
  }
  if (
    (message.role === "human" || message.username === "ryo") &&
    hasAquariumToken
  ) {
    hasAquarium = true;
  }

  const linkPreviewUrls = useMemo(() => {
    const allUrls = new Set<string>();
    if (message.role === "assistant") {
      message.parts?.forEach(
        (part: ToolInvocationPart | { type: string; text?: string }) => {
          if (part.type === "text") {
            const partText =
              (part as { type: string; text?: string }).text || "";
            const partContent = isUrgentMessage(partText)
              ? partText.slice(4).trimStart()
              : partText;
            extractUrlsFromContent(decodeHtmlEntities(partContent)).forEach(
              (u) => allUrls.add(u)
            );
          }
        }
      );
    } else {
      extractUrlsFromContent(displayContent).forEach((u) => allUrls.add(u));
    }
    return Array.from(allUrls);
  }, [message, displayContent]);

  return {
    ...props,
    t,
    isStaticGreeting,
    showTypingDots,
    isUrgent,
    bgColorClass,
    displayContent,
    activeHighlight,
    fullAssistantSource,
    hasAquarium,
    linkPreviewUrls,
    isHovered,
    setIsHovered,
    isInteractingWithPreview,
    setIsInteractingWithPreview,
    assistantContentRef,
    handleStreamdownAnimationStart,
  };
}
