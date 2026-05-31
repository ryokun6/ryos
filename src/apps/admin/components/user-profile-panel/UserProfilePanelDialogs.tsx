import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";

type Props = Pick<
  UserProfilePanelViewModel,
  | "t"
  | "username"
  | "memories"
  | "isDeleteDialogOpen"
  | "setIsDeleteDialogOpen"
  | "isBanDialogOpen"
  | "setIsBanDialogOpen"
  | "isClearMemoryDialogOpen"
  | "setIsClearMemoryDialogOpen"
  | "isForceProcessDialogOpen"
  | "setIsForceProcessDialogOpen"
  | "handleDelete"
  | "handleBan"
  | "handleClearMemory"
  | "handleForceProcessDailyNotes"
>;

export function UserProfilePanelDialogs({
  t,
  username,
  memories,
  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  isBanDialogOpen,
  setIsBanDialogOpen,
  isClearMemoryDialogOpen,
  setIsClearMemoryDialogOpen,
  isForceProcessDialogOpen,
  setIsForceProcessDialogOpen,
  handleDelete,
  handleBan,
  handleClearMemory,
  handleForceProcessDailyNotes,
}: Props) {
  return (
    <>
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={handleDelete}
        title={t("apps.admin.dialogs.deleteTitle", { type: t("apps.admin.user.user") })}
        description={t("apps.admin.dialogs.deleteDescription", {
          type: t("apps.admin.user.user"),
          name: username,
        })}
      />
      <ConfirmDialog
        isOpen={isBanDialogOpen}
        onOpenChange={setIsBanDialogOpen}
        onConfirm={handleBan}
        title={t("apps.admin.dialogs.banTitle")}
        description={t("apps.admin.dialogs.banDescription", { username })}
      />
      <ConfirmDialog
        isOpen={isClearMemoryDialogOpen}
        onOpenChange={setIsClearMemoryDialogOpen}
        onConfirm={handleClearMemory}
        title={t("apps.admin.dialogs.clearMemoriesTitle")}
        description={t("apps.admin.dialogs.clearMemoriesDescription", {
          count: memories.length,
          username,
        })}
      />
      <ConfirmDialog
        isOpen={isForceProcessDialogOpen}
        onOpenChange={setIsForceProcessDialogOpen}
        onConfirm={handleForceProcessDailyNotes}
        title={t("apps.admin.dialogs.reprocessDailyNotesTitle")}
        description={t("apps.admin.dialogs.reprocessDailyNotesDescription", { username })}
      />
    </>
  );
}
