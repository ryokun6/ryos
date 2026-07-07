import type { CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaretDown } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { ChatRoomSidebar } from "../ChatRoomSidebar";
import { ChatMessages } from "../ChatMessages";
import { ChatInput } from "../ChatInput";
import type { ChatsAppController } from "./useChatsAppController";

type ChatsWindowContentProps = {
  c: ChatsAppController;
  isForeground: boolean;
};

export function ChatsWindowContent({ c, isForeground }: ChatsWindowContentProps) {
  const { t } = useTranslation();

  const {
    isWindowsTheme,
    isMacTheme,
    isAquaGlass,
    isDarkMode,
    containerRef,
    sidebarVisibleBool,
    isFrameNarrow,
    toggleSidebarVisibility,
    handleMobileRoomSelect,
    rooms,
    currentRoom,
    handlePromptDeleteRoom,
    isAdmin,
    username,
    globalOnlineUsers,
    promptAddRoom,
    handleMenuRoomSelect,
    usersList,
    tooltipText,
    promptSetUsername,
    handleOpenClearDialog,
    handleLeaveCurrentRoom,
    chatRootRef,
    messagesContainerRef,
    currentRoomId,
    currentMessagesToDisplay,
    isLoading,
    isRemoteStreaming,
    isRyoLoading,
    error,
    retryLastUserMessage,
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
    isOffline,
    handleTypingInCurrentRoom,
  } = c;

  // In Aqua Glass the toolbar is split into two floating frosted "islands"
  // (left = room title, right = actions). The right island is only rendered
  // when there are actions to show, so it never appears as an empty pill.
  const hasRightActions = !currentRoom || currentRoom.type === "private";
  // The "platter" islands borrow the Aqua Glass frosted metal-button vocabulary
  // (`.metal-inset-btn` group + button): a top gloss layered over a smooth
  // gray→white base, low alpha so the frosted desktop reads through, capped by a
  // raised dark hairline ring (light) / soft inner highlight (dark) instead of a
  // white border. Both fills live in the background so labels paint above them.
  const aquaGlassIslandStyle: CSSProperties = {
    background: isDarkMode
      ? "linear-gradient(to bottom, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.03) 60%, rgba(255, 255, 255, 0) 100%) top / 100% 50% no-repeat, linear-gradient(to bottom, rgba(72, 72, 78, 0.42), rgba(34, 34, 38, 0.42))"
      : "linear-gradient(to bottom, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.18) 60%, rgba(255, 255, 255, 0) 100%) top / 100% 50% no-repeat, linear-gradient(rgba(188, 188, 188, 0.34), rgba(255, 255, 255, 0.3))",
    backdropFilter: "blur(12px) saturate(180%)",
    WebkitBackdropFilter: "blur(12px) saturate(180%)",
    border: "none",
    textShadow: isDarkMode
      ? "0 1px 0 rgba(0, 0, 0, 0.55)"
      : "0 1px 0 rgba(255, 255, 255, 0.5)",
    boxShadow: isDarkMode
      ? "0 2px 4px rgba(0, 0, 0, 0.35), 0 1px 1px rgba(0, 0, 0, 0.35), inset 0 0 0 0.5px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.14)"
      : "0 2px 3px rgba(0, 0, 0, 0.2), 0 1px 1px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(0, 0, 0, 0.3)",
  };

  return (
    <div
      ref={containerRef}
      className={`relative size-full ${
        isWindowsTheme ? "border-t border-[#919b9c]" : ""
      }`}
    >
      <AnimatePresence>
        {sidebarVisibleBool && isFrameNarrow && (
          <motion.div
            className="absolute inset-0 z-20"
            style={{ perspective: "2000px" }}
          >
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
              className="relative z-10 flex w-full flex-col overflow-hidden bg-neutral-100"
              style={{
                transformPerspective: "2000px",
                backfaceVisibility: "hidden",
                willChange: "transform",
                maxHeight: "calc(100% - 44px)",
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

        <div
          className={`relative flex flex-col flex-1 h-full ${
            isAquaGlass ? "" : "bg-white/85"
          }`}
        >
          <div
            className={`sticky top-0 z-10 isolate flex items-center justify-between px-2 py-1 ${
              isAquaGlass ? "" : "border-b"
            } ${
              isMacTheme ? "" : "bg-neutral-200/90 backdrop-blur-lg"
            } ${
              isWindowsTheme
                ? "border-[#919b9c]"
                : isMacTheme
                  ? ""
                  : "border-black"
            }`}
            style={{
              transform: "translateZ(0)",
              ...(isAquaGlass
                ? { background: "transparent" }
                : isMacTheme
                  ? {
                      backgroundImage: "var(--os-pinstripe-window)",
                      opacity: 0.95,
                      borderBottom:
                        "var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))",
                    }
                  : undefined),
            }}
          >
            <div
              className={`flex items-center ${
                isAquaGlass ? "rounded-full overflow-hidden" : ""
              }`}
              style={isAquaGlass ? aquaGlassIslandStyle : undefined}
            >
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
                <CaretDown
                  className="size-2.5 transform transition-transform duration-200 text-neutral-400"
                  weight="bold"
                />
              </Button>

              {currentRoom &&
                currentRoom.type !== "private" &&
                usersList.length > 0 && (
                  <span className="font-geneva-12 text-[11px] text-neutral-500">
                    {tooltipText}
                  </span>
                )}
            </div>
            <div
              className={`flex items-center gap-2 ${
                isAquaGlass && hasRightActions ? "rounded-full overflow-hidden" : ""
              }`}
              style={
                isAquaGlass && hasRightActions ? aquaGlassIslandStyle : undefined
              }
            >
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

              {!currentRoom && (
                <Button
                  variant="ghost"
                  onClick={handleOpenClearDialog}
                  className="flex items-center gap-1 px-2 py-1 h-7"
                >
                  <span className="font-geneva-12 text-[11px]">
                    {t("apps.chats.status.clear")}
                  </span>
                </Button>
              )}

              {currentRoom && currentRoom.type === "private" && (
                <Button
                  variant="ghost"
                  onClick={handleLeaveCurrentRoom}
                  className="flex items-center gap-1 px-2 py-1 h-7"
                >
                  <span className="font-geneva-12 text-[11px]">
                    {t("apps.chats.status.leave")}
                  </span>
                </Button>
              )}
            </div>
          </div>

          <div
            ref={chatRootRef}
            data-chat-root
            className="absolute inset-0 flex flex-col z-0"
          >
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
                onRetry={retryLastUserMessage}
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
                speakAssistantMessageManually={speakAssistantMessageManually}
                stopSpeech={stopSpeech}
                onSendMessage={handleSendMessage}
                isLoadingGreeting={isLoadingGreeting}
                typingUsers={currentRoomTypingUsers}
              />
            </div>
            <div
              className="absolute bottom-0 left-0 z-10 p-2"
              style={{ width: "calc(100% - var(--sbw, 0px))" }}
            >
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
                      isWindowsTheme
                        ? "text-black"
                        : "bg-orange-600 text-white hover:bg-orange-700 transition-all duration-200"
                    }`}
                  >
                    {t("apps.chats.status.loginToChat")}
                  </Button>
                )
              ) : (
                <ChatInput
                  isLoading={currentRoom ? isRyoLoading : isLoading}
                  isRemoteStreaming={!currentRoom && isRemoteStreaming}
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
  );
}
