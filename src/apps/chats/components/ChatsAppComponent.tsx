import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { AppProps } from "../../base/types";
import type { ChatsInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ChatsMenuBar } from "./ChatsMenuBar";
import { ChatsDialogs } from "./ChatsDialogs";
import { helpItems, appMetadata } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useChatRoom } from "../hooks/useChatRoom";
import { useAiChat } from "../hooks/useAiChat";
import { useAuth } from "@/hooks/useAuth";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { ChatRoomSidebar } from "./ChatRoomSidebar";
import { useChatsStore } from "@/stores/useChatsStore";
import {
  type ChatMessage as AppChatMessage,
  type ChatRoom,
} from "@/types/chat";
import { useRyoChat } from "../hooks/useRyoChat";
import { Button } from "@/components/ui/button";
import { CaretDown } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { toast } from "sonner";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useOffline } from "@/hooks/useOffline";
import { checkOfflineAndShowError } from "@/utils/offline";
import { useTranslation } from "react-i18next";
import {
  buildDisplayMessages,
  extractPreviousUserMessages,
} from "../utils/messages";
import { useChatsFrameLayout } from "../hooks/useChatsFrameLayout";
import { useProactiveGreeting } from "../hooks/useProactiveGreeting";
import { useTelegramLink } from "@/hooks/useTelegramLink";
import { useGlobalPresence } from "@/hooks/useGlobalPresence";

export function ChatsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData: rawInitialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const initialData = rawInitialData as ChatsInitialData | undefined;
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("chats", helpItems);
  const aiMessageCount = useChatsStore((state) => state.aiMessages.length);
  const aiMessages = useChatsStore((state) => state.aiMessages);

  // Use auth hook for authentication functionality
  const authResult = useAuth();
  const { promptSetUsername } = authResult;

  // Get room functionality from useChatRoom
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
    rateLimitError,
    needsUsername,
  } = useAiChat(promptSetUsername); // Pass promptSetUsername to useAiChat

  // Destructure auth properties from authResult
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

  // Destructure room properties from chatRoomResult
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

  // Proactive greeting for eligible users
  const { isLoadingGreeting, triggerGreeting } = useProactiveGreeting();
  const [inputPrefillMessage, setInputPrefillMessage] = useState<string | null>(
    null
  );
  const [inputResetTrigger, setInputResetTrigger] = useState(0);

  // Wrap confirmClearChats to trigger proactive greeting after clearing
  const handleConfirmClearChats = useCallback(() => {
    confirmClearChats();
    setInputResetTrigger((prev) => prev + 1);
    // Trigger proactive greeting after the chat is cleared (slight delay for state update)
    setTimeout(() => {
      triggerGreeting();
    }, 200);
  }, [confirmClearChats, triggerGreeting]);

  // Get font size state from store - select separately for optimization
  const fontSize = useChatsStore((state) => state.fontSize);
  const setFontSize = useChatsStore((state) => state.setFontSize);
  const messageRenderLimit = useChatsStore((state) => state.messageRenderLimit);

  const [isShaking, setIsShaking] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  // Add state to trigger scroll in ChatMessages
  const [scrollToBottomTrigger, setScrollToBottomTrigger] = useState(0);

  // Password dialog states
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Send message dialog state
  const [prefilledUser, setPrefilledUser] = useState<string>("");

  // Pre-fill (and optionally auto-send) chat input from initialData (e.g. from Spotlight search)
  const prefillAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      initialData?.prefillMessage &&
      initialData.prefillMessage !== prefillAppliedRef.current
    ) {
      prefillAppliedRef.current = initialData.prefillMessage;

      // Switch to @ryo channel if currently in a chat room
      if (currentRoomId) {
        handleRoomSelect(null);
      }

      if (initialData.autoSend) {
        // Auto-send directly using handleDirectMessageSubmit which takes the
        // message as a parameter, avoiding stale draft state.
        handleDirectMessageSubmit(initialData.prefillMessage);
      } else {
        // Just pre-fill the input field
        setInputPrefillMessage(initialData.prefillMessage);
      }
    }
  }, [initialData?.prefillMessage, initialData?.autoSend, handleDirectMessageSubmit, currentRoomId, handleRoomSelect]);

  // Safety check: ensure rooms is an array before finding
  const currentRoom =
    Array.isArray(rooms) && currentRoomId
      ? rooms.find((r: ChatRoom) => r.id === currentRoomId)
      : null;

  // Prepare tooltip text: display up to 3 users then show remaining count
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

  // Use the @ryo chat hook
  const { isRyoLoading, stopRyo, handleRyoMention, detectAndProcessMention } =
    useRyoChat({
      currentRoomId,
      onScrollToBottom: handleRyoScrollToBottom,
      roomMessages: ryoRoomMessages,
    });

  // Wrapper for room selection that handles unread scroll triggering
  const handleRoomSelectWithScroll = useCallback(
    (roomId: string | null) => {
      // Switch rooms immediately; perform scroll logic once the async operation completes.
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

  // Ensure isSidebarVisible is always boolean for child components
  const sidebarVisibleBool = isSidebarVisible ?? false;

  // Handler for mobile room selection that auto-dismisses the sidebar
  const handleMobileRoomSelect = useCallback(
    (room: ChatRoom | null) => {
      handleRoomSelectWithScroll(room ? room.id : null);
      // Auto-dismiss sidebar on mobile immediately after selecting a room
      if (sidebarVisibleBool) {
        toggleSidebarVisibility();
      }
    },
    [handleRoomSelectWithScroll, sidebarVisibleBool, toggleSidebarVisibility]
  );

  const handleSubmit = useCallback(
    async (messageText: string, imageData: string | null) => {
      // Check if offline and show error
      if (checkOfflineAndShowError(t("apps.chats.status.chatRequiresInternet"))) {
        return false;
      }

      if (currentRoomId && username) {
        const trimmedInput = messageText.trim();

        // Detect if this is an @ryo mention
        const { isMention, messageContent } =
          detectAndProcessMention(trimmedInput);

        if (isMention) {
          // Send the user's message to the chat room first (showing @ryo)
          sendRoomMessage(messageText);

          // Then send to AI (doesn't affect input clearing)
          handleRyoMention(messageContent);

          // Trigger scroll
          setScrollToBottomTrigger((prev) => prev + 1);
          return true;
        } else {
          // Regular room message
          sendRoomMessage(messageText);
          // Trigger scroll after sending room message
          setScrollToBottomTrigger((prev) => prev + 1);
          return true;
        }
      } else {
        // AI chat when not in a room
        const didSubmit = await submitAiMessage(messageText, imageData);
        if (didSubmit) {
          // Trigger scroll after submitting AI message
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
    // Trigger scroll after nudge
    setScrollToBottomTrigger((prev) => prev + 1);
  }, [handleNudge]);

  // Combined stop function for both AI chat and @ryo mentions
  const handleStop = useCallback(() => {
    stop(); // Stop regular AI chat
    stopRyo(); // Stop @ryo chat
  }, [stop, stopRyo]);

  // Font size handlers using store action
  const handleIncreaseFontSize = useCallback(() => {
    setFontSize((prev) => Math.min(prev + 1, 24)); // Increase font size, max 24px
  }, [setFontSize]);

  const handleDecreaseFontSize = useCallback(() => {
    setFontSize((prev) => Math.max(prev - 1, 10)); // Decrease font size, min 10px
  }, [setFontSize]);

  const handleResetFontSize = useCallback(() => {
    setFontSize(13); // Reset to default
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

  // Password status is now automatically checked by the store when username/token changes

  // Password setting handler
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

  // Function to open password setting dialog
  const promptSetPassword = useCallback(() => {
    setPasswordInput("");
    setPasswordError(null);
    setIsPasswordDialogOpen(true);
  }, []);

  // Function to handle send message button click
  const handleSendMessage = useCallback((username: string) => {
    setPrefilledUser(username);
    setIsNewRoomDialogOpen(true);
  }, [setIsNewRoomDialogOpen]);

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
        isSidebarVisible={sidebarVisibleBool} // Pass boolean
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
    [currentRoomId, currentRoomMessagesLimited, messages, messageRenderLimit, username]
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={
          currentRoom
            ? currentRoom.type === "private"
              ? getPrivateRoomDisplayName(currentRoom, username)
              : `#${currentRoom.name}`
            : "@ryo"
        }
        onClose={onClose}
        isForeground={isForeground}
        appId="chats"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        isShaking={isShaking}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          ref={containerRef}
          className={`relative size-full ${
            isWindowsLegacyTheme ? "border-t border-[#919b9c]" : ""
          }`}
        >
          {/* Mobile sidebar overlay with framer-motion 3D animations */}
          <AnimatePresence>
            {sidebarVisibleBool && isFrameNarrow && (
              <motion.div
                className="absolute inset-0 z-20"
                style={{ perspective: "2000px" }}
              >
                {/* Scrim - fades in and out */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.4 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.2,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  className="absolute inset-0 bg-black"
                  onClick={toggleSidebarVisibility}
                />

                {/* Sidebar - 3D flip animation, full width but fit content height */}
                <motion.div
                  initial={{
                    rotateX: -60,
                    y: "-30%",
                    scale: 0.9,
                    opacity: 0,
                    transformOrigin: "top center",
                  }}
                  animate={{
                    rotateX: 0,
                    y: "0%",
                    scale: 1,
                    opacity: 1,
                    transformOrigin: "top center",
                  }}
                  exit={{
                    rotateX: -60,
                    y: "-30%",
                    scale: 0.9,
                    opacity: 0,
                    transformOrigin: "top center",
                  }}
                  transition={{
                    type: "spring",
                    damping: 40,
                    stiffness: 300,
                    mass: 1,
                  }}
                  className="relative w-full bg-neutral-100 z-10"
                  style={{
                    transformPerspective: "2000px",
                    backfaceVisibility: "hidden",
                    willChange: "transform",
                    maxHeight: "70%", // Limit height to 70% of container
                  }}
                >
                  <ChatRoomSidebar
                    rooms={rooms}
                    currentRoom={currentRoom ?? null}
                    onRoomSelect={handleMobileRoomSelect}
                    onAddRoom={promptAddRoom}
                    onDeleteRoom={handlePromptDeleteRoom}
                    isVisible={true}
                    isAdmin={isAdmin}
                    username={username}
                    isOverlay={true}
                    onlineUsers={globalOnlineUsers}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Layout based on WindowFrame width */}
          <div
            className={`flex h-full ${isFrameNarrow ? "flex-col" : "flex-row"}`}
          >
            <div className={`${isFrameNarrow ? "hidden" : "block"} h-full`}>
              <ChatRoomSidebar
                rooms={rooms}
                currentRoom={currentRoom ?? null}
                onRoomSelect={handleMenuRoomSelect}
                onAddRoom={promptAddRoom}
                onDeleteRoom={handlePromptDeleteRoom}
                isVisible={sidebarVisibleBool}
                isAdmin={isAdmin}
                username={username}
                onlineUsers={globalOnlineUsers}
              />
            </div>

            {/* Chat area */}
            <div className="relative flex flex-col flex-1 h-full bg-white/85">
              {/* Mobile chat title bar */}
              <div
                className={`sticky top-0 z-10 isolate flex items-center justify-between px-2 py-1 border-b ${
                  // Layer pinstripes with semi-transparent white via backgroundImage for macOS
                  isMacTheme ? "" : "bg-neutral-200/90 backdrop-blur-lg"
                } ${
                  isWindowsLegacyTheme
                    ? "border-[#919b9c]"
                    : isMacTheme
                    ? ""
                    : "border-black"
                }`}
                style={{
                  // Force GPU compositing to fix Safari stacking context issues
                  // when other windows trigger repaints (e.g., notitlebar hover)
                  transform: "translateZ(0)",
                  ...(isMacTheme
                    ? {
                        backgroundImage: "var(--os-pinstripe-window)",
                        opacity: 0.95,
                        borderBottom:
                          "var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))",
                      }
                    : undefined),
                }}
              >
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    onClick={toggleSidebarVisibility}
                    className="flex items-center gap-0.5 px-2 py-1 h-7"
                  >
                    <h2 className="font-geneva-12 text-[12px] font-medium truncate">
                      {currentRoom
                        ? currentRoom.type === "private"
                          ? getPrivateRoomDisplayName(currentRoom, username)
                          : `#${currentRoom.name}`
                        : "@ryo"}
                    </h2>
                    <CaretDown className="size-2.5 transform transition-transform duration-200 text-neutral-400" weight="bold" />
                  </Button>

                  {currentRoom &&
                    currentRoom.type !== "private" &&
                    usersList.length > 0 && (
                      <span className="font-geneva-12 text-[11px] text-neutral-500">
                        {tooltipText}
                      </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                  {/* Create Account button shown only in @ryo view when no username is set */}
                  {!currentRoom && !username && (
                    <Button
                      variant="ghost"
                      onClick={promptSetUsername}
                      className="flex items-center gap-1 px-2 py-1 h-7"
                    >
                      <span className="font-geneva-12 text-[11px] text-orange-600 hover:text-orange-700">
                        {t("apps.chats.status.loginToRyOS")}
                      </span>
                    </Button>
                  )}

                  {/* Clear chat button shown only in @ryo (no current room) */}
                  {!currentRoom && (
                    <Button
                      variant="ghost"
                      onClick={handleOpenClearDialog}
                      className="flex items-center gap-1 px-2 py-1 h-7"
                    >
                      <span className="font-geneva-12 text-[11px]">{t("apps.chats.status.clear")}</span>
                    </Button>
                  )}

                  {/* Leave button for private rooms */}
                  {currentRoom && currentRoom.type === "private" && (
                    <Button
                      variant="ghost"
                      onClick={handleLeaveCurrentRoom}
                      className="flex items-center gap-1 px-2 py-1 h-7"
                    >
                      <span className="font-geneva-12 text-[11px]">{t("apps.chats.status.leave")}</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Scrollable messages under header */}
              <div
                ref={chatRootRef}
                data-chat-root
                className="absolute inset-0 flex flex-col z-0"
              >
                {/* Chat Messages Area - will scroll under header */}
                <div
                  className="flex-1 overflow-hidden"
                  ref={messagesContainerRef}
                >
                  <ChatMessages
                    key={currentRoomId || "ryo"}
                    messages={currentMessagesToDisplay}
                    isLoading={
                      (isLoading && !currentRoomId) ||
                      (!!currentRoomId && isRyoLoading)
                    }
                    error={!currentRoomId ? error : undefined}
                    onRetry={reload}
                    onClear={handleOpenClearDialog}
                    isRoomView={!!currentRoomId}
                    roomId={currentRoomId ?? undefined}
                    isAdmin={isAdmin}
                    username={username || undefined}
                    onMessageDeleted={handleMessageDeleted}
                    fontSize={fontSize}
                    scrollToBottomTrigger={scrollToBottomTrigger}
                    highlightSegment={highlightSegment}
                    isSpeaking={isSpeaking}
                    onSendMessage={handleSendMessage}
                    isLoadingGreeting={isLoadingGreeting}
                    typingUsers={currentRoomTypingUsers}
                  />
                </div>
                {/* Input Area or Create Account Prompt */}
                <div
                  className="absolute bottom-0 left-0 z-10 p-2"
                  style={{ width: "calc(100% - var(--sbw, 0px))" }}
                >
                  {/* Show "Create Account" button in two cases:
                      1. In a chat room without username
                      2. In @ryo chat when rate limit is hit for anonymous users */}
                  {(currentRoomId && !username) ||
                  (!currentRoomId && needsUsername && !username) ? (
                    isMacTheme ? (
                      <Button
                        variant="secondary"
                        onClick={promptSetUsername}
                        className="w-full !h-9 !rounded-full orange"
                      >
                        {t("apps.chats.status.loginToChat")}
                      </Button>
                    ) : (
                      <Button
                        onClick={promptSetUsername}
                        className={`w-full h-9 font-geneva-12 text-[12px] ${
                          isXpTheme
                            ? "text-black"
                            : "bg-orange-600 text-white hover:bg-orange-700 transition-all duration-200"
                        }`}
                      >
                        {t("apps.chats.status.loginToChat")}
                      </Button>
                    )
                  ) : (
                    <ChatInput
                      isLoading={isLoading || isRyoLoading}
                      isForeground={isForeground}
                      onSubmitMessage={handleSubmit}
                      onStop={handleStop}
                      isSpeechPlaying={isSpeaking}
                      onDirectMessageSubmit={handleDirectSubmit}
                      onNudge={handleNudgeClick}
                      previousMessages={previousUserMessages}
                      showNudgeButton={!currentRoomId}
                      isInChatRoom={!!currentRoomId}
                      rateLimitError={rateLimitError}
                      isOffline={isOffline}
                      needsUsername={needsUsername && !username}
                      onTyping={
                        currentRoomId ? handleTypingInCurrentRoom : undefined
                      }
                      prefillMessage={inputPrefillMessage}
                      resetTrigger={inputResetTrigger}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <ChatsDialogs
          translatedHelpItems={translatedHelpItems}
          appMetadata={appMetadata}
          isHelpDialogOpen={isHelpDialogOpen}
          setIsHelpDialogOpen={setIsHelpDialogOpen}
          isAboutDialogOpen={isAboutDialogOpen}
          setIsAboutDialogOpen={setIsAboutDialogOpen}
          isClearDialogOpen={isClearDialogOpen}
          setIsClearDialogOpen={setIsClearDialogOpen}
          confirmClearChats={handleConfirmClearChats}
          isSaveDialogOpen={isSaveDialogOpen}
          setIsSaveDialogOpen={setIsSaveDialogOpen}
          handleSaveSubmit={handleSaveSubmit}
          saveFileName={saveFileName}
          setSaveFileName={setSaveFileName}
          isUsernameDialogOpen={isUsernameDialogOpen}
          setIsUsernameDialogOpen={setIsUsernameDialogOpen}
          verifyUsernameInput={verifyUsernameInput}
          setVerifyUsernameInput={setVerifyUsernameInput}
          verifyPasswordInput={verifyPasswordInput}
          setVerifyPasswordInput={setVerifyPasswordInput}
          handleVerifyTokenSubmit={handleVerifyTokenSubmit}
          isVerifyingToken={isVerifyingToken}
          verifyError={verifyError}
          newUsername={newUsername}
          setNewUsername={setNewUsername}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          submitUsernameDialog={submitUsernameDialog}
          isSettingUsername={isSettingUsername}
          usernameError={usernameError}
          isNewRoomDialogOpen={isNewRoomDialogOpen}
          setIsNewRoomDialogOpen={setIsNewRoomDialogOpen}
          setPrefilledUser={setPrefilledUser}
          prefilledUser={prefilledUser}
          handleAddRoom={handleAddRoom}
          isAdmin={isAdmin}
          username={username}
          isDeleteRoomDialogOpen={isDeleteRoomDialogOpen}
          setIsDeleteRoomDialogOpen={setIsDeleteRoomDialogOpen}
          confirmDeleteRoom={confirmDeleteRoom}
          roomToDelete={roomToDelete}
          isLogoutConfirmDialogOpen={isLogoutConfirmDialogOpen}
          setIsLogoutConfirmDialogOpen={setIsLogoutConfirmDialogOpen}
          confirmLogout={confirmLogout}
          hasPassword={hasPassword}
          promptSetPassword={promptSetPassword}
          isPasswordDialogOpen={isPasswordDialogOpen}
          setIsPasswordDialogOpen={setIsPasswordDialogOpen}
          handleSetPassword={handleSetPassword}
          passwordInput={passwordInput}
          setPasswordInput={setPasswordInput}
          isSettingPassword={isSettingPassword}
          passwordError={passwordError}
          setPasswordError={setPasswordError}
        />
      </WindowFrame>
    </>
  );
}
