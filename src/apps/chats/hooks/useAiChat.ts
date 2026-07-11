import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Chat, useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatInit } from "ai";
import { useChatsStore } from "@/stores/useChatsStore";
import type { AIChatMessage } from "@/types/chat";
import { useAppStore } from "@/stores/useAppStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { getBrowserTimeZoneHeaders } from "@/api/core";
import { getApiUrl } from "@/utils/platform";
import { toast } from "@/hooks/useToast";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { AppId } from "@/config/appIds";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useTextEditStore } from "@/stores/useTextEditStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useChatsStoreShallow } from "@/stores/useChatsStore";
import i18n from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { aiChatLog as log } from "../logging";
import { tryInvokeParentStartGrindPlanning } from "@/utils/parentGrindPlanning";
import { showAiMessageNotification } from "@/utils/chatNotificationDisplay";
import { shouldShowNativeToastNotification } from "@/utils/nativeToastNotifications";
import { getAssistantVisibleText } from "../utils/aiMessageText";
import { useChatSpeechSync } from "./useChatSpeechSync";
import { useSyncedAiMessages } from "./useSyncedAiMessages";
import { getSystemState } from "../utils/systemState";
import { dispatchToolCall } from "../tools/dispatchToolCall";
import {
  hasUnsettledApprovalGatedActivity,
  registerToolApprovalSurface,
  sendAutomaticallyWhenApprovalsSettled,
} from "../tools/toolApprovals";
import { summarizeChatMessages } from "../tools/chatDebug";
import { SERVER_EXECUTED_TOOL_NAME_SET } from "@/shared/tools/serverExecuted";
import {
  buildAIConversationRequestBody,
  getAIConversationRequestContext,
  invalidateAIConversationSession,
  resetAIConversationSession,
  uploadAIConversationImage,
} from "@/api/aiConversations";
import { useServerAIConversation } from "@/hooks/useServerAIConversation";


// Helper to check if chats app is currently in the foreground
const isChatsInForeground = (): boolean => {
  const appStore = useAppStore.getState();
  const foregroundId = appStore.foregroundInstanceId;
  if (!foregroundId) return false;
  const foregroundInstance = appStore.instances[foregroundId];
  return foregroundInstance?.appId === "chats";
};

// Helper to show notification with assistant's message when chat is backgrounded
const showBackgroundedMessageNotification = (message: UIMessage) => {
  const textContent = getAssistantVisibleText(message);
  if (!textContent.trim()) return;

  showAiMessageNotification({
    content: textContent,
    messageId: message.id,
  });
};

// ---------------------------------------------------------------------------
// Shared AI chat instance
//
// Chats and Terminal both call useAiChat(). Each useChat() call used to spin
// up its OWN SDK Chat (separate transport, separate message state, separate
// tool execution) that fought over the single Zustand message store. All
// callers now attach to ONE module-level Chat instance, so messages, status,
// and in-flight streams are genuinely shared.
//
// Chat lifecycle callbacks (tool calls, finish, error) must be configured at
// construction time, but their implementations need per-instance React scope
// (launchApp, file saving, dialogs, toasts). The chat therefore delegates to
// a handler registry: each mounted useAiChat registers its latest handlers,
// and the chats app ("primary") wins over the terminal ("secondary") so
// rate-limit / auth UI state lands in the app that renders it.
// ---------------------------------------------------------------------------
type SharedChatInit = ChatInit<AIChatMessage>;
type SharedOnToolCall = NonNullable<SharedChatInit["onToolCall"]>;
type SharedOnFinish = NonNullable<SharedChatInit["onFinish"]>;
type SharedOnError = NonNullable<SharedChatInit["onError"]>;

interface SharedAiChatHandlers {
  onToolCall: SharedOnToolCall;
  onFinish: SharedOnFinish;
  onError: SharedOnError;
}

type SharedHandlerRole = "primary" | "secondary";

const sharedHandlerRegistry = new Map<
  SharedHandlerRole,
  { readonly current: SharedAiChatHandlers }
>();

const resolveSharedHandlers = (): SharedAiChatHandlers | null =>
  (sharedHandlerRegistry.get("primary") ?? sharedHandlerRegistry.get("secondary"))
    ?.current ?? null;

let sharedAiChat: Chat<AIChatMessage> | null = null;
let sharedRequestOwner: string | null = null;

function buildChatRequestBody(
  systemState = getSystemState(),
  model = useAppStore.getState().aiModel
) {
  return {
    systemState,
    model,
  };
}

type ChatSubmissionIdentity = {
  username: string | null;
  isAuthenticated: boolean;
};

function captureChatSubmissionIdentity(): ChatSubmissionIdentity {
  const { username, isAuthenticated } = useChatsStore.getState();
  return {
    username: username ? username.toLowerCase() : null,
    isAuthenticated,
  };
}

function isChatSubmissionIdentityCurrent(
  identity: ChatSubmissionIdentity
): boolean {
  const current = captureChatSubmissionIdentity();
  return (
    current.username === identity.username &&
    current.isAuthenticated === identity.isAuthenticated
  );
}

function createInitialChatMessage(): AIChatMessage {
  return {
    id: "1",
    role: "assistant",
    parts: [{ type: "text", text: i18n.t("apps.chats.messages.greeting") }],
    metadata: { createdAt: new Date() },
  };
}

function getSharedAiChat(): Chat<AIChatMessage> {
  if (!sharedAiChat) {
    sharedAiChat = new Chat<AIChatMessage>({
      // Initialize from the store's current snapshot. Chat persistence hydrates
      // asynchronously from IndexedDB, and useSyncedAiMessages reconciles the
      // restored conversation after hydration completes.
      messages: useChatsStore.getState().aiMessages,

      transport: new DefaultChatTransport({
        api: getApiUrl("/api/chat"),
        headers: getBrowserTimeZoneHeaders,
        body: async () => buildChatRequestBody(),
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
                channel: "chat",
                username: owner,
              })
            : undefined;
          const current = useChatsStore.getState();
          const currentOwner =
            current.username && current.isAuthenticated
              ? current.username.toLowerCase()
              : null;
          if (currentOwner !== owner) {
            throw new Error("Chat identity changed while preparing request");
          }
          sharedRequestOwner = owner;
          log.debug("Preparing /api/chat request", {
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

      // Automatically submit when all tool outputs are available, or when
      // the user has responded to every pending tool approval (deny path).
      sendAutomaticallyWhen: sendAutomaticallyWhenApprovalsSettled,

      async onToolCall(options) {
        await resolveSharedHandlers()?.onToolCall(options);
      },
      onFinish(options) {
        resolveSharedHandlers()?.onFinish(options);
      },
      onError(error) {
        resolveSharedHandlers()?.onError(error);
      },
    });

    // Route in-chat Allow / Don't Allow decisions for approval-gated tools
    // (e.g. getPreciseLocation) to this chat. Module-level singleton — registered
    // once for the app's lifetime.
    const chat = sharedAiChat;
    registerToolApprovalSurface({
      getMessages: () => chat.messages,
      addToolApprovalResponse: (args) => chat.addToolApprovalResponse(args),
      addToolOutput: (payload) => chat.addToolOutput(payload),
    });
  }
  return sharedAiChat;
}

export function useAiChat(onPromptSetUsername?: () => void) {
  const { aiMessages, setAiMessages, username, isAuthenticated } =
    useChatsStoreShallow((state) => ({
      aiMessages: state.aiMessages,
      setAiMessages: state.setAiMessages,
      username: state.username,
      isAuthenticated: state.isAuthenticated,
    }));
  const launchApp = useLaunchApp();
  const aiModel = useAppStore((state) => state.aiModel);
  const speechEnabled = useAudioSettingsStore((state) => state.speechEnabled);
  const { saveFile } = useFileSystem("/Documents", { skipLoad: true });

  const { t } = useTranslation();
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("");

  // Rate limit state
  const [rateLimitError, setRateLimitError] = useState<{
    isAuthenticated: boolean;
    count: number;
    limit: number;
    message: string;
  } | null>(null);
  const [needsUsername, setNeedsUsername] = useState(false);

  const speakFinalAssistantMessageRef = useRef<
    ((message: UIMessage) => void) | null
  >(null);

  // Per-id cache of timestamp-wrapped messages (see messagesWithTimestamps
  // below). Declared before useChat so onFinish can reuse pinned createdAt
  // values instead of minting fresh timestamps for streamed messages.
  const timestampedMessageCacheRef = useRef(
    new Map<
      string,
      { source: UIMessage; createdAt: Date; wrapped: AIChatMessage }
    >()
  );

  // --- AI Chat Hook (Vercel AI SDK v6) ---
  // Attach to the shared module-level Chat (see getSharedAiChat above).
  const {
    messages: currentSdkMessages,
    status,
    error,
    stop: sdkStop,
    clearError,
    setMessages: setSdkMessages,
    sendMessage,
    regenerate: sdkRegenerate,
    addToolOutput,
  } = useChat<AIChatMessage>({
    chat: getSharedAiChat(),
    experimental_throttle: 50,
  });

  const chatIdentity =
    username && isAuthenticated ? username.toLowerCase() : null;
  const previousChatIdentityRef = useRef(chatIdentity);
  useEffect(() => {
    if (previousChatIdentityRef.current === chatIdentity) return;
    previousChatIdentityRef.current = chatIdentity;
    sharedRequestOwner = null;
    sdkStop();
    clearError();
    setSdkMessages(useChatsStore.getState().aiMessages);
  }, [chatIdentity, sdkStop, clearError, setSdkMessages]);

  // --- Shared chat lifecycle handlers -------------------------------------
  // Defined as plain closures (not useCallback) and snapshotted into
  // handlersRef on every render, so the shared chat always invokes the
  // latest instance scope without giant dependency arrays.
  // Client-side tool execution requires returning output to the chat.
  // The heavy lifting lives in the shared dispatcher (dispatchToolCall) so the
  // floating desktop assistant can reuse the exact same tool handlers.
  const handleSharedToolCall: SharedOnToolCall = async ({ toolCall }) => {
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


  const handleSharedFinish: SharedOnFinish = ({ messages, isError }) => {
      const currentAuth = useChatsStore.getState();
      const currentOwner =
        currentAuth.username && currentAuth.isAuthenticated
          ? currentAuth.username.toLowerCase()
          : null;
      if (sharedRequestOwner !== currentOwner) {
        log.debug("Ignoring response from a previous chat identity");
        return;
      }
      if (sharedRequestOwner) {
        invalidateAIConversationSession("chat", sharedRequestOwner);
      }

      // Ensure all messages have metadata with createdAt. Prefer the
      // timestamp pinned while the message was streaming so it doesn't jump
      // to the finish time.
      const finalMessages: AIChatMessage[] = (messages as UIMessage[]).map(
        (msg) =>
          ({
            ...msg,
            metadata: {
              createdAt:
                (msg as AIChatMessage).metadata?.createdAt ||
                timestampedMessageCacheRef.current.get(msg.id)?.createdAt ||
                new Date(),
            },
          }) as AIChatMessage,
      );
      log.debug("AI finished, syncing messages", {
        isError,
        ...summarizeChatMessages(finalMessages),
      });
      setAiMessages(finalMessages);

      const lastMsg = finalMessages.at(-1);
      if (!lastMsg || lastMsg.role !== "assistant") return;

      // Recovery for AI SDK v6 bug (GitHub issue #10291):
      // When stopWhen + tool calls trigger a TypeValidationError, the SDK
      // sets isError=true and skips the built-in sendAutomaticallyWhen check.
      // For server-side tools whose results arrived via the stream, we need
      // to re-affirm them via addToolOutput so sendAutomaticallyWhen fires.
      // Only target server-side tools (client-side tools already called
      // addToolOutput from their handlers, so they don't need recovery).
      if (isError) {
        const toolParts = lastMsg.parts.filter(
          (part: { type?: string; state?: string }) =>
            typeof part.type === "string" &&
            part.type.startsWith("tool-") &&
            (part.state === "output-available" ||
              part.state === "output-error") &&
            SERVER_EXECUTED_TOOL_NAME_SET.has((part.type as string).replace(/^tool-/, "")),
        );
        if (toolParts.length > 0) {
          log.debug("Re-affirming server-side tool outputs after stream error", {
            toolPartCount: toolParts.length,
          });
          for (const part of toolParts) {
            const tp = part as {
              type: string;
              toolCallId: string;
              state: string;
              output?: unknown;
              errorText?: string;
            };
            const toolName = tp.type.replace(/^tool-/, "");
            if (tp.state === "output-error") {
              addToolOutput({
                tool: toolName,
                toolCallId: tp.toolCallId,
                state: "output-error",
                errorText: tp.errorText || "Tool execution failed",
              });
            } else {
              addToolOutput({
                tool: toolName,
                toolCallId: tp.toolCallId,
                output: tp.output,
              });
            }
          }
        }
      }

      void shouldShowNativeToastNotification().then((shouldShowDesktop) => {
        if (!isChatsInForeground() || shouldShowDesktop) {
          showBackgroundedMessageNotification(lastMsg);
        }
      });

      speakFinalAssistantMessageRef.current?.(lastMsg);
    };

  const handleSharedError: SharedOnError = (err) => {
      // Workaround for AI SDK v6 bug with stopWhen and tool calls (GitHub issue #10291)
      // The finish event emits {"type":"finish","finishReason":"tool-calls"} which fails validation
      // This is a known issue and the error can be safely ignored as the chat still works
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (
        errorMessage.includes("AI_TypeValidationError") ||
        errorMessage.includes("Type validation failed")
      ) {
        console.warn("[AI SDK v6 Bug] Type validation error (ignored):", errorMessage.substring(0, 100) + "...");
        return; // Ignore this error - it's a known SDK issue
      }

      console.error("AI Chat Error:", err);
      // Structured context for the Debug console overlay: the failing message
      // states usually explain server-side 400s (e.g. invalid_messages).
      log.error(
        "AI chat request failed",
        summarizeChatMessages(getSharedAiChat().messages)
      );

      // Helper function to handle authentication errors consistently
      const handleAuthError = (message?: string) => {
        console.error("Authentication error - clearing invalid session");

        // Clear auth state (cookie will be cleared server-side on next request)
        useChatsStore.getState().setAuthenticated(false);

        // Show user-friendly error message with action button
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description:
            message || i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 5000,
          action: onPromptSetUsername
            ? {
                label: i18n.t("apps.chats.toasts.loginButton"),
                onClick: onPromptSetUsername,
              }
            : undefined,
        });

        // Prompt for username
        setNeedsUsername(true);
      };

      // Check if this is a rate limit error (status 429)
      // The AI SDK wraps errors in a specific format
      if (err.message) {
        // Try to extract the JSON error body from the error message
        // The AI SDK typically includes the response body in the error message
        const jsonMatch = err.message.match(/\{.*\}/);

        if (jsonMatch) {
          try {
            const errorData = JSON.parse(jsonMatch[0]);

            if (errorData.error === "rate_limit_exceeded") {
              setRateLimitError(errorData);

              // If anonymous user hit limit, set flag to require username
              if (!errorData.isAuthenticated) {
                setNeedsUsername(true);
              }

              // Don't show the raw error, just indicate that rate limit was hit
              // The UI will handle showing the proper message
              return; // Exit early to prevent showing generic error toast
            }

            // Handle authentication failed error
            if (
              errorData.error === "authentication_failed" ||
              errorData.error === "unauthorized" ||
              errorData.error === "username mismatch"
            ) {
              handleAuthError(i18n.t("apps.chats.toasts.sessionExpiredLoginAgain"));
              return; // Exit early to prevent showing generic error toast
            }
          } catch (parseError) {
            console.error("Failed to parse error response:", parseError);
          }
        }

        // Check if error message contains 429 status
        if (
          err.message.includes("429") ||
          err.message.includes("rate_limit_exceeded")
        ) {
          // Generic rate limit message if we couldn't parse the details
          setNeedsUsername(true);
          toast.error(i18n.t("apps.chats.toasts.rateLimitExceeded"), {
            description: i18n.t("apps.chats.toasts.rateLimitMessageLimitLogin"),
            duration: 5000,
            action: onPromptSetUsername
              ? {
                  label: i18n.t("apps.chats.toasts.loginButton"),
                  onClick: onPromptSetUsername,
                }
              : undefined,
          });
          return;
        }

        // Check if error message contains 401 status (authentication error)
        // This catches various 401 error formats
        if (
          err.message.includes("401") ||
          err.message.includes("Unauthorized") ||
          err.message.includes("unauthorized") ||
          err.message.includes("authentication_failed") ||
          err.message.includes("Authentication failed") ||
          err.message.includes("username mismatch") ||
          err.message.includes("Username mismatch")
        ) {
          handleAuthError();
          return;
        }
      }

      // For non-rate-limit errors, show the generic error toast
      toast.error(i18n.t("apps.chats.toasts.aiError"), {
        description:
          err.message || i18n.t("apps.chats.toasts.failedToGetResponse"),
      });
    };

  // Register this instance's handlers with the shared chat. The chats app
  // (identified by passing onPromptSetUsername) is "primary" and takes
  // precedence over the terminal's "secondary" registration, so dialogs and
  // rate-limit state land in the UI that displays them.
  const sharedHandlersRef = useRef<SharedAiChatHandlers>({
    onToolCall: handleSharedToolCall,
    onFinish: handleSharedFinish,
    onError: handleSharedError,
  });
  sharedHandlersRef.current = {
    onToolCall: handleSharedToolCall,
    onFinish: handleSharedFinish,
    onError: handleSharedError,
  };
  const sharedHandlerRole: SharedHandlerRole = onPromptSetUsername
    ? "primary"
    : "secondary";
  useEffect(() => {
    sharedHandlerRegistry.set(sharedHandlerRole, sharedHandlersRef);
    return () => {
      if (sharedHandlerRegistry.get(sharedHandlerRole) === sharedHandlersRef) {
        sharedHandlerRegistry.delete(sharedHandlerRole);
      }
    };
  }, [sharedHandlerRole]);

  // Ensure all messages have metadata with timestamps (runs synchronously during render).
  // The per-id cache keeps referential identity stable across streaming ticks:
  // only messages whose underlying SDK object changed get a new wrapper, so
  // memoized message rows don't re-render ~20x/sec for the whole thread while
  // one message (e.g. a long applet) is streaming. It also pins `createdAt`
  // for messages that arrive without metadata instead of minting a new Date
  // on every render.
  const messagesWithTimestamps = useMemo<AIChatMessage[]>(() => {
    const previousCache = timestampedMessageCacheRef.current;
    const nextCache = new Map<
      string,
      { source: UIMessage; createdAt: Date; wrapped: AIChatMessage }
    >();
    const storeCreatedAtById = new Map<string, Date>();
    for (const m of aiMessages) {
      if (m.metadata?.createdAt) {
        storeCreatedAtById.set(m.id, m.metadata.createdAt);
      }
    }

    const result = (currentSdkMessages as UIMessage[]).map((msg) => {
      const currentMsg = msg as AIChatMessage;
      const cached = previousCache.get(msg.id);
      const createdAt =
        currentMsg.metadata?.createdAt ||
        cached?.createdAt ||
        storeCreatedAtById.get(msg.id) ||
        new Date();

      if (cached && cached.source === msg && cached.createdAt === createdAt) {
        nextCache.set(msg.id, cached);
        return cached.wrapped;
      }

      const wrapped =
        currentMsg.metadata?.createdAt === createdAt
          ? currentMsg
          : ({
              ...msg,
              metadata: {
                ...currentMsg.metadata,
                createdAt,
              },
            } as AIChatMessage);
      nextCache.set(msg.id, { source: msg, createdAt, wrapped });
      return wrapped;
    });

    timestampedMessageCacheRef.current = nextCache;
    return result;
  }, [currentSdkMessages, aiMessages]);

  // Ref to hold the latest SDK messages for use in callbacks
  const currentSdkMessagesRef = useRef<AIChatMessage[]>([]);
  currentSdkMessagesRef.current = messagesWithTimestamps;

  useSyncedAiMessages({
    aiMessages,
    currentMessages: currentSdkMessages as UIMessage[],
    setMessages: setSdkMessages as (messages: AIChatMessage[]) => void,
  });

  const applyServerMessages = useCallback(
    (messages: AIChatMessage[]) => {
      const nextMessages =
        messages.length > 0 ? messages : [createInitialChatMessage()];
      // Hydration replaces the live SDK messages wholesale — log it so races
      // with in-flight tool approvals are visible in debug traces.
      log.debug(
        "Applying server conversation snapshot",
        summarizeChatMessages(nextMessages)
      );
      setAiMessages(nextMessages);
      setSdkMessages(nextMessages);
    },
    [setAiMessages, setSdkMessages]
  );

  // Server conversation sync: hydration on sign-in, focus/visibility
  // refresh, and realtime cross-device updates (turn committed, greeting,
  // clear) — all applied through applyServerMessages.
  useServerAIConversation({
    channel: "chat",
    username,
    isAuthenticated,
    // Not "ready" while an approval-gated tool is being settled: hydration
    // would overwrite the locally recorded Allow with the server's stale
    // approval-requested snapshot, corrupting the eventual tool output part.
    isChatReady: () =>
      getSharedAiChat().status === "ready" &&
      !hasUnsettledApprovalGatedActivity(getSharedAiChat().messages),
    applyMessages: applyServerMessages,
    onError: (error, context) => {
      log.error(`Failed to sync server conversation (${context})`, error);
    },
  });

  const isLoading = status === "streaming" || status === "submitted";
  const [imageUploadProgress, setImageUploadProgress] = useState<number | null>(
    null
  );
  const imageUploadAbortRef = useRef<AbortController | null>(null);
  const isUploadingImage = imageUploadProgress !== null;
  const retryLastUserMessage = useCallback((): Promise<void> => {
    const messages = getSharedAiChat().messages;
    let latestUserMessage: AIChatMessage | undefined;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") {
        latestUserMessage = messages[index];
        break;
      }
    }
    if (!latestUserMessage) return Promise.resolve();

    const identity = captureChatSubmissionIdentity();
    const owner = identity.isAuthenticated ? identity.username : null;
    if (owner) {
      invalidateAIConversationSession("chat", owner);
    }
    return sendMessage(
      {
        role: "user",
        parts: latestUserMessage.parts,
        metadata: latestUserMessage.metadata,
        messageId: latestUserMessage.id,
      },
      { body: buildChatRequestBody() }
    );
  }, [sendMessage]);
  const {
    highlightSegment,
    isSpeaking,
    markAssistantMessageProcessed,
    resetSpeechState,
    speakAssistantMessageManually,
    speakFinalAssistantMessage,
    stopSpeech,
  } = useChatSpeechSync({
    aiMessages,
    currentMessages: currentSdkMessages as UIMessage[],
    isLoading,
    speechEnabled,
  });
  speakFinalAssistantMessageRef.current = speakFinalAssistantMessage;

  // Clear rate limit error when username is set
  useEffect(() => {
    if (username && needsUsername) {
      setNeedsUsername(false);
      setRateLimitError(null);
    }
  }, [username, needsUsername]);

  // --- Action Handlers ---
  const handleSubmitMessage = useCallback(
    async (messageContent: string, imageContent: string | null = null) => {
      const submissionIdentity = captureChatSubmissionIdentity();
      if (!messageContent.trim() && !imageContent) return false; // Don't submit empty messages

      // Check if user needs to set username before submitting
      if (needsUsername && !submissionIdentity.username) {
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description: i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 3000,
        });
        return false;
      }

      // Check if user is authenticated (cookies handle auth automatically)
      if (
        submissionIdentity.username &&
        !submissionIdentity.isAuthenticated
      ) {
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description: i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 3000,
        });
        return false;
      }

      // Clear any previous rate limit errors on new submission attempt
      setRateLimitError(null);

      // Proceed with the actual submission using useChat v5
      const freshSystemState = getSystemState();
      log.debug("Submitting AI chat", {
        model: aiModel,
        hasImage: Boolean(imageContent),
        systemStateSummary: {
          username: Boolean(freshSystemState.username),
          foregroundApp: freshSystemState.runningApps.foreground?.appId ?? null,
          backgroundAppCount: freshSystemState.runningApps.background.length,
          textEditInstanceCount: freshSystemState.textEdit.instances.length,
          hasInternetExplorerMarkdown: Boolean(
            freshSystemState.internetExplorer.aiGeneratedMarkdown
          ),
          hasIpodLyrics: Boolean(freshSystemState.ipod.currentLyrics),
        },
      });

      // Host iframe: delegate planning to parent when available (no image path)
      if (!imageContent) {
        const delegated = tryInvokeParentStartGrindPlanning({
          text: messageContent,
          model: aiModel,
          systemState: freshSystemState,
        });
        if (delegated) {
          return true;
        }
      }

      let requestBody: Awaited<ReturnType<typeof buildChatRequestBody>>;
      try {
        requestBody = await buildChatRequestBody(freshSystemState, aiModel);
      } catch (requestError) {
        log.error("Failed to prepare server conversation", requestError);
        toast.error(i18n.t("apps.chats.toasts.aiError"), {
          description: i18n.t("apps.chats.toasts.failedToGetResponse"),
        });
        return false;
      }

      // Build message content - text and optionally image
      if (imageContent) {
        let image = {
          mediaType:
            imageContent.match(/^data:([^;]+);base64,/)?.[1] ?? "image/png",
          url: imageContent,
        };
        if (
          submissionIdentity.username &&
          submissionIdentity.isAuthenticated
        ) {
          if (!isChatSubmissionIdentityCurrent(submissionIdentity)) {
            return false;
          }
          const uploadController = new AbortController();
          imageUploadAbortRef.current = uploadController;
          setImageUploadProgress(0);
          try {
            image = await uploadAIConversationImage(imageContent, {
              signal: uploadController.signal,
              onProgress: (progress) => {
                setImageUploadProgress(
                  Math.max(0, Math.min(100, progress.percentage))
                );
              },
            });
            // Hold the uploading UI through send handoff so the stop button
            // does not flicker back to send between upload end and streaming.
            setImageUploadProgress(100);
          } catch (error) {
            setImageUploadProgress(null);
            if (error instanceof DOMException && error.name === "AbortError") {
              return false;
            }
            if (error instanceof Error && error.name === "AbortError") {
              return false;
            }
            log.error("Failed to upload chat image", error);
            toast.error(i18n.t("apps.chats.toasts.aiError"), {
              description: i18n.t("apps.chats.toasts.failedToGetResponse"),
            });
            return false;
          } finally {
            if (imageUploadAbortRef.current === uploadController) {
              imageUploadAbortRef.current = null;
            }
          }
        }
        if (!isChatSubmissionIdentityCurrent(submissionIdentity)) {
          setImageUploadProgress(null);
          return false;
        }

        // Send message with image attachment using files array
        try {
          sendMessage(
            {
              text: messageContent.trim() || t("apps.chats.status.describeThisImage"),
              files: [
                {
                  type: "file" as const,
                  mediaType: image.mediaType,
                  url: image.url,
                },
              ],
              metadata: {
                createdAt: new Date(),
              },
            },
            {
              body: requestBody,
            },
          );
        } finally {
          setImageUploadProgress(null);
        }
      } else {
        // Send text-only message
        if (!isChatSubmissionIdentityCurrent(submissionIdentity)) {
          return false;
        }
        sendMessage(
          {
            text: messageContent,
            metadata: {
              createdAt: new Date(),
            },
          },
          {
            body: requestBody,
          },
        );
      }
      return true;
    },
    [
      sendMessage,
      needsUsername,
      aiModel,
      t,
    ],
  );

  const handleDirectMessageSubmit = useCallback(
    async (message: string) => {
      const submissionIdentity = captureChatSubmissionIdentity();
      if (!message.trim()) return; // Don't submit empty messages

      // Check if user needs to set username before submitting
      if (needsUsername && !submissionIdentity.username) {
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description: i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 3000,
        });
        return;
      }

      // Check if user is authenticated (cookies handle auth automatically)
      if (
        submissionIdentity.username &&
        !submissionIdentity.isAuthenticated
      ) {
        toast.error(i18n.t("apps.chats.toasts.loginRequired"), {
          description: i18n.t("apps.chats.toasts.pleaseLoginToContinueChatting"),
          duration: 3000,
        });
        return;
      }

      // Clear any previous rate limit errors on new submission attempt
      setRateLimitError(null);

      const delegated = tryInvokeParentStartGrindPlanning({
        text: message,
        model: aiModel,
        systemState: getSystemState(),
      });
      if (delegated) {
        return;
      }

      // Proceed with the actual submission using useChat v5
      log.debug("Sending direct message to AI chat", { model: aiModel });
      let requestBody: Awaited<ReturnType<typeof buildChatRequestBody>>;
      try {
        requestBody = await buildChatRequestBody(getSystemState(), aiModel);
      } catch (requestError) {
        log.error("Failed to prepare server conversation", requestError);
        toast.error(i18n.t("apps.chats.toasts.aiError"), {
          description: i18n.t("apps.chats.toasts.failedToGetResponse"),
        });
        return;
      }
      if (!isChatSubmissionIdentityCurrent(submissionIdentity)) {
        return;
      }
      sendMessage(
        {
          text: message,
          metadata: {
            createdAt: new Date(),
          },
        },
        {
          body: requestBody,
        },
      );
    },
    [sendMessage, needsUsername, aiModel],
  );

  const handleNudge = useCallback(() => {
    handleDirectMessageSubmit(t("apps.chats.status.nudgeSent"));
    // Consider adding shake effect trigger here if needed
  }, [handleDirectMessageSubmit, t]);

  const clearChats = useCallback(async () => {
    const liveMessages = [...getSharedAiChat().messages];
    log.debug("Clearing AI chats", {
      messageCount: liveMessages.length,
    });

    // Stop any in-flight stream first. Otherwise the AI SDK keeps appending to
    // its message list after we reset it below, and `useSyncedAiMessages`
    // refuses to overwrite a longer SDK list with the cleared store snapshot —
    // making the old conversation reappear right after "Clear Chat".
    sdkStop();

    if (username && isAuthenticated) {
      try {
        await resetAIConversationSession({
          channel: "chat",
          username,
        });
      } catch (resetError) {
        log.error("Failed to reset server conversation", resetError);
        toast.error(i18n.t("apps.chats.toasts.aiError"), {
          description: i18n.t("apps.chats.toasts.failedToGetResponse"),
        });
        return;
      }
    }

    // Clear the AI SDK error state (e.g. the inline red error / retry block).
    // Without this, a previous failed turn's error stays visible after clearing.
    clearError();

    // Clear the non-SDK error channels surfaced below the input so the footer
    // doesn't keep showing a stale rate-limit / login prompt after clearing.
    setRateLimitError(null);
    setNeedsUsername(false);

    // Reset speech and highlight state so the next reply starts clean.
    resetSpeechState();

    // Define the initial message and mark it as fully processed so it is never spoken
    const initialMessage = createInitialChatMessage();
    markAssistantMessageProcessed(initialMessage);

    // Update both the Zustand store and the SDK state directly
    setAiMessages([initialMessage]);
    setSdkMessages([initialMessage]);
  }, [
    setAiMessages,
    setSdkMessages,
    sdkStop,
    clearError,
    setRateLimitError,
    setNeedsUsername,
    resetSpeechState,
    markAssistantMessageProcessed,
    username,
    isAuthenticated,
  ]);

  const confirmClearChats = useCallback(() => {
    setIsClearDialogOpen(false);
    // Add small delay for dialog close animation
    setTimeout(() => {
      void clearChats();
    }, 100);
  }, [clearChats]);

  const handleSaveTranscript = useCallback(() => {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .toLowerCase()
      .replace(":", "-")
      .replace(" ", "");
    setSaveFileName(`chat-${date}-${time}.md`);
    setIsSaveDialogOpen(true);
  }, []);

  const handleSaveSubmit = useCallback(
    async (fileName: string) => {
      // Use messagesWithTimestamps from ref to get messages with proper timestamps
      const messagesForTranscript = currentSdkMessagesRef.current;
      const transcript = messagesForTranscript
        .map((msg: AIChatMessage) => {
          const createdAt = msg.metadata?.createdAt;
          const time = createdAt
            ? new Date(createdAt).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
            : "";
          const sender = msg.role === "user" ? username || "You" : "Ryo";
          const content = getAssistantVisibleText(msg);
          return `**${sender}** (${time}):\n${content}`;
        })
        .join("\n\n");

      const finalFileName = fileName.endsWith(".md")
        ? fileName
        : `${fileName}.md`;
      const filePath = `/Documents/${finalFileName}`;

      // Check if file already exists to determine toast message
      const existingFile = useFilesStore.getState().items[filePath];
      const isUpdate = existingFile && existingFile.status === "active";

      try {
        await saveFile({
          path: filePath,
          name: finalFileName,
          content: transcript,
          type: "markdown", // Explicitly set type
          icon: "/icons/file-text.png",
        });

        setIsSaveDialogOpen(false);
        toast.success(
          isUpdate
            ? i18n.t("apps.chats.toasts.transcriptUpdated")
            : i18n.t("apps.chats.toasts.transcriptSaved"),
          {
            description: i18n.t("apps.chats.toasts.savedToFileName", {
              fileName: finalFileName,
            }),
            duration: 5000,
            action: {
              label: i18n.t("apps.chats.toasts.open"),
              onClick: () => {
              // Check if this file is already open in a TextEdit instance
              const textEditStore = useTextEditStore.getState();
              const existingInstanceId = textEditStore.getInstanceIdByPath(filePath);

              if (existingInstanceId) {
                // Verify the instance actually exists in AppStore
                const appStore = useAppStore.getState();
                const instanceExists = !!appStore.instances[existingInstanceId];

                if (instanceExists) {
                  // File is already open - update content and bring to foreground
                  appStore.updateInstanceInitialData(existingInstanceId, {
                    path: filePath,
                    content: transcript,
                  });
                  appStore.bringInstanceToForeground(existingInstanceId);
                } else {
                  // Stale instance reference - clean it up and open new instance
                  textEditStore.removeInstance(existingInstanceId);
                  launchApp("textedit", {
                    initialData: { path: filePath, content: transcript },
                  });
                }
              } else {
                // File not open - launch new TextEdit instance
                launchApp("textedit", {
                  initialData: { path: filePath, content: transcript },
                });
              }
            },
          },
        });
      } catch (error) {
        console.error("Error saving transcript:", error);
        toast.error(i18n.t("apps.chats.toasts.failedToSaveTranscript"), {
          description:
            error instanceof Error
              ? error.message
              : i18n.t("apps.chats.toasts.unknownError"),
        });
      }
    },
    [username, saveFile, launchApp],
  );

  // Stop image upload, chat streaming, and TTS queue
  const stop = useCallback(() => {
    imageUploadAbortRef.current?.abort();
    imageUploadAbortRef.current = null;
    setImageUploadProgress(null);
    sdkStop();
    stopSpeech();
  }, [sdkStop, stopSpeech]);

  const getLiveMessages = useCallback(
    () => currentSdkMessagesRef.current,
    []
  );

  const patchLiveMessages = useCallback(
    (messages: AIChatMessage[]) => {
      setSdkMessages(messages);
    },
    [setSdkMessages]
  );

  return {
    // AI Chat State & Actions
    messages: messagesWithTimestamps, // Return messages with timestamps
    handleSubmitMessage,
    isLoading,
    isUploadingImage,
    imageUploadProgress,
    retryLastUserMessage,
    regenerateAssistantMessage: sdkRegenerate,
    error,
    stop,
    sendMessage,
    handleDirectMessageSubmit,
    handleNudge,
    clearChats, // Expose the action
    handleSaveTranscript, // Expose the action


    // Rate limit state
    rateLimitError,
    needsUsername,

    // Dialogs
    isClearDialogOpen,
    setIsClearDialogOpen,
    confirmClearChats,

    isSaveDialogOpen,
    setIsSaveDialogOpen,
    saveFileName,
    setSaveFileName,
    handleSaveSubmit,

    isSpeaking,

    highlightSegment,
    speakAssistantMessageManually,
    stopSpeech,

    getLiveMessages,
    patchLiveMessages,
  };
}
