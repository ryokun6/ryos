import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { AppProps } from "../../../base/types";
import type { ChatsInitialData } from "../../../base/types";
import { ChatsMenuBar } from "../ChatsMenuBar";
import { helpItems } from "../..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useChatRoom } from "../../hooks/useChatRoom";
import { useAiChat } from "../../hooks/useAiChat";
import { useAuth } from "@/hooks/useAuth";
import {
  type ChatMessage as AppChatMessage,
  type ChatRoom,
} from "@/types/chat";
import { useRyoChat } from "../../hooks/useRyoChat";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { toast } from "sonner";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useOffline } from "@/hooks/useOffline";
import { checkOfflineAndShowError } from "@/utils/offline";
import { useTranslation } from "react-i18next";
import {
  buildDisplayMessages,
  extractPreviousUserMessages,
} from "../../utils/messages";
import { useChatsFrameLayout } from "../../hooks/useChatsFrameLayout";
import { useProactiveGreeting } from "../../hooks/useProactiveGreeting";
import { useTelegramLink } from "@/hooks/useTelegramLink";
import { useGlobalPresence } from "@/hooks/useGlobalPresence";
import { useChatsStore } from "@/stores/useChatsStore";

export type UseChatsAppControllerArgs = AppProps;

export function useChatsAppController({
  isWindowOpen,
  onClose,
  initialData: rawInitialData,
}: UseChatsAppControllerArgs) {
  const initialData = rawInitialData as ChatsInitialData | undefined;
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("chats", helpItems);
  const aiMessageCount = useChatsStore((state) => state.aiMessages.length);
  const aiMessages = useChatsStore((state) => state.aiMessages);

  const authResult = useAuth();
  const { promptSetUsername } = authResult;

  const chatRoomResult = useChatRoom(isWindowOpen ?? false, promptSetUsername);

  const {
    messages,
    handleSubmitMessage: submitAiMessage,
    isLoading,
    reload,
    error,
    stop,
    isSpeaking,
    handleDirectMessageSubmit,
    handleNudge,
    handleSaveTranscript,
    isClearDialogOpen,
    setIsClearDialogOpen,
    confirmClearChats,
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    saveFileName,
    setSaveFileName,
    handleSaveSubmit,
    highlightSegment,
    speakAssistantMessageManually,
    stopSpeech,
    rateLimitError,
    needsUsername,
  } = useAiChat(promptSetUsername);

  const {
    username,
    isAuthenticated,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    hasPassword,
    setPassword,
    logout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
  } = authResult;

  const {
    rooms,
    currentRoomId,
    currentRoomMessages,
    currentRoomMessagesLimited,
    isSidebarVisible,
    isAdmin,
    currentRoomTypingUsers,
    emitTyping,
    handleRoomSelect,
    sendRoomMessage,
    toggleSidebarVisibility,
    handleAddRoom,
    promptAddRoom,
    promptDeleteRoom,
    isNewRoomDialogOpen,
    setIsNewRoomDialogOpen,
    isDeleteRoomDialogOpen,
    setIsDeleteRoomDialogOpen,
    roomToDelete,
    confirmDeleteRoom,
  } = chatRoomResult;

  const globalOnlineUsers = useGlobalPresence();

  const { isLoadingGreeting, triggerGreeting } = useProactiveGreeting();
  const [inputPrefillMessage, setInputPrefillMessage] = useState<string | null>(
    null
  );
  const [inputResetTrigger, setInputResetTrigger] = useState(0);

  const handleConfirmClearChats = useCallback(() => {
    confirmClearChats();
    setInputResetTrigger((prev) => prev + 1);
    setTimeout(() => {
      triggerGreeting();
    }, 200);
  }, [confirmClearChats, triggerGreeting]);

  const fontSize = useChatsStore((state) => state.fontSize);
  const setFontSize = useChatsStore((state) => state.setFontSize);
  const messageRenderLimit = useChatsStore((state) => state.messageRenderLimit);

  const [isShaking, setIsShaking] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [scrollToBottomTrigger, setScrollToBottomTrigger] = useState(0);

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [prefilledUser, setPrefilledUser] = useState<string>("");

  const prefillAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      initialData?.prefillMessage &&
      initialData.prefillMessage !== prefillAppliedRef.current
    ) {
      prefillAppliedRef.current = initialData.prefillMessage;

      if (currentRoomId) {
        handleRoomSelect(null);
      }

      if (initialData.autoSend) {
        handleDirectMessageSubmit(initialData.prefillMessage);
      } else {
        setInputPrefillMessage(initialData.prefillMessage);
      }
    }
  }, [
    initialData?.prefillMessage,
    initialData?.autoSend,
    handleDirectMessageSubmit,
    currentRoomId,
    handleRoomSelect,
  ]);

  const currentRoom =
    Array.isArray(rooms) && currentRoomId
      ? rooms.find((r: ChatRoom) => r.id === currentRoomId)
      : null;

  const usersList =
    currentRoom?.type !== "private" ? currentRoom?.users ?? [] : [];
  const maxDisplayNames = 3;
  const displayNames = usersList.slice(0, maxDisplayNames);
  const remainingCount = usersList.length - displayNames.length;
  const tooltipText =
    displayNames.join(", ") +
    (remainingCount > 0 ? `, ${remainingCount}+` : "");

  const ryoRoomMessages = useMemo(
    () =>
      currentRoomMessages?.map((msg: AppChatMessage) => ({
        username: msg.username,
        content: msg.content,
        userId: msg.id,
        timestamp: new Date(msg.timestamp).toISOString(),
      })),
    [currentRoomMessages]
  );

  const handleRyoScrollToBottom = useCallback(() => {
    setScrollToBottomTrigger((prev) => prev + 1);
  }, []);

  const { isRyoLoading, stopRyo, handleRyoMention, detectAndProcessMention } =
    useRyoChat({
      currentRoomId,
      onScrollToBottom: handleRyoScrollToBottom,
      roomMessages: ryoRoomMessages,
    });

  const handleRoomSelectWithScroll = useCallback(
    (roomId: string | null) => {
      handleRoomSelect(roomId).then((result) => {
        if (result?.hadUnreads) {
          console.log(
            `[ChatsApp] Triggering scroll for room with unreads: ${roomId}`
          );
          setScrollToBottomTrigger((prev) => prev + 1);
        }
      });
    },
    [handleRoomSelect]
  );

  const sidebarVisibleBool = isSidebarVisible ?? false;

  const handleMobileRoomSelect = useCallback(
    (room: ChatRoom | null) => {
      handleRoomSelectWithScroll(room ? room.id : null);
      if (sidebarVisibleBool) {
        toggleSidebarVisibility();
      }
    },
    [handleRoomSelectWithScroll, sidebarVisibleBool, toggleSidebarVisibility]
  );

  const handleSubmit = useCallback(
    async (messageText: string, imageData: string | null) => {
      if (checkOfflineAndShowError(t("apps.chats.status.chatRequiresInternet"))) {
        return false;
      }

      if (currentRoomId && username) {
        const trimmedInput = messageText.trim();

        const { isMention, messageContent } =
          detectAndProcessMention(trimmedInput);

        if (isMention) {
          sendRoomMessage(messageText);
          handleRyoMention(messageContent);
          setScrollToBottomTrigger((prev) => prev + 1);
          return true;
        } else {
          sendRoomMessage(messageText);
          setScrollToBottomTrigger((prev) => prev + 1);
          return true;
        }
      } else {
        const didSubmit = await submitAiMessage(messageText, imageData);
        if (didSubmit) {
          setScrollToBottomTrigger((prev) => prev + 1);
        }
        return didSubmit;
      }
    },
    [
      currentRoomId,
      username,
      sendRoomMessage,
      submitAiMessage,
      t,
      handleRyoMention,
      detectAndProcessMention,
    ]
  );

  const handleDirectSubmit = useCallback(
    (message: string) => {
      if (currentRoomId && username) {
        sendRoomMessage(message);
      } else {
        handleDirectMessageSubmit(message);
      }
    },
    [currentRoomId, username, sendRoomMessage, handleDirectMessageSubmit]
  );

  const handleNudgeClick = useCallback(() => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 400);
    handleNudge();
    setScrollToBottomTrigger((prev) => prev + 1);
  }, [handleNudge]);

  const handleStop = useCallback(() => {
    stop();
    stopRyo();
  }, [stop, stopRyo]);

  const handleIncreaseFontSize = useCallback(() => {
    setFontSize((prev) => Math.min(prev + 1, 24));
  }, [setFontSize]);

  const handleDecreaseFontSize = useCallback(() => {
    setFontSize((prev) => Math.max(prev - 1, 10));
  }, [setFontSize]);

  const handleResetFontSize = useCallback(() => {
    setFontSize(13);
  }, [setFontSize]);

  const messageCount = currentRoomId
    ? Array.isArray(currentRoomMessages)
      ? currentRoomMessages.length
      : 0
    : messages.length;

  const { containerRef, chatRootRef, messagesContainerRef, isFrameNarrow } =
    useChatsFrameLayout({
      currentRoomId,
      messageCount,
      isSidebarVisible: sidebarVisibleBool,
      onToggleSidebar: toggleSidebarVisibility,
    });

  const handleSetPassword = async (password: string) => {
    setIsSettingPassword(true);
    setPasswordError(null);

    if (!password || password.length < 8) {
      setPasswordError(t("apps.chats.dialogs.passwordMinLengthError"));
      setIsSettingPassword(false);
      return;
    }

    const result = await setPassword(password);

    if (result.ok) {
      toast.success(t("apps.chats.dialogs.passwordSetSuccess"), {
        description: t("apps.chats.dialogs.passwordSetSuccessDescription"),
      });
      setIsPasswordDialogOpen(false);
      setPasswordInput("");
    } else {
      setPasswordError(result.error || t("apps.chats.dialogs.passwordSetFailed"));
    }

    setIsSettingPassword(false);
  };

  const promptSetPassword = useCallback(() => {
    setPasswordInput("");
    setPasswordError(null);
    setIsPasswordDialogOpen(true);
  }, []);

  const handleSendMessage = useCallback(
    (targetUsername: string) => {
      setPrefilledUser(targetUsername);
      setIsNewRoomDialogOpen(true);
    },
    [setIsNewRoomDialogOpen]
  );

  const { isWindowsTheme: isXpTheme, isMacOSTheme: isMacTheme } =
    useThemeFlags();
  const isWindowsLegacyTheme = isXpTheme;
  const isOffline = useOffline();
  const {
    telegramLinkedAccount,
    telegramLinkSession,
    isTelegramStatusLoading,
    isCreatingTelegramLink,
    isDisconnectingTelegramLink,
    refreshTelegramLinkStatus,
    handleCreateTelegramLink,
    handleOpenTelegramLink,
    handleCopyTelegramCode,
    handleDisconnectTelegramLink,
  } = useTelegramLink({ username, isAuthenticated });

  const handleShowHelp = useCallback(() => {
    setIsHelpDialogOpen(true);
  }, []);

  const handleShowAbout = useCallback(() => {
    setIsAboutDialogOpen(true);
  }, []);

  const handleOpenClearDialog = useCallback(() => {
    setIsClearDialogOpen(true);
  }, [setIsClearDialogOpen]);

  const handleMenuRoomSelect = useCallback(
    (room: ChatRoom | null) => {
      handleRoomSelectWithScroll(room ? room.id : null);
    },
    [handleRoomSelectWithScroll]
  );

  const handlePromptDeleteRoom = useCallback(
    (room: ChatRoom) => {
      promptDeleteRoom(room);
    },
    [promptDeleteRoom]
  );

  const handleMessageDeleted = useCallback(
    (deletedId: string) => {
      if (currentRoomId) {
        useChatsStore
          .getState()
          .removeMessageFromRoom(currentRoomId, deletedId);
      }
    },
    [currentRoomId]
  );

  const handleTypingInCurrentRoom = useCallback(() => {
    if (currentRoomId) {
      emitTyping(currentRoomId);
    }
  }, [currentRoomId, emitTyping]);

  const handleLeaveCurrentRoom = useCallback(() => {
    if (currentRoom) {
      handlePromptDeleteRoom(currentRoom);
    }
  }, [currentRoom, handlePromptDeleteRoom]);

  const menuBar = useMemo(
    () => (
      <ChatsMenuBar
        onClose={onClose}
        onShowHelp={handleShowHelp}
        onShowAbout={handleShowAbout}
        onClearChats={handleOpenClearDialog}
        onSaveTranscript={handleSaveTranscript}
        onSetUsername={promptSetUsername}
        onToggleSidebar={toggleSidebarVisibility}
        isSidebarVisible={sidebarVisibleBool}
        onAddRoom={promptAddRoom}
        rooms={rooms}
        currentRoom={currentRoom ?? null}
        onRoomSelect={handleMenuRoomSelect}
        onIncreaseFontSize={handleIncreaseFontSize}
        onDecreaseFontSize={handleDecreaseFontSize}
        onResetFontSize={handleResetFontSize}
        username={username}
        isAuthenticated={isAuthenticated}
        onVerifyToken={promptVerifyToken}
        isVerifyDialogOpen={isVerifyDialogOpen}
        setVerifyDialogOpen={setVerifyDialogOpen}
        verifyPasswordInput={verifyPasswordInput}
        setVerifyPasswordInput={setVerifyPasswordInput}
        verifyUsernameInput={verifyUsernameInput}
        setVerifyUsernameInput={setVerifyUsernameInput}
        isVerifyingToken={isVerifyingToken}
        verifyError={verifyError}
        handleVerifyTokenSubmit={handleVerifyTokenSubmit}
        onLogout={logout}
        telegramLinkedAccount={telegramLinkedAccount}
        telegramLinkSession={telegramLinkSession}
        isTelegramStatusLoading={isTelegramStatusLoading}
        isCreatingTelegramLink={isCreatingTelegramLink}
        isDisconnectingTelegramLink={isDisconnectingTelegramLink}
        onRefreshTelegramLinkStatus={refreshTelegramLinkStatus}
        onCreateTelegramLink={handleCreateTelegramLink}
        onOpenTelegramLink={handleOpenTelegramLink}
        onCopyTelegramCode={handleCopyTelegramCode}
        onDisconnectTelegramLink={handleDisconnectTelegramLink}
      />
    ),
    [
      onClose,
      handleShowHelp,
      handleShowAbout,
      handleOpenClearDialog,
      handleSaveTranscript,
      promptSetUsername,
      toggleSidebarVisibility,
      sidebarVisibleBool,
      promptAddRoom,
      rooms,
      currentRoom,
      handleMenuRoomSelect,
      handleIncreaseFontSize,
      handleDecreaseFontSize,
      handleResetFontSize,
      username,
      isAuthenticated,
      promptVerifyToken,
      isVerifyDialogOpen,
      setVerifyDialogOpen,
      verifyPasswordInput,
      setVerifyPasswordInput,
      verifyUsernameInput,
      setVerifyUsernameInput,
      isVerifyingToken,
      verifyError,
      handleVerifyTokenSubmit,
      logout,
      telegramLinkedAccount,
      telegramLinkSession,
      isTelegramStatusLoading,
      isCreatingTelegramLink,
      isDisconnectingTelegramLink,
      refreshTelegramLinkStatus,
      handleCreateTelegramLink,
      handleOpenTelegramLink,
      handleCopyTelegramCode,
      handleDisconnectTelegramLink,
    ]
  );

  const previousUserMessages = useMemo(
    () => extractPreviousUserMessages(aiMessages),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aiMessageCount]
  );

  const currentMessagesToDisplay = useMemo(
    () =>
      buildDisplayMessages({
        currentRoomId,
        currentRoomMessagesLimited,
        aiMessages: messages,
        messageRenderLimit,
        username,
      }),
    [
      currentRoomId,
      currentRoomMessagesLimited,
      messages,
      messageRenderLimit,
      username,
    ]
  );

  const windowTitle = currentRoom
    ? currentRoom.type === "private"
      ? getPrivateRoomDisplayName(currentRoom, username)
      : `#${currentRoom.name}`
    : "@ryo";

  return {
    translatedHelpItems,
    isXpTheme,
    isMacTheme,
    isWindowsLegacyTheme,
    isOffline,
    menuBar,
    currentRoom,
    currentRoomId,
    username,
    isShaking,
    windowTitle,
    containerRef,
    chatRootRef,
    messagesContainerRef,
    isFrameNarrow,
    sidebarVisibleBool,
    toggleSidebarVisibility,
    handleMobileRoomSelect,
    handleMenuRoomSelect,
    handlePromptDeleteRoom,
    rooms,
    isAdmin,
    globalOnlineUsers,
    promptAddRoom,
    usersList,
    tooltipText,
    promptSetUsername,
    handleOpenClearDialog,
    handleLeaveCurrentRoom,
    currentMessagesToDisplay,
    isLoading,
    isRyoLoading,
    error,
    reload,
    handleMessageDeleted,
    fontSize,
    scrollToBottomTrigger,
    highlightSegment,
    isSpeaking,
    speakAssistantMessageManually,
    stopSpeech,
    handleSendMessage,
    isLoadingGreeting,
    currentRoomTypingUsers,
    needsUsername,
    handleSubmit,
    handleStop,
    handleDirectSubmit,
    handleNudgeClick,
    previousUserMessages,
    inputPrefillMessage,
    inputResetTrigger,
    rateLimitError,
    handleTypingInCurrentRoom,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isClearDialogOpen,
    setIsClearDialogOpen,
    handleConfirmClearChats,
    isSaveDialogOpen,
    setIsSaveDialogOpen,
    handleSaveSubmit,
    saveFileName,
    setSaveFileName,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    verifyUsernameInput,
    setVerifyUsernameInput,
    verifyPasswordInput,
    setVerifyPasswordInput,
    handleVerifyTokenSubmit,
    isVerifyingToken,
    verifyError,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    submitUsernameDialog,
    isSettingUsername,
    usernameError,
    isNewRoomDialogOpen,
    setIsNewRoomDialogOpen,
    setPrefilledUser,
    prefilledUser,
    handleAddRoom,
    isDeleteRoomDialogOpen,
    setIsDeleteRoomDialogOpen,
    confirmDeleteRoom,
    roomToDelete,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
    confirmLogout,
    hasPassword,
    promptSetPassword,
    isPasswordDialogOpen,
    setIsPasswordDialogOpen,
    handleSetPassword,
    passwordInput,
    setPasswordInput,
    isSettingPassword,
    passwordError,
    setPasswordError,
  };
}

export type ChatsAppController = ReturnType<typeof useChatsAppController>;
