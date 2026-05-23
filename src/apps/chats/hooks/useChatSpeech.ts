import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "@ai-sdk/react";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { cleanTextForSpeech } from "../utils/textForSpeech";
import { getAssistantVisibleText } from "../utils/messageText";

export type ChatHighlightSegment = {
  messageId: string;
  start: number;
  end: number;
};

export type ChatSpeechControls = {
  highlightSegment: ChatHighlightSegment | null;
  isSpeaking: boolean;
  speakText: (
    text: string,
    onEnd?: () => void,
    highlight?: ChatHighlightSegment
  ) => void;
  stopSpeech: () => void;
  speakFinalMessage: (message: UIMessage) => void;
  resetSpeech: (initialMessage?: UIMessage) => void;
};

export function useChatSpeech({
  aiMessages,
  currentMessages,
  isLoading,
  speechEnabled,
}: {
  aiMessages: UIMessage[];
  currentMessages: UIMessage[];
  isLoading: boolean;
  speechEnabled: boolean;
}): ChatSpeechControls {
  const speechProgressRef = useRef<Record<string, number>>({});
  const highlightQueueRef = useRef<ChatHighlightSegment[]>([]);
  const initializedHistoryRef = useRef(false);
  const [highlightSegment, setHighlightSegment] =
    useState<ChatHighlightSegment | null>(null);
  const highlightSegmentRef = useRef<ChatHighlightSegment | null>(null);
  const { speak, stop: stopTts, isSpeaking } = useTtsQueue();

  useEffect(() => {
    highlightSegmentRef.current = highlightSegment;
  }, [highlightSegment]);

  useEffect(() => {
    if (initializedHistoryRef.current || aiMessages.length === 0) {
      return;
    }

    aiMessages.forEach((msg) => {
      if (msg.role === "assistant") {
        speechProgressRef.current[msg.id] = getAssistantVisibleText(msg).length;
      }
    });
    initializedHistoryRef.current = true;
  }, [aiMessages]);

  const showQueuedHighlight = useCallback((segment: ChatHighlightSegment) => {
    if (highlightSegmentRef.current) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      if (highlightQueueRef.current[0] === segment) {
        setHighlightSegment(segment);
      }
    }, 80);

    return timeoutId;
  }, []);

  const queueSpeechSegment = useCallback(
    (
      messageId: string,
      start: number,
      end: number,
      rawText: string,
      timeoutIds?: ReturnType<typeof setTimeout>[],
      onEnd?: () => void
    ) => {
      const cleaned = cleanTextForSpeech(rawText);
      if (!cleaned) {
        return false;
      }

      const segment = { messageId, start, end };
      highlightQueueRef.current.push(segment);
      const timeoutId = showQueuedHighlight(segment);
      if (timeoutId && timeoutIds) {
        timeoutIds.push(timeoutId);
      }

      speak(cleaned, () => {
        highlightQueueRef.current.shift();
        setHighlightSegment(highlightQueueRef.current[0] || null);
        onEnd?.();
      });

      return true;
    },
    [showQueuedHighlight, speak]
  );

  const speakFinalMessage = useCallback(
    (message: UIMessage) => {
      if (!speechEnabled || message.role !== "assistant") {
        return;
      }

      const progress = speechProgressRef.current[message.id] ?? 0;
      const content = getAssistantVisibleText(message);
      if (progress >= content.length) {
        return;
      }

      queueSpeechSegment(
        message.id,
        progress,
        content.length,
        content.slice(progress)
      );
      speechProgressRef.current[message.id] = content.length;
    },
    [queueSpeechSegment, speechEnabled]
  );

  useEffect(() => {
    if (!speechEnabled || !isLoading) {
      return;
    }

    const lastMsg = currentMessages.at(-1);
    if (!lastMsg || lastMsg.role !== "assistant") {
      return;
    }

    const progress =
      typeof speechProgressRef.current[lastMsg.id] === "number"
        ? speechProgressRef.current[lastMsg.id]
        : 0;
    const content = getAssistantVisibleText(lastMsg);
    if (progress >= content.length) {
      return;
    }

    let scanPos = progress;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    const processChunk = (endPos: number) => {
      queueSpeechSegment(
        lastMsg.id,
        scanPos,
        endPos,
        content.slice(scanPos, endPos),
        timeoutIds
      );
      scanPos = endPos;
      speechProgressRef.current[lastMsg.id] = scanPos;
    };

    while (scanPos < content.length) {
      const nextNlIdx = content.indexOf("\n", scanPos);
      if (nextNlIdx === -1) {
        break;
      }

      processChunk(nextNlIdx);
      scanPos = nextNlIdx + 1;
      if (content[scanPos] === "\r") scanPos += 1;
      speechProgressRef.current[lastMsg.id] = scanPos;
    }

    return () => {
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, [currentMessages, isLoading, queueSpeechSegment, speechEnabled]);

  const stopSpeech = useCallback(() => {
    stopTts();
    highlightQueueRef.current = [];
    setHighlightSegment(null);
  }, [stopTts]);

  const resetSpeech = useCallback(
    (initialMessage?: UIMessage) => {
      stopSpeech();
      speechProgressRef.current = {};
      if (initialMessage?.role === "assistant") {
        speechProgressRef.current[initialMessage.id] =
          getAssistantVisibleText(initialMessage).length;
      }
    },
    [stopSpeech]
  );

  const speakText = useCallback(
    (
      text: string,
      onEnd?: () => void,
      highlight?: ChatHighlightSegment
    ) => {
      if (highlight) {
        queueSpeechSegment(
          highlight.messageId,
          highlight.start,
          highlight.end,
          text,
          undefined,
          onEnd
        );
        return;
      }

      speak(text, onEnd);
    },
    [queueSpeechSegment, speak]
  );

  return {
    highlightSegment,
    isSpeaking,
    speakText,
    stopSpeech,
    speakFinalMessage,
    resetSpeech,
  };
}
