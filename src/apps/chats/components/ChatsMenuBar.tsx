import React, { useState } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import { type ChatRoom } from "../../../../src/types/chat";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useAudioSettingsStoreShallow } from "@/stores/helpers";
import { SYNTH_PRESETS } from "@/hooks/useChatSynth";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";

interface ChatsMenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onClearChats: () => void;
  onSaveTranscript: () => void;
  onSetUsername: () => void;
  onToggleSidebar: () => void;
  isSidebarVisible: boolean;
  onAddRoom: () => void;
  rooms: ChatRoom[];
  currentRoom: ChatRoom | null;
  onRoomSelect: (room: ChatRoom | null) => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  onResetFontSize: () => void;
  username?: string | null;
  authToken?: string | null;
  onVerifyToken: () => void;
  isVerifyDialogOpen: boolean;
  setVerifyDialogOpen: (open: boolean) => void;
  verifyPasswordInput: string;
  setVerifyPasswordInput: (input: string) => void;
  verifyUsernameInput: string;
  setVerifyUsernameInput: (input: string) => void;
  isVerifyingToken: boolean;
  verifyError: string | null;
  handleVerifyTokenSubmit: (
    input: string,
    isPassword: boolean
  ) => Promise<void>;
  onLogout?: () => Promise<void>;
  // IRC props
  ircServers?: Array<{ id: string; host: string; port: number; nickname: string; connected: boolean; channels: string[] }>;
  currentIrcChannel?: { serverId: string; channel: string } | null;
  onConnectIrc?: () => void;
  onDisconnectIrc?: (serverId: string) => void;
  onJoinIrcChannel?: (serverId: string, channel: string) => void;
  onIrcChannelSelect?: (serverId: string, channel: string) => void;
}

export function ChatsMenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
  onClearChats,
  onSaveTranscript,
  onSetUsername,
  onToggleSidebar,
  isSidebarVisible,
  onAddRoom,
  rooms,
  currentRoom,
  onRoomSelect,
  onIncreaseFontSize,
  onDecreaseFontSize,
  onResetFontSize,
  username,
  authToken,
  onVerifyToken,
  isVerifyDialogOpen,
  setVerifyDialogOpen,
  verifyPasswordInput,
  setVerifyPasswordInput,
  verifyUsernameInput,
  setVerifyUsernameInput,
  isVerifyingToken,
  verifyError,
  handleVerifyTokenSubmit,
  onLogout,
  ircServers = [],
  currentIrcChannel,
  onConnectIrc,
  onDisconnectIrc,
  onJoinIrcChannel,
  onIrcChannelSelect,
}: ChatsMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "chats";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  const {
    speechEnabled,
    setSpeechEnabled,
    typingSynthEnabled,
    setTypingSynthEnabled,
    synthPreset,
    setSynthPreset,
    keepTalkingEnabled,
    setKeepTalkingEnabled,
  } = useAudioSettingsStoreShallow((s) => ({
    speechEnabled: s.speechEnabled,
    setSpeechEnabled: s.setSpeechEnabled,
    typingSynthEnabled: s.typingSynthEnabled,
    setTypingSynthEnabled: s.setTypingSynthEnabled,
    synthPreset: s.synthPreset,
    setSynthPreset: s.setSynthPreset,
    keepTalkingEnabled: s.keepTalkingEnabled,
    setKeepTalkingEnabled: s.setKeepTalkingEnabled,
  }));

  return (
    <>
      <MenuBar inWindowFrame={isXpTheme}>
        {/* File Menu */}
        <MenubarMenu>
          <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
            {t("common.menu.file")}
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={1} className="px-0">
            <MenubarItem
              onClick={onSaveTranscript}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.saveTranscript")}
            </MenubarItem>
            <MenubarItem
              onClick={onClearChats}
              disabled={currentRoom !== null}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.clearChat")}
            </MenubarItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />

            {/* Account Section */}
            {username && authToken ? (
              // When logged in: Show Log Out only
              <MenubarItem
                onClick={() => onLogout?.()}
                className="text-md h-6 px-3"
              >
                {t("apps.chats.menu.logOut")}
              </MenubarItem>
            ) : (
              // When not logged in: Show Create Account and Login
              <>
                <MenubarItem
                  onClick={onSetUsername}
                  className="text-md h-6 px-3"
                >
                  {t("apps.chats.menu.createAccount")}
                </MenubarItem>
                <MenubarItem
                  onClick={onVerifyToken}
                  className="text-md h-6 px-3"
                >
                  {t("apps.chats.menu.login")}
                </MenubarItem>
              </>
            )}

            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem
              onClick={onClose}
              className="text-md h-6 px-3"
            >
              {t("common.menu.close")}
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        {/* Chats Menu */}
        <MenubarMenu>
          <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
            {t("apps.chats.menu.chats")}
          </MenubarTrigger>
          <MenubarContent
            align="start"
            sideOffset={1}
            className="px-0 max-h-[300px] overflow-y-auto"
          >
            {/* New Chat - available to all users */}
            <MenubarItem
              onClick={onAddRoom}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.newChat")}
            </MenubarItem>

            {/* Show separator between menu actions and chat list */}
            {(rooms.length > 0 || ircServers.length > 0) && (
              <MenubarSeparator className="h-[2px] bg-black my-1" />
            )}

            {/* Ryo Chat Option */}
            <MenubarCheckboxItem
              checked={currentRoom === null && currentIrcChannel === null}
              onCheckedChange={(checked) => {
                if (checked) {
                  onRoomSelect(null);
                  onIrcChannelSelect?.(null as any, null as any);
                }
              }}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.status.ryo")}
            </MenubarCheckboxItem>

            {/* Chat List */}
            {Array.isArray(rooms) &&
              (() => {
                // Sort rooms: private rooms first, then public rooms
                const privateRooms = rooms.filter(
                  (room) => room.type === "private"
                );
                const publicRooms = rooms.filter(
                  (room) => room.type !== "private"
                );
                const sortedRooms = [...privateRooms, ...publicRooms];

                return sortedRooms.map((room) => (
                  <MenubarCheckboxItem
                    key={room.id}
                    checked={currentRoom?.id === room.id}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onRoomSelect(room);
                        onIrcChannelSelect?.(null as any, null as any);
                      }
                    }}
                    className="text-md h-6 px-3"
                  >
                    {room.type === "private"
                      ? getPrivateRoomDisplayName(room, username ?? null)
                      : `#${room.name}`}
                  </MenubarCheckboxItem>
                ));
              })()}

            {/* IRC Servers Section */}
            {ircServers.length > 0 && (
              <>
                <MenubarSeparator className="h-[2px] bg-black my-1" />
                {ircServers.map((server) => (
                  <React.Fragment key={server.id}>
                    <MenubarCheckboxItem
                      checked={
                        currentIrcChannel?.serverId === server.id &&
                        !currentIrcChannel?.channel
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          onIrcChannelSelect?.(server.id, null as any);
                          onRoomSelect(null);
                        }
                      }}
                      className="text-md h-6 px-3 font-semibold"
                    >
                      {server.host}
                      {server.connected ? (
                        <span className="ml-2 text-green-600">●</span>
                      ) : (
                        <span className="ml-2 text-gray-400">○</span>
                      )}
                    </MenubarCheckboxItem>
                    {server.channels.map((channel) => (
                      <MenubarCheckboxItem
                        key={`${server.id}:${channel}`}
                        checked={
                          currentIrcChannel?.serverId === server.id &&
                          currentIrcChannel?.channel === channel
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            onIrcChannelSelect?.(server.id, channel);
                            onRoomSelect(null);
                          }
                        }}
                        className="text-md h-6 px-3 pl-6"
                      >
                        {channel}
                      </MenubarCheckboxItem>
                    ))}
                    {onJoinIrcChannel && (
                      <MenubarItem
                        onClick={() => {
                          const channel = prompt("Enter channel name (e.g., #general):");
                          if (channel) {
                            onJoinIrcChannel(server.id, channel);
                          }
                        }}
                        className="text-md h-6 px-3 pl-6 text-gray-600"
                      >
                        Join channel...
                      </MenubarItem>
                    )}
                    {onDisconnectIrc && (
                      <MenubarItem
                        onClick={() => onDisconnectIrc(server.id)}
                        className="text-md h-6 px-3 pl-6 text-red-600"
                      >
                        Disconnect
                      </MenubarItem>
                    )}
                  </React.Fragment>
                ))}
              </>
            )}

            {/* Connect to IRC Server */}
            {onConnectIrc && (
              <>
                {(rooms.length > 0 || ircServers.length > 0) && (
                  <MenubarSeparator className="h-[2px] bg-black my-1" />
                )}
                <MenubarItem
                  onClick={onConnectIrc}
                  className="text-md h-6 px-3"
                >
                  Connect to IRC Server...
                </MenubarItem>
              </>
            )}
          </MenubarContent>
        </MenubarMenu>

        {/* Sounds Menu */}
        <MenubarMenu>
          <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
            {t("apps.chats.menu.sound")}
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={1} className="px-0">
            {Object.entries(SYNTH_PRESETS).map(([key, preset]) => (
              <MenubarCheckboxItem
                key={key}
                checked={synthPreset === key}
                onCheckedChange={(checked) => {
                  if (checked) setSynthPreset(key);
                }}
                className="text-md h-6 px-3"
              >
                {preset.name}
              </MenubarCheckboxItem>
            ))}
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarCheckboxItem
              checked={speechEnabled}
              onCheckedChange={(checked) => setSpeechEnabled(checked)}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.chatSpeech")}
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={typingSynthEnabled}
              onCheckedChange={(checked) => setTypingSynthEnabled(checked)}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.typingSynth")}
            </MenubarCheckboxItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarCheckboxItem
              checked={keepTalkingEnabled}
              onCheckedChange={(checked) => setKeepTalkingEnabled(checked)}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.keepTalking")}
            </MenubarCheckboxItem>
          </MenubarContent>
        </MenubarMenu>

        {/* View Menu */}
        <MenubarMenu>
          <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
            {t("common.menu.view")}
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={1} className="px-0">
            {/* Font Size Controls */}
            <MenubarItem
              onClick={onIncreaseFontSize}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.increaseFontSize")}
            </MenubarItem>
            <MenubarItem
              onClick={onDecreaseFontSize}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.decreaseFontSize")}
            </MenubarItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem
              onClick={onResetFontSize}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.resetFontSize")}
            </MenubarItem>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            {/* Sidebar Toggle */}
            <MenubarCheckboxItem
              checked={isSidebarVisible}
              onCheckedChange={(checked) => {
                console.log("[MenuBar] Toggle Sidebar menu item clicked");
                if (checked !== isSidebarVisible) onToggleSidebar();
              }}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.showRooms")}
            </MenubarCheckboxItem>
          </MenubarContent>
        </MenubarMenu>

        {/* Help Menu */}
        <MenubarMenu>
          <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
            {t("common.menu.help")}
          </MenubarTrigger>
          <MenubarContent align="start" sideOffset={1} className="px-0">
            <MenubarItem
              onClick={onShowHelp}
              className="text-md h-6 px-3"
            >
              {t("apps.chats.menu.chatsHelp")}
            </MenubarItem>
            {!isMacOsxTheme && (
              <>
                <MenubarItem
                  onSelect={() => setIsShareDialogOpen(true)}
                  className="text-md h-6 px-3"
                >
                  {t("common.menu.shareApp")}
                </MenubarItem>
                <MenubarSeparator className="h-[2px] bg-black my-1" />
                <MenubarItem
                  onClick={onShowAbout}
                  className="text-md h-6 px-3"
                >
                  {t("apps.chats.menu.aboutChats")}
                </MenubarItem>
              </>
            )}
          </MenubarContent>
        </MenubarMenu>
      </MenuBar>

      {/* Log In / Sign Up Dialog */}
      <LoginDialog
        isOpen={isVerifyDialogOpen}
        onOpenChange={(open) => {
          setVerifyDialogOpen(open);
        }}
        /* Login props */
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        /* Sign Up props */
        newUsername={verifyUsernameInput}
        onNewUsernameChange={setVerifyUsernameInput}
        newPassword={verifyPasswordInput}
        onNewPasswordChange={setVerifyPasswordInput}
        onSignUpSubmit={async () => {
          setVerifyDialogOpen(false);
          onSetUsername();
        }}
        isSignUpLoading={false}
        signUpError={null}
      />
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </>
  );
}
