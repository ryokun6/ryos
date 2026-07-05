import { useCallback, useMemo, useRef, useState } from "react";
import { Chat, useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { AIChatMessage } from "@/types/chat";
import { useAppStore } from "@/stores/useAppStore";
import { useChatsStoreShallow } from "@/stores/useChatsStore";
import { useAssistantStore } from "@/stores/useAssistantStore";
import { getBrowserTimeZoneHeaders } from "@/api/core";
import { getApiUrl } from "@/utils/platform";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { AppId } from "@/config/appIds";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { getSystemState } from "@/apps/chats/utils/systemState";
import { dispatchToolCall } from "@/apps/chats/tools/dispatchToolCall";
import type { DispatchToolCallResult } from "@/apps/chats/tools/toolOpenResult";
import { getAssistantVisibleText } from "@/apps/chats/utils/aiMessageText";
import { getAppName } from "@/apps/chats/components/chat-messages/utils";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import {
  getAssistantCharacter,
  getAssistantCharacterName,
} from "./characters";
import { getAssistantGreetDecision } from "./assistantGreeting";
import { resolveAssistantAwaitingReply } from "./assistantReplyState";
import type { AssistantToolActivity } from "./assistantAnimation";
import { createClientLogger } from "@/utils/logger";
import i18n from "@/lib/i18n";

const log = createClientLogger("Assistant");

/**
 * Exact trigger message the server-side assistant persona recognizes as an
 * automatic greeting request (see ASSISTANT_CHAT_INSTRUCTIONS).
 */
export const ASSISTANT_SUMMON_MESSAGE = "👋 *user summoned the assistant*";

/** Canned greetings for anonymous users (avoids burning the 3/day AI budget). */
const LOCAL_GREETING_KEYS = [
  "common.assistant.greetings.hello",
  "common.assistant.greetings.help",
  "common.assistant.greetings.looksLike",
  "common.assistant.greetings.tip",
] as const;

/** Tools with a dedicated status line (others fall back to "Running X…"). */
const TOOL_STATUS_KEYS: Record<string, string> = {
  mediaControl: "apps.chats.toolCalls.controllingPlayback",
  list: "apps.chats.toolCalls.findingFiles",
  open: "apps.chats.toolCalls.openingFile",
  read: "apps.chats.toolCalls.readingFile",
  write: "apps.chats.toolCalls.writingContent",
  edit: "apps.chats.toolCalls.editingFile",
  settings: "apps.chats.toolCalls.changingSettings",
  songLibraryControl: "apps.chats.toolCalls.loadingMusicLibrary",
};

function getToolStatusLabel(toolName: string, input: unknown): string {
  const appId =
    input && typeof input === "object"
      ? (input as { id?: string }).id
      : undefined;
  if (toolName === "launchApp") {
    return i18n.t("apps.chats.toolCalls.launching", {
      appName: getAppName(appId),
    });
  }
  if (toolName === "closeApp") {
    return i18n.t("apps.chats.toolCalls.closing", {
      appName: getAppName(appId),
    });
  }
  const key = TOOL_STATUS_KEYS[toolName];
  if (key) return i18n.t(key);
  return i18n.t("apps.chats.toolCalls.running", {
    toolName: formatToolName(toolName),
  });
}

function getLatestToolActivity(
  messages: AIChatMessage[]
): AssistantToolActivity | null {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) {
    return null;
  }

  for (let index = last.parts.length - 1; index >= 0; index -= 1) {
    const part = last.parts[index];
    if (
      typeof part.type !== "string" ||
      !part.type.startsWith("tool-") ||
      !("state" in part)
    ) {
      continue;
    }

    const phase =
      part.state === "output-error"
        ? "error"
        : part.state === "output-available"
          ? "complete"
          : "running";
    return {
      name: part.type.slice(5),
      phase,
    };
  }

  return null;
}

export interface AssistantChatHandle {
  messages: AIChatMessage[];
  /** Latest visible assistant reply text (streams in as it is generated). */
  latestAssistantText: string;
  /** Friendly labels for tool calls in the in-flight assistant turn. */
  statusLabels: string[];
  /** Latest structured tool lifecycle event in the current assistant turn. */
  toolActivity: AssistantToolActivity | null;
  /** Latest successful client tool that opened or foregrounded an app window. */
  openTarget: AssistantOpenTarget | null;
  /** True while a reply is generating and the new turn has no text yet. */
  isAwaitingReply: boolean;
  isLoading: boolean;
  errorText: string | null;
  sendUserMessage: (text: string) => void;
  /**
   * Call when the bubble opens (summon or tap). Starts a fresh conversation
   * if the bubble stayed dismissed long enough, then greets if warranted
   * (AI for signed-in users, canned otherwise).
   */
  greetIfStale: () => void;
  clearConversation: () => void;
  stop: () => void;
}

export interface AssistantOpenTarget {
  instanceId: string;
  requestSequence: number;
  toolStartedAt: number;
}

export function useAssistantChat(): AssistantChatHandle {
  const { username, isAuthenticated } = useChatsStoreShallow((state) => ({
    username: state.username,
    isAuthenticated: state.isAuthenticated,
  }));
  const launchApp = useLaunchApp();
  const { saveFile } = useFileSystem("/Documents", { skipLoad: true });
  const [openTarget, setOpenTarget] = useState<AssistantOpenTarget | null>(null);
  const toolRequestSequenceRef = useRef(0);
  const latestOpenAttemptSequenceRef = useRef(0);
  const latestOpenSequenceRef = useRef(0);

  const recordOpenAttempt = useCallback((requestSequence: number) => {
    if (requestSequence <= latestOpenAttemptSequenceRef.current) return;
    latestOpenAttemptSequenceRef.current = requestSequence;
    setOpenTarget((current) =>
      current && current.requestSequence < requestSequence ? null : current
    );
  }, []);

  const recordOpenResult = useCallback(
    (
      result: DispatchToolCallResult,
      requestSequence: number,
      toolStartedAt: number
    ) => {
      if (
        result.kind !== "opened-app" ||
        requestSequence < latestOpenAttemptSequenceRef.current ||
        requestSequence <= latestOpenSequenceRef.current
      ) {
        return;
      }
      latestOpenSequenceRef.current = requestSequence;
      setOpenTarget({
        instanceId: result.instanceId,
        requestSequence,
        toolStartedAt,
      });
    },
    []
  );

  // One Chat per overlay mount; seeded from the persisted assistant thread.
  const chat = useMemo(
    () =>
      new Chat<AIChatMessage>({
        messages: useAssistantStore.getState().messages,
        transport: new DefaultChatTransport({
          api: getApiUrl("/api/chat"),
          headers: getBrowserTimeZoneHeaders,
          body: async () => ({
            systemState: getSystemState(),
            model: useAppStore.getState().aiModel,
            persona: "assistant",
            assistantName: getAssistantCharacterName(
              getAssistantCharacter(useAssistantStore.getState().characterId)
            ),
          }),
        }),
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
        async onToolCall(options) {
          await handlersRef.current.onToolCall(options);
        },
        onFinish(options) {
          handlersRef.current.onFinish(options);
        },
        onError(error) {
          handlersRef.current.onError(error);
        },
      }),
    []
  );

  const {
    messages,
    status,
    sendMessage,
    setMessages,
    addToolOutput,
    stop: sdkStop,
    clearError,
    error,
  } = useChat<AIChatMessage>({ chat, experimental_throttle: 60 });

  const handlersRef = useRef({
    onToolCall: async ({
      toolCall,
    }: {
      toolCall: { toolName: string; toolCallId: string; input: unknown };
    }) => {
      const requestSequence = ++toolRequestSequenceRef.current;
      const toolStartedAt = Date.now();
      const result = await dispatchToolCall(
        {
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          input: toolCall.input,
        },
        {
          addToolOutput,
          launchApp: (appId, options) => launchApp(appId as AppId, options),
          saveFile,
          onOpenAttempt: () => recordOpenAttempt(requestSequence),
        }
      );
      recordOpenResult(result, requestSequence, toolStartedAt);
    },
    onFinish: ({ messages: finished }: { messages: AIChatMessage[] }) => {
      const stamped = finished.map(
        (msg) =>
          ({
            ...msg,
            metadata: {
              createdAt: msg.metadata?.createdAt || new Date(),
            },
          }) as AIChatMessage
      );
      useAssistantStore.getState().setMessages(stamped);
    },
    onError: (err: Error) => {
      // Known AI SDK v6 issue: finish-event validation error after tool calls.
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("AI_TypeValidationError") ||
        message.includes("Type validation failed")
      ) {
        return;
      }
      log.debug("Assistant chat error", { message });
    },
  });
  handlersRef.current.onToolCall = async ({ toolCall }) => {
    const requestSequence = ++toolRequestSequenceRef.current;
    const toolStartedAt = Date.now();
    const result = await dispatchToolCall(
      {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
      },
      {
        addToolOutput,
        launchApp: (appId, options) => launchApp(appId as AppId, options),
        saveFile,
        onOpenAttempt: () => recordOpenAttempt(requestSequence),
      }
    );
    recordOpenResult(result, requestSequence, toolStartedAt);
  };

  const isLoading = status === "streaming" || status === "submitted";

  // Stabilize by value: `messages` gets a new identity on every streamed
  // chunk, which would otherwise produce a fresh toolActivity object each
  // update and make the overlay restart the current sprite clip mid-stream.
  const stableToolActivityRef = useRef<AssistantToolActivity | null>(null);
  const toolActivity = useMemo(() => {
    const latest = getLatestToolActivity(messages);
    const previous = stableToolActivityRef.current;
    if (
      latest !== null &&
      previous !== null &&
      latest.name === previous.name &&
      latest.phase === previous.phase
    ) {
      return previous;
    }
    stableToolActivityRef.current = latest;
    return latest;
  }, [messages]);

  const latestAssistantText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant") {
        const text = getAssistantVisibleText(msg);
        if (text.trim()) return text;
        // Streaming reply may not have text yet (e.g. running a tool first);
        // keep looking so the bubble shows the previous reply meanwhile.
        if (!isLoading) return text;
      }
    }
    return "";
  }, [messages, isLoading]);

  // True while the in-flight turn hasn't produced visible text yet. Unlike
  // `latestAssistantText` (which intentionally falls back to the previous
  // reply while a new one is generating), this looks only at the current turn
  // so the bubble can show the thinking ticker between replies. Also bridges
  // the SDK's momentary "ready" status between auto-resent tool steps.
  const isAwaitingReply = useMemo(
    () =>
      resolveAssistantAwaitingReply({
        messages,
        isLoading,
        hasError: error !== undefined,
      }),
    [messages, isLoading, error]
  );

  // Friendly status lines for tool calls in the current turn, shown in the
  // bubble's rolling "thinking" ticker while the reply is being generated.
  const statusLabels = useMemo(() => {
    if (!isLoading && !isAwaitingReply) return [];
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || !Array.isArray(last.parts)) {
      return [];
    }
    const labels: string[] = [];
    for (const part of last.parts as Array<{ type: string; input?: unknown }>) {
      if (typeof part.type !== "string" || !part.type.startsWith("tool-")) {
        continue;
      }
      const label = getToolStatusLabel(part.type.slice(5), part.input);
      if (labels[labels.length - 1] !== label) labels.push(label);
    }
    return labels;
  }, [messages, isLoading, isAwaitingReply]);

  const errorText = useMemo(() => {
    if (!error) return null;
    const message = error.message || "";
    if (
      message.includes("AI_TypeValidationError") ||
      message.includes("Type validation failed")
    ) {
      return null;
    }
    if (message.includes("429") || message.includes("rate_limit_exceeded")) {
      return i18n.t("common.assistant.rateLimited");
    }
    return i18n.t("common.assistant.genericError");
  }, [error]);

  const sendUserMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      clearError();
      useAssistantStore.getState().markInteraction();
      sendMessage(
        { text, metadata: { createdAt: new Date() } },
        {
          body: {
            systemState: getSystemState(),
            model: useAppStore.getState().aiModel,
            persona: "assistant",
            assistantName: getAssistantCharacterName(
              getAssistantCharacter(useAssistantStore.getState().characterId)
            ),
          },
        }
      );
    },
    [sendMessage, clearError]
  );

  const appendLocalGreeting = useCallback(() => {
    const key =
      LOCAL_GREETING_KEYS[Math.floor(Math.random() * LOCAL_GREETING_KEYS.length)];
    const characterName = getAssistantCharacterName(
      getAssistantCharacter(useAssistantStore.getState().characterId)
    );
    const greeting: AIChatMessage = {
      id: `assistant-local-greeting-${Date.now()}`,
      role: "assistant",
      parts: [{ type: "text", text: i18n.t(key, { name: characterName }) }],
      metadata: { createdAt: new Date() },
    };
    const next = [...chat.messages, greeting] as AIChatMessage[];
    setMessages(next);
    useAssistantStore.getState().setMessages(next);
  }, [chat, setMessages]);

  const clearConversation = useCallback(() => {
    sdkStop();
    clearError();
    setMessages([]);
    useAssistantStore.getState().clearMessages();
  }, [sdkStop, clearError, setMessages]);

  const greetIfStale = useCallback(() => {
    const store = useAssistantStore.getState();
    const decision = getAssistantGreetDecision({
      bubbleDismissedAt: store.bubbleDismissedAt,
      lastInteractionAt: store.lastInteractionAt,
      hasAssistantReply: store.messages.some(
        (msg) => msg.role === "assistant"
      ),
      now: Date.now(),
    });
    // The bubble is (re)opening, so the dismissal no longer applies.
    store.clearBubbleDismissed();
    if (decision === "none") return;
    // Never greet over an in-flight turn (e.g. a quick close/reopen while a
    // reply is still streaming).
    if (chat.status === "streaming" || chat.status === "submitted") return;

    if (decision === "fresh-greet") {
      log.debug("Bubble dismissed long enough — starting a fresh conversation");
      clearConversation();
    }

    if (username && isAuthenticated) {
      log.debug("Requesting AI greeting");
      sendUserMessage(ASSISTANT_SUMMON_MESSAGE);
    } else {
      log.debug("Using local canned greeting (anonymous user)");
      appendLocalGreeting();
      useAssistantStore.getState().markInteraction();
    }
  }, [
    chat,
    username,
    isAuthenticated,
    sendUserMessage,
    appendLocalGreeting,
    clearConversation,
  ]);

  return {
    messages: messages as AIChatMessage[],
    latestAssistantText,
    statusLabels,
    toolActivity,
    openTarget,
    isAwaitingReply,
    isLoading,
    errorText,
    sendUserMessage,
    greetIfStale,
    clearConversation,
    stop: sdkStop,
  };
}
