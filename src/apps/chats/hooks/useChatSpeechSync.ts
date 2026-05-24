import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { AIChatMessage } from "@/types/chat";
import { useTtsQueue } from "@/hooks/useTtsQueue";
import { cleanTextForSpeech } from "../utils/textForSpeech";
import { getAssistantVisibleText } from "../utils/aiMessageText";
import { clearTtsHighlight } from "../utils/ttsHighlight";

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
  const { speak, stop: stopTts, isSpeaking } = useTtsQueue();

  const setCurrentHighlightSegment = useCallback(
    (segment: ChatHighlightSegment | null) => {
      highlightSegmentRef.current = segment;
      setHighlightSegment(segment);
    },
    []
  );

  // Stop both audio playback and the highlight state. Called when the user
  // hits stop or when speech finishes — both should leave no stale highlight
  // behind. Lingering speak() chains may still fire `onEnd` callbacks after
  // their fetches abort; those fall through harmlessly because the queue is
  // already empty and `setCurrentHighlightSegment(queue[0] || null)` resolves
  // to null.
  //
  // We also force-clear the global CSS Custom Highlight registry directly here
  // because relying solely on the per-message effect cleanup leaves a window
  // (between this state update and the next React commit) where the painted
  // overlay is still visible on screen — that's exactly the "past highlights
  // don't get cleared" symptom users were seeing when stopping mid-speech.
  const stopSpeech = useCallback(() => {
    stopTts();
    highlightQueueRef.current = [];
    setCurrentHighlightSegment(null);
    clearTtsHighlight();
  }, [setCurrentHighlightSegment, stopTts]);

  useEffect(() => {
    aiMessages.forEach((msg) => {
      if (msg.role === "assistant") {
        const content = getAssistantVisibleText(msg);
        speechProgressRef.current[msg.id] = content.length;
      }
    });
  }, [aiMessages]);

  const enqueueHighlightSpeech = useCallback(
    (
      messageId: string,
      start: number,
      end: number,
      rawChunk: string,
      onComplete?: () => void
    ) => {
      const cleaned = cleanTextForSpeech(rawChunk);
      if (!cleaned) {
        onComplete?.();
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
        const next = highlightQueueRef.current[0] || null;
        setCurrentHighlightSegment(next);
        // When the last spoken segment ends, force-clear the global CSS Custom
        // Highlight registry directly instead of relying solely on the per-
        // message effect cleanup. React's `setHighlightSegment(null)` schedules
        // a re-render, but the commit (and the cleanup that calls
        // `clearTtsHighlight(ownerToken)`) can be delayed — most reproducibly
        // when the chat window is backgrounded inside ryOS or the browser tab
        // is in another foreground, since `setTimeout`/`requestAnimationFrame`
        // are throttled there and React's commit can sit on the scheduler
        // queue. That gap is what users see as "the highlight for done lines
        // lingers until I switch the window in and out of focus": the
        // foreground switch forces a fresh render that finally runs the
        // cleanup. Wiping the registry here removes the overlay immediately,
        // mirroring what `stopSpeech` already does for user-initiated stops.
        if (next === null) {
          clearTtsHighlight();
        }
        onComplete?.();
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

  // Manually play an assistant message end-to-end (triggered by the speaker
  // button on a message bubble). We route through the same highlight-aware
  // queue used during streaming so the on-screen overlay tracks the spoken
  // segments — previously this path used a second, isolated TTS queue and
  // therefore never painted any highlight.
  //
  // `fullSource` must be the same string the bubble uses to resolve
  // highlight offsets (i.e. the concatenated visible text across the
  // assistant's `text` parts, decoded the same way), otherwise the painted
  // range will land on the wrong span.
  const speakAssistantMessageManually = useCallback(
    (messageId: string, fullSource: string, onAllDone?: () => void) => {
      if (!fullSource) {
        onAllDone?.();
        return;
      }

      // Stop anything currently playing and wipe the highlight registry so
      // the new playback starts from a clean slate.
      stopTts();
      highlightQueueRef.current = [];
      setCurrentHighlightSegment(null);

      // Mark the message as fully processed so the streaming detector never
      // tries to re-enqueue the same text on the next render.
      speechProgressRef.current[messageId] = fullSource.length;

      const segments: Array<{ start: number; end: number; chunk: string }> = [];
      let scanPos = 0;
      while (scanPos < fullSource.length) {
        const nextNlIdx = fullSource.indexOf("\n", scanPos);
        const endPos = nextNlIdx === -1 ? fullSource.length : nextNlIdx;
        const chunk = fullSource.slice(scanPos, endPos);
        if (chunk.trim().length > 0) {
          segments.push({ start: scanPos, end: endPos, chunk });
        }
        if (nextNlIdx === -1) break;
        scanPos = nextNlIdx + 1;
        if (fullSource[scanPos] === "\r") scanPos += 1;
      }

      if (segments.length === 0) {
        onAllDone?.();
        return;
      }

      let pending = segments.length;
      const handleSegmentDone = () => {
        pending -= 1;
        if (pending === 0) onAllDone?.();
      };

      segments.forEach(({ start, end, chunk }) => {
        enqueueHighlightSpeech(messageId, start, end, chunk, handleSegmentDone);
      });
    },
    [enqueueHighlightSpeech, setCurrentHighlightSegment, stopTts]
  );

  const resetSpeechState = useCallback(() => {
    // stopSpeech already stops audio, drains the highlight queue, and clears
    // the active segment; only the per-message progress map needs explicit
    // reset on top.
    stopSpeech();
    speechProgressRef.current = {};
  }, [stopSpeech]);

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
    speakAssistantMessageManually,
    speakFinalAssistantMessage,
    stopSpeech,
  };
}
