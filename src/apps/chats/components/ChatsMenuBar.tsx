import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type ChatRoom } from "../../../../src/types/chat";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useAppStoreShallow } from "@/stores/helpers";
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
}: ChatsMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const appId = "chats";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const {
    speechEnabled,
    setSpeechEnabled,
    typingSynthEnabled,
    setTypingSynthEnabled,
    synthPreset,
    setSynthPreset,
  } = useAppStoreShallow((s) => ({
    speechEnabled: s.speechEnabled,
    setSpeechEnabled: s.setSpeechEnabled,
    typingSynthEnabled: s.typingSynthEnabled,
    setTypingSynthEnabled: s.setTypingSynthEnabled,
    synthPreset: s.synthPreset,
    setSynthPreset: s.setSynthPreset,
    debugMode: s.debugMode,
  }));

  return (
    <>
      <MenuBar inWindowFrame={isXpTheme}>
        {/* File Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
            >
              {t("common.menu.file")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={1} className="px-0">
            <DropdownMenuItem
              onClick={onSaveTranscript}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.chats.menu.saveTranscript")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onClearChats}
              disabled={currentRoom !== null}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.chats.menu.clearChat")}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="h-[2px] bg-black my-1" />

            {/* Account Section */}
            {username && authToken ? (
              // When logged in: Show Log Out only
              <DropdownMenuItem
                onClick={() => onLogout?.()}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                {t("apps.chats.menu.logOut")}
              </DropdownMenuItem>
            ) : (
              // When not logged in: Show Create Account and Login
              <>
                <DropdownMenuItem
                  onClick={onSetUsername}
                  className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
                >
                  {t("apps.chats.menu.createAccount")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onVerifyToken}
                  className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
                >
                  {t("apps.chats.menu.login")}
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            <DropdownMenuItem
              onClick={onClose}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("common.menu.close")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Chats Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
            >
              {t("apps.chats.menu.chats")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={1}
            className="px-0 max-h-[300px] overflow-y-auto"
          >
            {/* New Chat - available to all users */}
            <DropdownMenuItem
              onClick={onAddRoom}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.chats.menu.newChat")}
            </DropdownMenuItem>

            {/* Show separator between menu actions and chat list */}
            {rooms.length > 0 && (
              <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            )}

            {/* Ryo Chat Option */}
            <DropdownMenuItem
              onClick={() => onRoomSelect(null)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              <span className={cn(currentRoom !== null && "pl-4")}>
                {currentRoom === null ? `✓ ${t("apps.chats.status.ryo")}` : t("apps.chats.status.ryo")}
              </span>
            </DropdownMenuItem>

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
                  <DropdownMenuItem
                    key={room.id}
                    onClick={() => onRoomSelect(room)}
                    className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
                  >
                    <span
                      className={cn(!(currentRoom?.id === room.id) && "pl-4")}
                    >
                      {currentRoom?.id === room.id
                        ? room.type === "private"
                          ? `✓ ${getPrivateRoomDisplayName(
                              room,
                              username ?? null
                            )}`
                          : `✓ #${room.name}`
                        : room.type === "private"
                        ? getPrivateRoomDisplayName(room, username ?? null)
                        : `#${room.name}`}
                    </span>
                  </DropdownMenuItem>
                ));
              })()}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sounds Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
            >
              {t("apps.chats.menu.sound")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={1} className="px-0">
            {Object.entries(SYNTH_PRESETS).map(([key, preset]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => setSynthPreset(key)}
                className={cn(
                  "text-md h-6 px-3 active:bg-gray-900 active:text-white"
                )}
              >
                <span className={cn(!(synthPreset === key) && "pl-4")}>
                  {synthPreset === key ? `✓ ${preset.name}` : preset.name}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            <DropdownMenuItem
              onClick={() => setSpeechEnabled(!speechEnabled)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              <span className={cn(!speechEnabled && "pl-4")}>
                {speechEnabled ? `✓ ${t("apps.chats.menu.chatSpeech")}` : t("apps.chats.menu.chatSpeech")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTypingSynthEnabled(!typingSynthEnabled)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              <span className={cn(!typingSynthEnabled && "pl-4")}>
                {typingSynthEnabled ? `✓ ${t("apps.chats.menu.typingSynth")}` : t("apps.chats.menu.typingSynth")}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
            >
              {t("common.menu.view")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={1} className="px-0">
            {/* Font Size Controls */}
            <DropdownMenuItem
              onClick={onIncreaseFontSize}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.chats.menu.increaseFontSize")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDecreaseFontSize}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.chats.menu.decreaseFontSize")}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            <DropdownMenuItem
              onClick={onResetFontSize}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.chats.menu.resetFontSize")}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            {/* Sidebar Toggle */}
            <DropdownMenuItem
              onClick={() => {
                console.log("[MenuBar] Toggle Sidebar menu item clicked");
                onToggleSidebar();
              }}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              <span className={cn(!isSidebarVisible && "pl-4")}>
                {isSidebarVisible ? `✓ ${t("apps.chats.menu.showRooms")}` : t("apps.chats.menu.showRooms")}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Help Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              className="h-6 px-2 py-1 text-md focus-visible:ring-0 hover:bg-gray-200 active:bg-gray-900 active:text-white"
            >
              {t("common.menu.help")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={1} className="px-0">
            <DropdownMenuItem
              onClick={onShowHelp}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.chats.menu.chatsHelp")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setIsShareDialogOpen(true)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("common.menu.shareApp")}
            </DropdownMenuItem>
            <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            <DropdownMenuItem
              onClick={onShowAbout}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              {t("apps.chats.menu.aboutChats")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
