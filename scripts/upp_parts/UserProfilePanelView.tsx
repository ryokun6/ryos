import { ScrollArea } from "@/components/ui/scroll-area";
import { UserProfilePanelActions } from "./UserProfilePanelActions";
import { UserProfilePanelDialogs } from "./UserProfilePanelDialogs";
import { UserProfilePanelHeader } from "./UserProfilePanelHeader";
import { UserProfilePanelHeartbeatsSection } from "./UserProfilePanelHeartbeatsSection";
import { UserProfilePanelMemoriesSection } from "./UserProfilePanelMemoriesSection";
import { UserProfilePanelMessagesSection } from "./UserProfilePanelMessagesSection";
import { UserProfilePanelNotFound } from "./UserProfilePanelNotFound";
import { UserProfilePanelRoomsSection } from "./UserProfilePanelRoomsSection";
import { UserProfilePanelStatsSection } from "./UserProfilePanelStatsSection";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";

export function UserProfilePanelView(vm: UserProfilePanelViewModel) {
  const { isLoading, profile, onBack, t } = vm;
  if (!isLoading && !profile) {
    return <UserProfilePanelNotFound t={t} onBack={onBack} />;
  }
  return (
    <div className="flex flex-col h-full font-geneva-12">
      <UserProfilePanelHeader
        t={vm.t}
        username={vm.username}
        onBack={vm.onBack}
        profile={vm.profile}
        isLoading={vm.isLoading}
        isTargetAdmin={vm.isTargetAdmin}
        formatRelativeTime={vm.formatRelativeTime}
      />
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          <UserProfilePanelStatsSection t={vm.t} profile={vm.profile} isLoading={vm.isLoading} formatDate={vm.formatDate} />
          <UserProfilePanelActions
            t={vm.t}
            profile={vm.profile}
            isLoading={vm.isLoading}
            isTargetAdmin={vm.isTargetAdmin}
            showBanInput={vm.showBanInput}
            banReason={vm.banReason}
            dispatchProfileUi={vm.dispatchProfileUi}
            setIsBanDialogOpen={vm.setIsBanDialogOpen}
            setIsDeleteDialogOpen={vm.setIsDeleteDialogOpen}
            handleUnban={vm.handleUnban}
          />
          <UserProfilePanelMemoriesSection
            t={vm.t}
            isLoading={vm.isLoading}
            memories={vm.memories}
            dailyNotes={vm.dailyNotes}
            isMemoriesOpen={vm.isMemoriesOpen}
            hasLoadedMemories={vm.hasLoadedMemories}
            isMemoriesLoading={vm.isMemoriesLoading}
            expandedMemories={vm.expandedMemories}
            expandedDailyNotes={vm.expandedDailyNotes}
            isClearingMemory={vm.isClearingMemory}
            isProcessingNotes={vm.isProcessingNotes}
            toggleMemoriesSection={vm.toggleMemoriesSection}
            toggleMemory={vm.toggleMemory}
            toggleDailyNote={vm.toggleDailyNote}
            formatRelativeTime={vm.formatRelativeTime}
            setIsClearMemoryDialogOpen={vm.setIsClearMemoryDialogOpen}
            setIsForceProcessDialogOpen={vm.setIsForceProcessDialogOpen}
          />
          <UserProfilePanelHeartbeatsSection
            t={vm.t}
            isLoading={vm.isLoading}
            heartbeats={vm.heartbeats}
            isHeartbeatsOpen={vm.isHeartbeatsOpen}
            hasLoadedHeartbeats={vm.hasLoadedHeartbeats}
            isHeartbeatsLoading={vm.isHeartbeatsLoading}
            expandedHeartbeats={vm.expandedHeartbeats}
            toggleHeartbeatsSection={vm.toggleHeartbeatsSection}
            toggleHeartbeat={vm.toggleHeartbeat}
            formatRelativeTime={vm.formatRelativeTime}
          />
          <UserProfilePanelRoomsSection
            t={vm.t}
            profile={vm.profile}
            isLoading={vm.isLoading}
            isRoomsOpen={vm.isRoomsOpen}
            roomsCount={vm.roomsCount}
            dispatchProfileUi={vm.dispatchProfileUi}
          />
          <UserProfilePanelMessagesSection
            t={vm.t}
            messages={vm.messages}
            isLoading={vm.isLoading}
            isMessagesOpen={vm.isMessagesOpen}
            isMessagesLoading={vm.isMessagesLoading}
            messagesCount={vm.messagesCount}
            toggleMessagesSection={vm.toggleMessagesSection}
            formatRelativeTime={vm.formatRelativeTime}
          />
        </div>
      </ScrollArea>
      <UserProfilePanelDialogs
        t={vm.t}
        username={vm.username}
        memories={vm.memories}
        isDeleteDialogOpen={vm.isDeleteDialogOpen}
        setIsDeleteDialogOpen={vm.setIsDeleteDialogOpen}
        isBanDialogOpen={vm.isBanDialogOpen}
        setIsBanDialogOpen={vm.setIsBanDialogOpen}
        isClearMemoryDialogOpen={vm.isClearMemoryDialogOpen}
        setIsClearMemoryDialogOpen={vm.setIsClearMemoryDialogOpen}
        isForceProcessDialogOpen={vm.isForceProcessDialogOpen}
        setIsForceProcessDialogOpen={vm.setIsForceProcessDialogOpen}
        handleDelete={vm.handleDelete}
        handleBan={vm.handleBan}
        handleClearMemory={vm.handleClearMemory}
        handleForceProcessDailyNotes={vm.handleForceProcessDailyNotes}
      />
    </div>
  );
}
