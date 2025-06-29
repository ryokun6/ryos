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
import { toast } from "sonner";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useAppStoreShallow } from "@/stores/helpers";
import { SYNTH_PRESETS } from "@/hooks/useChatSynth";
import { getPrivateRoomDisplayName } from "@/utils/chat";
import { AuthDialog } from "@/components/dialogs/AuthDialog";

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

  loginFormUsername: string;
  setLoginFormUsername: (input: string) => void;
  loginFormPassword: string;
  setLoginFormPassword: (input: string) => void;
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

  loginFormUsername,
  setLoginFormUsername,
  loginFormPassword,
  setLoginFormPassword,
  setVerifyUsernameInput,
  isVerifyingToken,
  verifyError,
  handleVerifyTokenSubmit,
  onLogout,
}: ChatsMenuBarProps) {
  const {
    speechEnabled,
    setSpeechEnabled,
    typingSynthEnabled,
    setTypingSynthEnabled,
    synthPreset,
    setSynthPreset,
    debugMode,
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
      <MenuBar>
        {/* File Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
            >
              File
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={1} className="px-0">
            <DropdownMenuItem
              onClick={onSaveTranscript}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Save Transcript...
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onClearChats}
              disabled={currentRoom !== null}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Clear Chat
            </DropdownMenuItem>
            <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            <DropdownMenuItem
              onClick={onClose}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Close
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Rooms Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="default"
              className="h-6 text-md px-2 py-1 border-none hover:bg-gray-200 active:bg-gray-900 active:text-white focus-visible:ring-0"
            >
              Rooms
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={1}
            className="px-0 max-h-[300px] overflow-y-auto"
          >
            {/* New Room - available to all users */}
            <DropdownMenuItem
              onClick={onAddRoom}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              New Chat...
            </DropdownMenuItem>

            {/* Create Account - show when debugMode OR username not set OR authToken is null */}
            {(debugMode || !username || !authToken) && (
              <DropdownMenuItem
                onClick={onSetUsername}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                Create Account...
              </DropdownMenuItem>
            )}

            {/* Log In - visible only in debug mode */}
            {debugMode && (
              <DropdownMenuItem
                onClick={onVerifyToken}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                Log In...
              </DropdownMenuItem>
            )}

            {/* Log Out - show when user is logged in and debug mode is enabled */}
            {username && authToken && onLogout && debugMode && (
              <DropdownMenuItem
                onClick={() => onLogout()}
                className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
              >
                Log Out
              </DropdownMenuItem>
            )}

            {/* Show separator between menu actions and room list */}
            {rooms.length > 0 && (
              <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            )}

            {/* Ryo Chat Option */}
            <DropdownMenuItem
              onClick={() => onRoomSelect(null)}
              className={cn(
                "text-md h-6 px-3 active:bg-gray-900 active:text-white",
                currentRoom === null && "bg-gray-200"
              )}
            >
              <span className={cn(currentRoom !== null && "pl-4")}>
                {currentRoom === null ? "✓ @ryo" : "@ryo"}
              </span>
            </DropdownMenuItem>

            {/* Room List */}
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
                    className={cn(
                      "text-md h-6 px-3 active:bg-gray-900 active:text-white",
                      currentRoom?.id === room.id && "bg-gray-200"
                    )}
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
              Sound
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={1} className="px-0">
            {Object.entries(SYNTH_PRESETS).map(([key, preset]) => (
              <DropdownMenuItem
                key={key}
                onClick={() => setSynthPreset(key)}
                className={cn(
                  "text-md h-6 px-3 active:bg-gray-900 active:text-white",
                  synthPreset === key && "bg-gray-200"
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
                {speechEnabled ? "✓ Chat Speech" : "Chat Speech"}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTypingSynthEnabled(!typingSynthEnabled)}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              <span className={cn(!typingSynthEnabled && "pl-4")}>
                {typingSynthEnabled ? "✓ Typing Synth" : "Typing Synth"}
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
              View
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={1} className="px-0">
            {/* Font Size Controls */}
            <DropdownMenuItem
              onClick={onIncreaseFontSize}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Increase Font Size
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onDecreaseFontSize}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Decrease Font Size
            </DropdownMenuItem>
            <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            <DropdownMenuItem
              onClick={onResetFontSize}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Reset Font Size
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
                {isSidebarVisible ? "✓ Show Rooms" : "Show Rooms"}
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
              Help
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={1} className="px-0">
            <DropdownMenuItem
              onClick={onShowHelp}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Chats Help
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                const appId = "chats"; // Specific app ID
                const shareUrl = generateAppShareUrl(appId);
                if (!shareUrl) return;
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  toast.success("App link copied!", {
                    description: `Link to ${appId} copied to clipboard.`,
                  });
                } catch (err) {
                  console.error("Failed to copy app link: ", err);
                  toast.error("Failed to copy link", {
                    description: "Could not copy link to clipboard.",
                  });
                }
              }}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              Share App...
            </DropdownMenuItem>
            <DropdownMenuSeparator className="h-[2px] bg-black my-1" />
            <DropdownMenuItem
              onClick={onShowAbout}
              className="text-md h-6 px-3 active:bg-gray-900 active:text-white"
            >
              About Chats
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </MenuBar>

      {/* Auth Dialog */}
      <AuthDialog
        isOpen={isVerifyDialogOpen}
        onOpenChange={(open: boolean) => {
          setVerifyDialogOpen(open);
        }}
        // Login props - use dedicated login form states to prevent re-renders
        onLogin={async (username: string, password: string) => {
          // Set the verification username to the entered username for login
          setVerifyUsernameInput(username);
          await handleVerifyTokenSubmit(password, true);
        }}
        loginUsernameInput={loginFormUsername}
        onLoginUsernameInputChange={setLoginFormUsername}
        loginPasswordInput={loginFormPassword}
        onLoginPasswordInputChange={setLoginFormPassword}
        // Sign up props (not used in this component since ChatsAppComponent handles sign up)
        onSignUp={async () => {}}
        signUpUsername=""
        onSignUpUsernameChange={() => {}}
        signUpPassword=""
        onSignUpPasswordChange={() => {}}
        // Common props
        isLoading={isVerifyingToken}
        error={verifyError}
        onErrorChange={() => {}}
        initialTab="login"
      />
    </>
  );
}
