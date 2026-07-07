import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { AIChatMessage } from "@/types/chat";
import { useAppStore } from "@/stores/useAppStore";
import {
  useChatsStore,
  useChatsStoreShallow,
} from "@/stores/useChatsStore";
import { useAssistantStore } from "@/stores/useAssistantStore";
import { getBrowserTimeZoneHeaders } from "@/api/core";
import { getApiUrl } from "@/utils/platform";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { AppId } from "@/config/appIds";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { getSystemState } from "@/apps/chats/utils/systemState";
import { dispatchToolCall } from "@/apps/chats/tools/dispatchToolCall";
import {
  hasUnsettledApprovalGatedActivity,
  registerToolApprovalSurface,
  sendAutomaticallyWhenApprovalsSettled,
} from "@/apps/chats/tools/toolApprovals";
import { summarizeChatMessages } from "@/apps/chats/tools/chatDebug";
import type { DispatchToolCallResult } from "@/apps/chats/tools/toolOpenResult";
import { getAssistantVisibleText } from "@/apps/chats/utils/aiMessageText";
import { getAppName } from "@/apps/chats/components/chat-messages/utils";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import type { ToolInvocationPart } from "@/components/shared/tool-invocation-message/types";
import {
  getAssistantCharacter,
  getAssistantCharacterName,
} from "./characters";
import { getAssistantBubbleToolParts } from "./assistantBubbleTools";
import { getAssistantGreetDecision } from "./assistantGreeting";
import type { AssistantToolActivity } from "./assistantAnimation";
import { createClientLogger } from "@/utils/logger";
import i18n from "@/lib/i18n";
import { ASSISTANT_SUMMON_MESSAGE } from "@/shared/assistantGreeting";
import {
  buildAIConversationRequestBody,
  getAIConversationRequestContext,
  invalidateAIConversationSession,
  resetAIConversationSession,
} from "@/api/aiConversations";
import { useServerAIConversation } from "@/hooks/useServerAIConversation";

const log = createClientLogger("Assistant");

export { ASSISTANT_SUMMON_MESSAGE };

/** Request body shared by every assistant `/api/chat` call. Reads the store
 * at call time so settings changes apply to the very next message. */
function buildAssistantRequestBody() {
  const assistant = useAssistantStore.getState();
  const customInstructions = assistant.customInstructions.trim();
  return {
    systemState: getSystemState(),
    model: useAppStore.getState().aiModel,
    persona: "assistant",
    assistantName: getAssistantCharacterName(
      getAssistantCharacter(assistant.characterId)
    ),
    assistantResponseStyle: assistant.responseStyle,
    ...(customInstructions
      ? { assistantInstructions: customInstructions }
      : {}),
  };
}

/** Canned greetings for logged-out users (avoids burning the 3/day AI budget). */
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
  getWeather: "apps.chats.toolCalls.weather.checking",
  getPreciseLocation: "apps.chats.toolCalls.location.requesting",
};

export function parseAssistantRateLimitState(
  error: Error | undefined,
  isAuthenticated: boolean
): { blocked: boolean; showLogin: boolean } | null {
  if (!error) return null;
  const message = error.message || "";
  if (
    message.includes("AI_TypeValidationError") ||
    message.includes("Type validation failed")
  ) {
    return null;
  }

  const jsonMatch = message.match(/\{.*\}/);
  if (jsonMatch) {
    try {
      const errorData = JSON.parse(jsonMatch[0]) as {
        error?: string;
        isAuthenticated?: boolean;
      };
      if (errorData.error === "rate_limit_exceeded") {
        const authed = !!errorData.isAuthenticated;
        return {
          blocked: true,
          showLogin: !authed && !isAuthenticated,
        };
      }
    } catch {
      // Fall through to generic 429 detection.
    }
  }

  if (message.includes("429") || message.includes("rate_limit_exceeded")) {
    return {
      blocked: true,
      showLogin: !isAuthenticated,
    };
  }

  return null;
}

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
  /**
   * Map/HTML-preview/Cursor tool parts of the latest assistant turn, rendered
   * as rich embeds in the bubble. Empty once a new turn is submitted.
   */
  bubbleToolParts: ToolInvocationPart[];
  /** Latest structured tool lifecycle event in the current assistant turn. */
  toolActivity: AssistantToolActivity | null;
  /** Latest successful client tool that opened or foregrounded an app window. */
  openTarget: AssistantOpenTarget | null;
  /** True while a reply is generating and the new turn has no text yet. */
  isAwaitingReply: boolean;
  isLoading: boolean;
  errorText: string | null;
  /** True when the chat input should be replaced with a sign-in prompt. */
  showLoginForRateLimit: boolean;
  /** True when rate limiting blocks further messages (signed-in or not). */
  isInputBlockedByRateLimit: boolean;
  sendUserMessage: (text: string) => void;
  /**
   * Call when the bubble opens (summon or tap). Starts a fresh conversation
   * if the bubble stayed dismissed long enough, then greets if warranted
   * (AI for signed-in users, canned otherwise).
   */
  greetIfStale: () => void;
  /**
   * Explicit fresh start (e.g. context menu "New Conversation"): clears the
   * thread and always triggers a greeting.
   */
  startNewConversation: () => void;
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
  const requestOwnerRef = useRef<string | null>(null);

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
          body: async () => buildAssistantRequestBody(),
          prepareSendMessagesRequest: async ({
            body,
            id,
            messages,
            trigger,
            messageId,
          }) => {
            const chats = useChatsStore.getState();
            const owner =
              chats.username && chats.isAuthenticated
                ? chats.username.toLowerCase()
                : null;
            const conversation = owner
              ? await getAIConversationRequestContext({
                  channel: "assistant",
                  username: owner,
                })
              : undefined;
            const current = useChatsStore.getState();
            const currentOwner =
              current.username && current.isAuthenticated
                ? current.username.toLowerCase()
                : null;
            if (currentOwner !== owner) {
              throw new Error(
                "Assistant identity changed while preparing request"
              );
            }
            requestOwnerRef.current = owner;
            log.debug("Preparing /api/chat request (assistant)", {
              trigger,
              messageId,
              owner,
              conversation,
              ...summarizeChatMessages(messages),
            });
            return {
              body: buildAIConversationRequestBody({
                body,
                id,
                messages,
                trigger,
                messageId,
                conversation,
              }),
            };
          },
        }),
        sendAutomaticallyWhen: sendAutomaticallyWhenApprovalsSettled,
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

  // Route in-chat Allow / Don't Allow decisions for approval-gated tools
  // (e.g. getPreciseLocation) rendered in the assistant bubble to this chat.
  useEffect(
    () =>
      registerToolApprovalSurface({
        getMessages: () => chat.messages,
        addToolApprovalResponse: (args) => chat.addToolApprovalResponse(args),
        addToolOutput: (payload) => chat.addToolOutput(payload),
      }),
    [chat]
  );

  const assistantIdentity =
    username && isAuthenticated ? username.toLowerCase() : null;
  const previousAssistantIdentityRef = useRef(assistantIdentity);
  useEffect(() => {
    if (previousAssistantIdentityRef.current === assistantIdentity) return;
    previousAssistantIdentityRef.current = assistantIdentity;
    requestOwnerRef.current = null;
    sdkStop();
    clearError();
    setMessages(useAssistantStore.getState().messages);
  }, [assistantIdentity, sdkStop, clearError, setMessages]);

  const applyServerMessages = useCallback(
    (loadedMessages: AIChatMessage[]) => {
      // Hydration replaces the live SDK messages wholesale — log it so races
      // with in-flight tool approvals are visible in debug traces.
      log.debug(
        "Applying server conversation snapshot (assistant)",
        summarizeChatMessages(loadedMessages)
      );
      setMessages(loadedMessages);
      if (loadedMessages.length > 0) {
        useAssistantStore.getState().hydrateMessages(loadedMessages);
      } else {
        useAssistantStore.getState().clearMessages();
      }
    },
    [setMessages]
  );

  // Server conversation sync for the assistant thread: hydration on sign-in,
  // focus/visibility refresh, and realtime cross-device updates.
  useServerAIConversation({
    channel: "assistant",
    username,
    isAuthenticated,
    // Not "ready" while an approval-gated tool is being settled: hydration
    // would overwrite the locally recorded Allow with the server's stale
    // approval-requested snapshot, corrupting the eventual tool output part.
    isChatReady: () =>
      chat.status === "ready" &&
      !hasUnsettledApprovalGatedActivity(chat.messages),
    applyMessages: applyServerMessages,
    onError: (error, context) => {
      log.warn(`Failed to sync server conversation (${context})`, { error });
    },
  });

  const handlersRef = useRef({
    // Placeholder; replaced with a fresh closure on every render below so the
    // dispatch always sees the latest addToolOutput/launchApp identities.
    onToolCall: async (_options: {
      toolCall: { toolName: string; toolCallId: string; input: unknown };
    }): Promise<void> => {},
    onFinish: ({ messages: finished }: { messages: AIChatMessage[] }) => {
      const currentAuth = useChatsStore.getState();
      const currentOwner =
        currentAuth.username && currentAuth.isAuthenticated
          ? currentAuth.username.toLowerCase()
          : null;
      if (requestOwnerRef.current !== currentOwner) {
        log.debug("Ignoring response from a previous assistant identity");
        return;
      }
      if (requestOwnerRef.current) {
        invalidateAIConversationSession(
          "assistant",
          requestOwnerRef.current
        );
      }
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
      // Always-printed context for bug reports: the failing message states
      // usually explain server-side 400s (e.g. invalid_messages).
      log.error("Assistant chat request failed", {
        error: err,
        ...summarizeChatMessages(chat.messages),
      });
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
  // so the bubble can show the thinking ticker between replies.
  const isAwaitingReply = useMemo(() => {
    if (!isLoading) return false;
    const last = messages[messages.length - 1];
    if (!last) return true;
    if (last.role !== "assistant") return true;
    return !getAssistantVisibleText(last).trim();
  }, [messages, isLoading]);

  // Rich-embed tool parts (maps, HTML preview, Cursor agents) from the most
  // recent assistant message. Looking only at the last message means the
  // embeds clear as soon as the user submits a new turn (the ticker takes
  // over), then reappear live while the new turn streams its tool calls.
  const bubbleToolParts = useMemo(() => {
    const last = messages[messages.length - 1];
    return getAssistantBubbleToolParts(last);
  }, [messages]);

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

  const rateLimitState = useMemo(
    () => parseAssistantRateLimitState(error, isAuthenticated),
    [error, isAuthenticated]
  );

  const errorText = useMemo(() => {
    if (!error) return null;
    const message = error.message || "";
    if (
      message.includes("AI_TypeValidationError") ||
      message.includes("Type validation failed")
    ) {
      return null;
    }
    if (rateLimitState?.blocked) {
      return i18n.t("common.assistant.rateLimited");
    }
    return i18n.t("common.assistant.genericError");
  }, [error, rateLimitState]);

  const showLoginForRateLimit = rateLimitState?.showLogin ?? false;
  const isInputBlockedByRateLimit = rateLimitState?.blocked ?? false;

  useEffect(() => {
    if (isAuthenticated && rateLimitState?.showLogin) {
      clearError();
    }
  }, [isAuthenticated, rateLimitState?.showLogin, clearError]);

  const sendUserMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      clearError();
      useAssistantStore.getState().markInteraction();
      sendMessage(
        { text, metadata: { createdAt: new Date() } },
        { body: buildAssistantRequestBody() }
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

  const clearConversationInternal = useCallback(async (): Promise<boolean> => {
    sdkStop();
    if (username && isAuthenticated) {
      try {
        await resetAIConversationSession({
          channel: "assistant",
          username,
        });
      } catch (resetError) {
        log.warn("Failed to reset server conversation", { error: resetError });
        return false;
      }
    }
    clearError();
    setMessages([]);
    useAssistantStore.getState().clearMessages();
    return true;
  }, [
    username,
    isAuthenticated,
    sdkStop,
    clearError,
    setMessages,
  ]);

  const clearConversation = useCallback(() => {
    void clearConversationInternal();
  }, [clearConversationInternal]);

  const triggerGreeting = useCallback(() => {
    if (chat.status === "streaming" || chat.status === "submitted") return;

    if (username && isAuthenticated) {
      log.debug("Requesting AI greeting");
      sendUserMessage(ASSISTANT_SUMMON_MESSAGE);
    } else {
      log.debug("Using local canned greeting (logged-out user)");
      appendLocalGreeting();
      useAssistantStore.getState().markInteraction();
    }
  }, [
    chat.status,
    username,
    isAuthenticated,
    sendUserMessage,
    appendLocalGreeting,
  ]);

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
      void clearConversationInternal().then((cleared) => {
        if (cleared && store.greetOnSummon) triggerGreeting();
      });
      return;
    }

    // Greeting turned off in Assistant settings → Behavior. The stale-thread
    // cleanup above still applies; the bubble just opens quietly.
    if (!store.greetOnSummon) return;

    triggerGreeting();
  }, [chat.status, clearConversationInternal, triggerGreeting]);

  const startNewConversation = useCallback(() => {
    void clearConversationInternal().then((cleared) => {
      if (cleared) triggerGreeting();
    });
  }, [clearConversationInternal, triggerGreeting]);

  return {
    messages: messages as AIChatMessage[],
    latestAssistantText,
    statusLabels,
    bubbleToolParts,
    toolActivity,
    openTarget,
    isAwaitingReply,
    isLoading,
    errorText,
    showLoginForRateLimit,
    isInputBlockedByRateLimit,
    sendUserMessage,
    greetIfStale,
    startNewConversation,
    clearConversation,
    stop: sdkStop,
  };
}
