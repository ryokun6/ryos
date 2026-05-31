import { useCallback, useEffect, useRef, useState } from "react";
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
import { filterUrlsForChatLinkPreviews } from "@/utils/cursorAgentDashboardUrl";
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

  let messageText = getMessageText(message);
  const isStaticGreeting = message.role === "assistant" && message.id === "1";
  if (isStaticGreeting && !messageText) {
    messageText = t("apps.chats.messages.greeting");
  }
  const showTypingDots = isLoadingGreeting && !isRoomView && isStaticGreeting;
  const isUrgent = isUrgentMessage(messageText);
  let bgColorClass = "";
  if (isUrgent) {
    bgColorClass = "bg-transparent text-current";
  } else if (message.role === "user")
    bgColorClass = "bg-yellow-100 text-black";
  else if (message.role === "assistant")
    bgColorClass = "bg-blue-100 text-black";
  else if (message.role === "human")
    bgColorClass = getUserColorClass(message.username);

  const rawContent = isUrgent ? messageText.slice(4).trimStart() : messageText;
  const decodedContent = decodeHtmlEntities(rawContent);
  const hasAquariumToken = decodedContent.includes("[[AQUARIUM]]");
  const displayContent = decodedContent.replace(/\[\[AQUARIUM\]\]/g, "").trim();
  const activeHighlight =
    !isStreamingMessage &&
    message.role === "assistant" &&
    highlightSegment?.messageId === message.id
      ? highlightSegment
      : null;

  const fullAssistantSource =
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
      : "";

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

  const linkPreviewUrls = (() => {
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
    return filterUrlsForChatLinkPreviews(allUrls);
  })();

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
