import { useState, useCallback, useEffect, useRef } from "react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ChatsMenuBar } from "./ChatsMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { PrivateRoomDialog } from "@/components/dialogs/PrivateRoomDialog";
import { helpItems, appMetadata } from "..";
import { useChatRoom } from "../hooks/useChatRoom";
import { useAiChat } from "../hooks/useAiChat";
import React from "react";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { ChatRoomSidebar } from "./ChatRoomSidebar";
import { useChatsStore } from "@/stores/useChatsStore";
import { type Message as UIMessage } from "ai/react";
import {
  type ChatMessage as AppChatMessage,
  type ChatRoom,
} from "@/types/chat";
import { Button } from "@/components/ui/button";
import { useRyoChat } from "../hooks/useRyoChat";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Define the expected message structure locally, matching ChatMessages internal type
interface DisplayMessage extends Omit<UIMessage, "role"> {
  username?: string;
  role: UIMessage["role"] | "human";
  createdAt?: Date; // Ensure createdAt is optional Date
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
  const { aiMessages } = useChatsStore();

  // Get promptSetUsername from useChatRoom first
  const chatRoomResult = useChatRoom(
    isWindowOpen ?? false,
    isForeground ?? false
  );
  const { promptSetUsername } = chatRoomResult;

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

  // Destructure the rest of the properties from chatRoomResult
  const {
    username,
    authToken,
    rooms,
    currentRoomId,
    currentRoomMessages,
    isSidebarVisible,
    isAdmin,
    handleRoomSelect,
    sendRoomMessage,
    toggleSidebarVisibility,
    promptAddRoom,
    promptDeleteRoom,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    setUsernameError,
    isNewRoomDialogOpen,
    setIsNewRoomDialogOpen,
    newRoomName,
    setNewRoomName,
    newRoomUsers,
    setNewRoomUsers,
    isCreatingRoom,
    roomError,
    submitNewRoomDialog,
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

  // Safety check: ensure rooms is an array before finding
  const currentRoom =
    Array.isArray(rooms) && currentRoomId
      ? rooms.find((r: ChatRoom) => r.id === currentRoomId)
      : null;

  // Prepare tooltip text: display up to 3 users then show remaining count
  const usersList = currentRoom?.users ?? [];
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

  // Ensure isSidebarVisible is always boolean for child components
  const sidebarVisibleBool = isSidebarVisible ?? false;

  // Handler for mobile room selection that auto-dismisses the sidebar
  const handleMobileRoomSelect = useCallback(
    (room: ChatRoom | null) => {
      handleRoomSelect(room ? room.id : null);
      // Auto-dismiss sidebar on mobile after selecting a room
      if (sidebarVisibleBool) {
        toggleSidebarVisibility();
      }
    },
    [handleRoomSelect, sidebarVisibleBool, toggleSidebarVisibility]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

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

  if (!isWindowOpen) return null;

  // Explicitly type the array using the local DisplayMessage interface
  const currentMessagesToDisplay: DisplayMessage[] = currentRoomId
    ? currentRoomMessages.map((msg: AppChatMessage) => ({
        // Use AppChatMessage here
        id: msg.id,
        role: msg.username === username ? "user" : "human",
        content: msg.content,
        createdAt: new Date(msg.timestamp), // Ensure this is a Date object
        username: msg.username,
      }))
    : messages.map((msg: UIMessage) => ({
        ...msg,
        // Ensure createdAt is a Date object if it exists, otherwise undefined
        createdAt: msg.createdAt ? new Date(msg.createdAt) : undefined,
        username: msg.role === "user" ? username || "You" : "Ryo",
      }));

  return (
    <>
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
        onRoomSelect={(room) => handleRoomSelect(room ? room.id : null)}
        isAdmin={isAdmin}
        onIncreaseFontSize={handleIncreaseFontSize}
        onDecreaseFontSize={handleDecreaseFontSize}
        onResetFontSize={handleResetFontSize}
        username={username}
        authToken={authToken} // Pass authToken to ChatsMenuBar
      />
      <WindowFrame
        title={currentRoom ? `#${currentRoom.name}` : "@ryo"}
        onClose={onClose}
        isForeground={isForeground}
        appId="chats"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        isShaking={isShaking}
      >
        <div ref={containerRef} className="relative h-full w-full">
          {/* Mobile sidebar overlay with framer-motion 3D animations */}
          <AnimatePresence>
            {sidebarVisibleBool && isFrameNarrow && (
              <motion.div
                className="absolute inset-x-0 top-0 bottom-0 z-20"
                style={{ perspective: "2000px" }}
              >
                {/* Scrim - fades in and out */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.3 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: 0.2,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                  className="absolute inset-0 bg-black"
                  onClick={toggleSidebarVisibility}
                />

                {/* Sidebar - 3D flip animation */}
                <motion.div
                  initial={{
                    rotateX: -60,
                    translateY: "-30%",
                    scale: 0.9,
                    opacity: 0,
                    transformOrigin: "top center",
                  }}
                  animate={{
                    rotateX: 0,
                    translateY: "0%",
                    scale: 1,
                    opacity: 1,
                    transformOrigin: "top center",
                  }}
                  exit={{
                    rotateX: -60,
                    translateY: "-30%",
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
                  className="relative w-full h-fit bg-neutral-200 z-10"
                  style={{
                    transformPerspective: "2000px",
                    backfaceVisibility: "hidden",
                    willChange: "transform",
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
                onRoomSelect={(room) => handleRoomSelect(room ? room.id : null)}
                onAddRoom={promptAddRoom}
                onDeleteRoom={(room) => promptDeleteRoom(room)}
                isVisible={sidebarVisibleBool}
                isAdmin={isAdmin}
              />
            </div>

            {/* Chat area */}
            <div className="relative flex flex-col flex-1 h-full bg-white/85">
              {/* Mobile chat title bar */}
              <div className="sticky top-0 z-10 flex items-center justify-between px-2 py-1 bg-neutral-200/90 backdrop-blur-lg border-b border-black">
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    onClick={toggleSidebarVisibility}
                    className="flex items-center gap-0.5 px-2 py-1 h-7"
                  >
                    <h2 className="font-geneva-12 text-[12px] font-medium truncate">
                      {currentRoom ? `#${currentRoom.name}` : "@ryo"}
                    </h2>
                    <ChevronDown className="h-3 w-3 transform transition-transform duration-200 text-neutral-400" />
                  </Button>

                  {currentRoom && usersList.length > 0 && (
                    <span className="font-geneva-12 text-[11px] text-neutral-500">
                      {tooltipText}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0">
                  {/* Set Username button shown only in @ryo view when no username is set */}
                  {!currentRoom && !username && (
                    <Button
                      variant="ghost"
                      onClick={promptSetUsername}
                      className="flex items-center gap-1 px-2 py-1 h-7"
                    >
                      <span className="font-geneva-12 text-[11px]">
                        Set Username
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
                      <span className="font-geneva-12 text-[11px]">Clear</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Scrollable messages under header */}
              <div className="absolute inset-0 flex flex-col z-0">
                {/* Chat Messages Area - will scroll under header */}
                <div className="flex-1 overflow-hidden">
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
                    fontSize={fontSize}
                    scrollToBottomTrigger={scrollToBottomTrigger}
                    highlightSegment={highlightSegment}
                    isSpeaking={isSpeaking}
                  />
                </div>
                {/* Input Area or Set Username Prompt */}
                <div className="absolute bottom-0 z-10 w-full p-2">
                  {/* Show "Set Username" button in two cases:
                      1. In a chat room without username
                      2. In @ryo chat when rate limit is hit for anonymous users */}
                  {(currentRoomId && !username) ||
                  (!currentRoomId && needsUsername && !username) ? (
                    <Button
                      onClick={promptSetUsername}
                      className="w-full h-9 font-geneva-12 text-[12px] bg-orange-600 text-white hover:bg-orange-700 transition-all duration-200"
                    >
                      {"Set Username to Chat"}
                    </Button>
                  ) : (
                    // AI Chat or in a room with username set
                    (() => {
                      const userMessages = aiMessages.filter(
                        (msg: UIMessage) => msg.role === "user"
                      );
                      const prevMessagesContent = Array.from(
                        new Set(userMessages.map((msg) => msg.content))
                      ).reverse() as string[];

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
          helpItems={helpItems}
          appName="Chats"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
        />
        <ConfirmDialog
          isOpen={isClearDialogOpen}
          onOpenChange={setIsClearDialogOpen}
          onConfirm={confirmClearChats}
          title="Clear Chats"
          description="Are you sure you want to clear this chat? This action cannot be undone."
        />
        <InputDialog
          isOpen={isSaveDialogOpen}
          onOpenChange={setIsSaveDialogOpen}
          onSubmit={handleSaveSubmit}
          title="Save Transcript"
          description="Enter a name for your chat transcript file"
          value={saveFileName}
          onChange={setSaveFileName}
        />
        <InputDialog
          isOpen={isUsernameDialogOpen}
          onOpenChange={(open) => {
            console.log(
              `[ChatApp Debug] Username InputDialog onOpenChange called with: ${open}`
            );
            setIsUsernameDialogOpen(open);
          }}
          onSubmit={submitUsernameDialog}
          title="Set Username"
          description="Set your ryOS username to continue chatting"
          value={newUsername}
          onChange={(value) => {
            setNewUsername(value);
            setUsernameError(null);
          }}
          isLoading={isSettingUsername}
          errorMessage={usernameError}
        />
        {isAdmin ? (
          <InputDialog
            isOpen={isNewRoomDialogOpen}
            onOpenChange={setIsNewRoomDialogOpen}
            onSubmit={submitNewRoomDialog}
            title="Create New Room"
            description="Enter a name for the new chat room"
            value={newRoomName}
            onChange={(value) => {
              setNewRoomName(value);
            }}
            isLoading={isCreatingRoom}
            errorMessage={roomError}
          />
        ) : (
          <PrivateRoomDialog
            isOpen={isNewRoomDialogOpen}
            onOpenChange={setIsNewRoomDialogOpen}
            onSubmit={submitNewRoomDialog}
            roomName={newRoomName}
            onRoomNameChange={setNewRoomName}
            users={newRoomUsers}
            onUsersChange={setNewRoomUsers}
            isLoading={isCreatingRoom}
            errorMessage={roomError}
          />
        )}
        <ConfirmDialog
          isOpen={isDeleteRoomDialogOpen}
          onOpenChange={setIsDeleteRoomDialogOpen}
          onConfirm={confirmDeleteRoom}
          title="Delete Chat Room"
          description={`Are you sure you want to delete the room "${roomToDelete?.name}"?. This action cannot be undone.`}
        />
      </WindowFrame>
    </>
  );
}
