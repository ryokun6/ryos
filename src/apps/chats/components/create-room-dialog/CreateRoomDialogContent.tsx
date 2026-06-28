import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import {
  ThemedTabsList,
  ThemedTabsTrigger,
} from "@/components/shared/ThemedTabs";
import { cn } from "@/lib/utils";
import { CreateRoomDialogIrcTab } from "./CreateRoomDialogIrcTab";
import { CreateRoomDialogPrivateTab } from "./CreateRoomDialogPrivateTab";
import { CreateRoomDialogPublicTab } from "./CreateRoomDialogPublicTab";
import type { CreateRoomDialogViewModel } from "./useCreateRoomDialog";

type Props = {
  vm: CreateRoomDialogViewModel;
};

export function CreateRoomDialogContent({ vm }: Props) {
  const {
    t,
    theme,
    isAdmin,
    isLoading,
    error,
    activeTab,
    setActiveTab,
    handleSubmit,
    onOpenChange,
    submitDisabled,
  } = vm;
  const { themeFont, themeFontStyle } = theme;

  return (
<div
      className={cn(
        theme.isWindowsTheme ? "pt-2 pb-6 px-4" : "pt-3 pb-6 px-6",
        "min-w-0 w-full max-w-full"
      )}
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "public" | "private" | "irc")}
        className="w-full min-w-0 max-w-full overflow-x-hidden"
      >
        <ThemedTabsList
          className={cn(
            "grid w-full",
            isAdmin ? "grid-cols-3" : "grid-cols-1"
          )}
        >
          <ThemedTabsTrigger value="private">
            {t("apps.chats.sidebar.private")}
          </ThemedTabsTrigger>
          {isAdmin && (
            <ThemedTabsTrigger value="public">
              {t("apps.chats.dialogs.public")}
            </ThemedTabsTrigger>
          )}
          {isAdmin && <ThemedTabsTrigger value="irc">IRC</ThemedTabsTrigger>}
        </ThemedTabsList>
        {isAdmin && (
          <CreateRoomDialogPublicTab
            t={vm.t}
            theme={vm.theme}
            roomName={vm.roomName}
            setRoomName={vm.setRoomName}
            isLoading={vm.isLoading}
          />
        )}
        {isAdmin && <CreateRoomDialogIrcTab {...vm} />}
        <CreateRoomDialogPrivateTab
          t={vm.t}
          theme={vm.theme}
          searchTerm={vm.searchTerm}
          setSearchTerm={vm.setSearchTerm}
          isLoading={vm.isLoading}
          isSearching={vm.isSearching}
          selectedUsers={vm.selectedUsers}
          users={vm.users}
          toggleUserSelection={vm.toggleUserSelection}
        />
      </Tabs>

      {error && (
        <p
          className={cn("text-red-600 mt-3", themeFont)}
          style={themeFontStyle}
        >
          {error}
        </p>
      )}

      <DialogFooter className="mt-4 gap-1.5">
        <Button
          variant="retro"
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
          className={cn("h-7", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.chats.dialogs.cancel")}
        </Button>
        <Button
          variant="retro"
          onClick={handleSubmit}
          disabled={submitDisabled}
          className={cn("h-7", themeFont)}
          style={themeFontStyle}
        >
          {isLoading
            ? t("apps.chats.dialogs.creating")
            : t("apps.chats.dialogs.create")}
        </Button>
      </DialogFooter>
    </div>
  );
}
