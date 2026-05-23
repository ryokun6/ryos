import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { AIChatMessage } from "@/types/chat";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { cleanTextForSpeech } from "../utils/textForSpeech";
import { getAssistantVisibleText } from "../utils/aiMessageText";

export interface ChatHighlightSegment {
  messageId: string;
  start: number;
  end: number;
}

interface UseChatSpeechSyncOptions {
  aiMessages: AIChatMessage[];
  currentMessages: UIMessage[];
  isLoading: boolean;
  speechEnabled: boolean;
}

export function useChatSpeechSync({
  aiMessages,
  currentMessages,
  isLoading,
  speechEnabled,
}: UseChatSpeechSyncOptions) {
  const speechProgressRef = useRef<Record<string, number>>({});
  const highlightQueueRef = useRef<ChatHighlightSegment[]>([]);
  const [highlightSegment, setHighlightSegment] =
    useState<ChatHighlightSegment | null>(null);
  const highlightSegmentRef = useRef<ChatHighlightSegment | null>(null);
  const { speak, stop: stopSpeech, isSpeaking } = useTtsQueue();

  const setCurrentHighlightSegment = useCallback(
    (segment: ChatHighlightSegment | null) => {
      highlightSegmentRef.current = segment;
      setHighlightSegment(segment);
    },
    []
  );

  useEffect(() => {
    aiMessages.forEach((msg) => {
      if (msg.role === "assistant") {
        const content = getAssistantVisibleText(msg);
        speechProgressRef.current[msg.id] = content.length;
      }
    });
  }, [aiMessages]);

  const enqueueHighlightSpeech = useCallback(
    (messageId: string, start: number, end: number, rawChunk: string) => {
      const cleaned = cleanTextForSpeech(rawChunk);
      if (!cleaned) {
        return;
      }

      const segment = { messageId, start, end };
      const shouldStartHighlight =
        highlightQueueRef.current.length === 0 && !highlightSegmentRef.current;
      highlightQueueRef.current.push(segment);

      if (shouldStartHighlight) {
        setTimeout(() => {
          if (highlightQueueRef.current[0] === segment) {
            setCurrentHighlightSegment(segment);
          }
        }, 80);
      }

      speak(cleaned, () => {
        const queueIndex = highlightQueueRef.current.indexOf(segment);
        if (queueIndex !== -1) {
          highlightQueueRef.current.splice(queueIndex, 1);
        }
        setCurrentHighlightSegment(highlightQueueRef.current[0] || null);
      });
    },
    [setCurrentHighlightSegment, speak]
  );

  const speakFinalAssistantMessage = useCallback(
    (message: UIMessage) => {
      if (!speechEnabled || message.role !== "assistant") {
        return;
      }

      const progress = speechProgressRef.current[message.id] ?? 0;
      const content = getAssistantVisibleText(message);
      if (progress >= content.length) {
        return;
      }

      enqueueHighlightSpeech(
        message.id,
        progress,
        content.length,
        content.slice(progress)
      );
      speechProgressRef.current[message.id] = content.length;
    },
    [enqueueHighlightSpeech, speechEnabled]
  );

  const resetSpeechState = useCallback(() => {
    stopSpeech();
    speechProgressRef.current = {};
    highlightQueueRef.current = [];
    setCurrentHighlightSegment(null);
  }, [setCurrentHighlightSegment, stopSpeech]);

  const markAssistantMessageProcessed = useCallback((message: UIMessage) => {
    if (message.role !== "assistant") {
      return;
    }
    speechProgressRef.current[message.id] =
      getAssistantVisibleText(message).length;
  }, []);

  useEffect(() => {
    if (!speechEnabled || !isLoading) {
      return;
    }

    const lastMsg = currentMessages.at(-1);
    if (!lastMsg || lastMsg.role !== "assistant") {
      return;
    }

    const content = getAssistantVisibleText(lastMsg);
    let scanPos =
      typeof speechProgressRef.current[lastMsg.id] === "number"
        ? (speechProgressRef.current[lastMsg.id] as number)
        : 0;

    if (scanPos >= content.length) {
      return;
    }

    while (scanPos < content.length) {
      const nextNlIdx = content.indexOf("\n", scanPos);
      if (nextNlIdx === -1) {
        break;
      }

      enqueueHighlightSpeech(
        lastMsg.id,
        scanPos,
        nextNlIdx,
        content.slice(scanPos, nextNlIdx)
      );

      scanPos = nextNlIdx + 1;
      if (content[scanPos] === "\r") {
        scanPos += 1;
      }
      speechProgressRef.current[lastMsg.id] = scanPos;
    }
  }, [currentMessages, enqueueHighlightSpeech, isLoading, speechEnabled]);

  return {
    highlightSegment,
    isSpeaking,
    markAssistantMessageProcessed,
    resetSpeechState,
    speakFinalAssistantMessage,
    stopSpeech,
  };
}
