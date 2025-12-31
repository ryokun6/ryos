import { useState, useCallback, useEffect, useRef } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ChatsMenuBar } from "./ChatsMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { LogoutDialog } from "@/components/dialogs/LogoutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { CreateRoomDialog } from "./CreateRoomDialog";
import { helpItems, appMetadata } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useChatRoom } from "../hooks/useChatRoom";
import { useAiChat } from "../hooks/useAiChat";
import { useAuth } from "@/hooks/useAuth";
import React from "react";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { ChatRoomSidebar } from "./ChatRoomSidebar";
import { useChatsStore } from "@/stores/useChatsStore";
import type { AIChatMessage } from "@/types/chat";
import {
  type ChatMessage as AppChatMessage,
  type ChatRoom,
} from "@/types/chat";
import { Button } from "@/components/ui/button";
import { useRyoChat } from "../hooks/useRyoChat";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { toast } from "sonner";
import { useThemeStore } from "@/stores/useThemeStore";
import { useOffline } from "@/hooks/useOffline";
import { checkOfflineAndShowError } from "@/utils/offline";
import { useTranslation } from "react-i18next";

// Define the expected message structure locally, matching ChatMessages internal type
interface DisplayMessage extends Omit<AIChatMessage, "role"> {
  username?: string;
  role: AIChatMessage["role"] | "human";
  serverId?: string; // Real server ID for room messages
}

export function ChatsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("chats", helpItems);
  const { aiMessages } = useChatsStore();

  // Use auth hook for authentication functionality
  const authResult = useAuth();
  const { promptSetUsername } = authResult;

  // Get room functionality from useChatRoom
  const chatRoomResult = useChatRoom(isWindowOpen ?? false, promptSetUsername);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit: handleAiSubmit,
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
    authToken,
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

  // Get font size state from store - select separately for optimization
  const fontSize = useChatsStore((state) => state.fontSize);
  const setFontSize = useChatsStore((state) => state.setFontSize);

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

  // Use the @ryo chat hook
  const { isRyoLoading, stopRyo, handleRyoMention, detectAndProcessMention } =
    useRyoChat({
      currentRoomId,
      onScrollToBottom: () => setScrollToBottomTrigger((prev) => prev + 1),
      roomMessages: currentRoomMessages?.map((msg: AppChatMessage) => ({
        username: msg.username,
        content: msg.content,
        userId: msg.id,
        timestamp: new Date(msg.timestamp).toISOString(),
      })),
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
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      // Check if offline and show error
      if (checkOfflineAndShowError(t("apps.chats.status.chatRequiresInternet"))) {
        return;
      }

      if (currentRoomId && username) {
        const trimmedInput = input.trim();

        // Detect if this is an @ryo mention
        const { isMention, messageContent } =
          detectAndProcessMention(trimmedInput);

        if (isMention) {
          // Clear input immediately
          handleInputChange({
            target: { value: "" },
          } as React.ChangeEvent<HTMLInputElement>);

          // Send the user's message to the chat room first (showing @ryo)
          sendRoomMessage(input);

          // Then send to AI (doesn't affect input clearing)
          handleRyoMention(messageContent);

          // Trigger scroll
          setScrollToBottomTrigger((prev) => prev + 1);
        } else {
          // Regular room message
          sendRoomMessage(input);
          handleInputChange({
            target: { value: "" },
          } as React.ChangeEvent<HTMLInputElement>);
          // Trigger scroll after sending room message
          setScrollToBottomTrigger((prev) => prev + 1);
        }
      } else {
        // AI chat when not in a room
        handleAiSubmit(e);
        // Trigger scroll after submitting AI message
        setScrollToBottomTrigger((prev) => prev + 1);
      }
    },
    [
      currentRoomId,
      username,
      sendRoomMessage,
      handleAiSubmit,
      input,
      handleInputChange,
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

  // Determine if the current WindowFrame width is narrower than the Tailwind `md` breakpoint (768px)
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chatRootRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const [isFrameNarrow, setIsFrameNarrow] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const updateWidth = (width: number) => {
      setIsFrameNarrow(width < 550);
    };

    // Initial measurement
    updateWidth(containerRef.current.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        updateWidth(entries[0].contentRect.width);
      }
    });

    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  // Derive message count for effect dependencies
  const messageCount = currentRoomId
    ? Array.isArray(currentRoomMessages)
      ? currentRoomMessages.length
      : 0
    : messages.length;

  // Measure scrollbar width of the chat messages scroller and expose as CSS var --sbw on chat root
  useEffect(() => {
    const root = chatRootRef.current;
    const container = messagesContainerRef.current;
    if (!root || !container) return;

    let scroller: HTMLElement | null = null;

    const findScroller = (): HTMLElement | null => {
      const elements = container.querySelectorAll<HTMLElement>("*");
      for (const el of elements) {
        const style = window.getComputedStyle(el);
        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          el.clientHeight > 0 &&
          el.scrollHeight > el.clientHeight + 1
        ) {
          return el;
        }
      }
      return null;
    };

    const update = () => {
      if (!root) return;
      if (!scroller) scroller = findScroller();
      if (scroller) {
        const sbw = scroller.offsetWidth - scroller.clientWidth;
        root.style.setProperty("--sbw", `${Math.max(0, sbw)}px`);
      } else {
        root.style.setProperty("--sbw", "0px");
      }
    };

    update();

    const resizeObs = new ResizeObserver(() => update());
    const mutationObs = new MutationObserver(() => update());
    resizeObs.observe(container);
    if (scroller) resizeObs.observe(scroller);
    mutationObs.observe(container, { childList: true, subtree: true });
    window.addEventListener("resize", update);

    return () => {
      resizeObs.disconnect();
      mutationObs.disconnect();
      window.removeEventListener("resize", update);
    };
    // Re-evaluate when room changes or message count changes (structure might swap)
  }, [currentRoomId, messageCount]);

  // Automatically show sidebar when switching from narrow to wide
  const prevFrameNarrowRef = useRef(isFrameNarrow);

  useEffect(() => {
    if (prevFrameNarrowRef.current && !isFrameNarrow) {
      // We transitioned from narrow -> wide
      if (!sidebarVisibleBool) {
        toggleSidebarVisibility();
      }
    }
    prevFrameNarrowRef.current = isFrameNarrow;
  }, [isFrameNarrow, sidebarVisibleBool, toggleSidebarVisibility]);

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
  }, []);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isWindowsLegacyTheme = isXpTheme;
  const isMacTheme = currentTheme === "macosx";
  const isOffline = useOffline();

  const menuBar = (
    <ChatsMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onClearChats={() => setIsClearDialogOpen(true)}
      onSaveTranscript={handleSaveTranscript}
      onSetUsername={promptSetUsername}
      onToggleSidebar={toggleSidebarVisibility}
      isSidebarVisible={sidebarVisibleBool} // Pass boolean
      onAddRoom={promptAddRoom}
      rooms={rooms}
      currentRoom={currentRoom ?? null}
      onRoomSelect={(room) => handleRoomSelectWithScroll(room ? room.id : null)}
      onIncreaseFontSize={handleIncreaseFontSize}
      onDecreaseFontSize={handleDecreaseFontSize}
      onResetFontSize={handleResetFontSize}
      username={username}
      authToken={authToken} // Pass authToken to ChatsMenuBar
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
    />
  );

  if (!isWindowOpen) return null;

  // Explicitly type the array using the local DisplayMessage interface
  const currentMessagesToDisplay: DisplayMessage[] = currentRoomId
    ? currentRoomMessagesLimited.map((msg: AppChatMessage) => ({
        // For room messages, use clientId (if present) for stable rendering key
        id: msg.clientId || msg.id,
        serverId: msg.id,
        role: msg.username === username ? "user" : "human",
        parts: [{ type: "text" as const, text: msg.content }], // Convert to v5 parts format
        metadata: {
          createdAt: new Date(msg.timestamp),
        },
        username: msg.username,
      }))
    : messages.map((msg: AIChatMessage) => ({
        ...msg,
        // metadata with createdAt is already present from AIChatMessage
        username: msg.role === "user" ? username || "You" : "Ryo",
      }));

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
          className={`relative h-full w-full ${
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
                    onDeleteRoom={(room) => promptDeleteRoom(room)}
                    isVisible={true} // Always visible when overlay is shown
                    isAdmin={isAdmin}
                    username={username}
                    isOverlay={true}
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
                onRoomSelect={(room) =>
                  handleRoomSelectWithScroll(room ? room.id : null)
                }
                onAddRoom={promptAddRoom}
                onDeleteRoom={(room) => promptDeleteRoom(room)}
                isVisible={sidebarVisibleBool}
                isAdmin={isAdmin}
                username={username}
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
                    <ChevronDown className="h-3 w-3 transform transition-transform duration-200 text-neutral-400" />
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
                      onClick={() => setIsClearDialogOpen(true)}
                      className="flex items-center gap-1 px-2 py-1 h-7"
                    >
                      <span className="font-geneva-12 text-[11px]">{t("apps.chats.status.clear")}</span>
                    </Button>
                  )}

                  {/* Leave button for private rooms */}
                  {currentRoom && currentRoom.type === "private" && (
                    <Button
                      variant="ghost"
                      onClick={() => promptDeleteRoom(currentRoom)}
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
                    onClear={() => setIsClearDialogOpen(true)}
                    isRoomView={!!currentRoomId}
                    roomId={currentRoomId ?? undefined}
                    isAdmin={isAdmin}
                    username={username || undefined}
                    onMessageDeleted={(deletedId) => {
                      if (currentRoomId) {
                        // Optimistically remove locally; realtime event will reconcile
                        useChatsStore
                          .getState()
                          .removeMessageFromRoom(currentRoomId, deletedId);
                      }
                    }}
                    fontSize={fontSize}
                    scrollToBottomTrigger={scrollToBottomTrigger}
                    highlightSegment={highlightSegment}
                    isSpeaking={isSpeaking}
                    onSendMessage={handleSendMessage}
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
                    // AI Chat or in a room with username set
                    (() => {
                      const userMessages = aiMessages.filter(
                        (msg: AIChatMessage) => msg.role === "user"
                      );
                      // Extract text from parts for suggestions
                      const prevMessagesContent = Array.from(
                        new Set(
                          userMessages.map((msg) => {
                            if (!msg.parts) return "";
                            return msg.parts
                              .filter((p) => p.type === "text")
                              .map(
                                (p) =>
                                  (p as { type: string; text?: string }).text ||
                                  ""
                              )
                              .join("");
                          })
                        )
                      )
                        .filter(Boolean)
                        .reverse() as string[];

                      return (
                        <ChatInput
                          input={input}
                          isLoading={isLoading || isRyoLoading}
                          isForeground={isForeground}
                          onInputChange={handleInputChange}
                          onSubmit={handleSubmit}
                          onStop={handleStop}
                          isSpeechPlaying={isSpeaking}
                          onDirectMessageSubmit={handleDirectSubmit}
                          onNudge={handleNudgeClick}
                          previousMessages={prevMessagesContent}
                          showNudgeButton={!currentRoomId}
                          isInChatRoom={!!currentRoomId}
                          rateLimitError={rateLimitError}
                          isOffline={isOffline}
                          needsUsername={needsUsername && !username}
                        />
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="chats"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="chats"
        />
        <ConfirmDialog
          isOpen={isClearDialogOpen}
          onOpenChange={setIsClearDialogOpen}
          onConfirm={confirmClearChats}
          title={t("apps.chats.dialogs.clearChatsTitle")}
          description={t("apps.chats.dialogs.clearChatsDescription")}
        />
        <InputDialog
          isOpen={isSaveDialogOpen}
          onOpenChange={setIsSaveDialogOpen}
          onSubmit={handleSaveSubmit}
          title={t("apps.chats.dialogs.saveTranscriptTitle")}
          description={t("apps.chats.dialogs.saveTranscriptDescription")}
          value={saveFileName}
          onChange={setSaveFileName}
        />
        <LoginDialog
          initialTab="signup"
          isOpen={isUsernameDialogOpen}
          onOpenChange={(open) => {
            console.log(
              `[ChatApp Debug] Username LoginDialog onOpenChange called with: ${open}`
            );
            setIsUsernameDialogOpen(open);
          }}
          /* Login props (not used in sign-up but required) */
          usernameInput={verifyUsernameInput}
          onUsernameInputChange={setVerifyUsernameInput}
          passwordInput={verifyPasswordInput}
          onPasswordInputChange={setVerifyPasswordInput}
          onLoginSubmit={async () => {
            await handleVerifyTokenSubmit(verifyPasswordInput, true);
          }}
          isLoginLoading={isVerifyingToken}
          loginError={verifyError}
          /* Sign-up props */
          newUsername={newUsername}
          onNewUsernameChange={setNewUsername}
          newPassword={newPassword}
          onNewPasswordChange={setNewPassword}
          onSignUpSubmit={submitUsernameDialog}
          isSignUpLoading={isSettingUsername}
          signUpError={usernameError}
        />
        <CreateRoomDialog
          isOpen={isNewRoomDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setPrefilledUser(""); // Reset prefilled user when dialog closes
            }
            setIsNewRoomDialogOpen(open);
          }}
          onSubmit={handleAddRoom}
          isAdmin={isAdmin}
          currentUsername={username}
          initialUsers={prefilledUser ? [prefilledUser] : []}
        />
        <ConfirmDialog
          isOpen={isDeleteRoomDialogOpen}
          onOpenChange={setIsDeleteRoomDialogOpen}
          onConfirm={confirmDeleteRoom}
          title={
            roomToDelete?.type === "private"
              ? t("apps.chats.dialogs.leaveConversationTitle")
              : t("apps.chats.dialogs.deleteChatRoomTitle")
          }
          description={
            roomToDelete?.type === "private"
              ? t("apps.chats.dialogs.leaveConversationDescription", { name: roomToDelete.name })
              : t("apps.chats.dialogs.deleteChatRoomDescription", { name: roomToDelete?.name })
          }
        />
        <LogoutDialog
          isOpen={isLogoutConfirmDialogOpen}
          onOpenChange={setIsLogoutConfirmDialogOpen}
          onConfirm={confirmLogout}
          hasPassword={hasPassword}
          onSetPassword={promptSetPassword}
        />
        <InputDialog
          isOpen={isPasswordDialogOpen}
          onOpenChange={setIsPasswordDialogOpen}
          onSubmit={handleSetPassword}
          title={t("apps.chats.dialogs.setPasswordTitle")}
          description={t("apps.chats.dialogs.setPasswordDescription")}
          value={passwordInput}
          onChange={(value) => {
            setPasswordInput(value);
            setPasswordError(null);
          }}
          isLoading={isSettingPassword}
          errorMessage={passwordError}
          submitLabel={t("apps.chats.dialogs.setPasswordButton")}
        />
      </WindowFrame>
    </>
  );
}
