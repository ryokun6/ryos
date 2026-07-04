import { useCallback, useMemo, useRef } from "react";
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
import { getAssistantVisibleText } from "@/apps/chats/utils/aiMessageText";
import { getAppName } from "@/apps/chats/components/chat-messages/utils";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import { getAssistantCharacter } from "./characters";
import type { AssistantToolActivity } from "./assistantAnimation";
import { createClientLogger } from "@/utils/logger";
import i18n from "@/lib/i18n";

const log = createClientLogger("Assistant");

/**
 * Exact trigger message the server-side assistant persona recognizes as an
 * automatic greeting request (see ASSISTANT_CHAT_INSTRUCTIONS).
 */
export const ASSISTANT_SUMMON_MESSAGE = "👋 *user summoned the assistant*";

/** Re-greet if the user hasn't talked to the assistant for this long. */
const GREETING_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

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
  switchTheme: "apps.chats.toolCalls.switchingTheme",
  songLibrary: "apps.chats.toolCalls.loadingMusicLibrary",
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
  /** True while a reply is generating and the new turn has no text yet. */
  isAwaitingReply: boolean;
  isLoading: boolean;
  errorText: string | null;
  sendUserMessage: (text: string) => void;
  /** Trigger a greeting (AI for signed-in users, canned otherwise). */
  greetIfStale: () => void;
  clearConversation: () => void;
  stop: () => void;
}

export function useAssistantChat(): AssistantChatHandle {
  const { username, isAuthenticated } = useChatsStoreShallow((state) => ({
    username: state.username,
    isAuthenticated: state.isAuthenticated,
  }));
  const launchApp = useLaunchApp();
  const { saveFile } = useFileSystem("/Documents", { skipLoad: true });

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
            assistantName: getAssistantCharacter(
              useAssistantStore.getState().characterId
            ).name,
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
      await dispatchToolCall(
        {
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          input: toolCall.input,
        },
        {
          addToolOutput,
          launchApp: (appId, options) => launchApp(appId as AppId, options),
          saveFile,
        }
      );
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
    await dispatchToolCall(
      {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
      },
      {
        addToolOutput,
        launchApp: (appId, options) => launchApp(appId as AppId, options),
        saveFile,
      }
    );
  };

  const isLoading = status === "streaming" || status === "submitted";
  const toolActivity = useMemo(
    () => getLatestToolActivity(messages),
    [messages]
  );

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
  // so the bubble can show the thinking ticker between replies.
  const isAwaitingReply = useMemo(() => {
    if (!isLoading) return false;
    const last = messages[messages.length - 1];
    if (!last) return true;
    if (last.role !== "assistant") return true;
    return !getAssistantVisibleText(last).trim();
  }, [messages, isLoading]);

  // Friendly status lines for tool calls in the current turn, shown in the
  // bubble's rolling "thinking" ticker while the reply is being generated.
  const statusLabels = useMemo(() => {
    if (!isLoading) return [];
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
  }, [messages, isLoading]);

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
            assistantName: getAssistantCharacter(
              useAssistantStore.getState().characterId
            ).name,
          },
        }
      );
    },
    [sendMessage, clearError]
  );

  const appendLocalGreeting = useCallback(() => {
    const key =
      LOCAL_GREETING_KEYS[Math.floor(Math.random() * LOCAL_GREETING_KEYS.length)];
    const characterName = getAssistantCharacter(
      useAssistantStore.getState().characterId
    ).name;
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

  const greetIfStale = useCallback(() => {
    const store = useAssistantStore.getState();
    const hasAssistantReply = store.messages.some(
      (msg) => msg.role === "assistant"
    );
    const stale =
      !store.lastInteractionAt ||
      Date.now() - store.lastInteractionAt > GREETING_STALE_MS;
    if (hasAssistantReply && !stale) return;

    if (username && isAuthenticated) {
      log.debug("Requesting AI greeting");
      sendUserMessage(ASSISTANT_SUMMON_MESSAGE);
    } else {
      log.debug("Using local canned greeting (anonymous user)");
      appendLocalGreeting();
      store.markInteraction();
    }
  }, [username, isAuthenticated, sendUserMessage, appendLocalGreeting]);

  const clearConversation = useCallback(() => {
    sdkStop();
    clearError();
    setMessages([]);
    useAssistantStore.getState().clearMessages();
  }, [sdkStop, clearError, setMessages]);

  return {
    messages: messages as AIChatMessage[],
    latestAssistantText,
    statusLabels,
    toolActivity,
    isAwaitingReply,
    isLoading,
    errorText,
    sendUserMessage,
    greetIfStale,
    clearConversation,
    stop: sdkStop,
  };
}
