import type { ComponentProps } from "react";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "../..";
import type { TFunction } from "i18next";

type TranslatedHelpItems = ComponentProps<typeof HelpDialog>["helpItems"];

export interface DeleteTarget {
  type: "user" | "room" | "message" | "song" | "allSongs";
  id: string;
  name: string;
}

export interface AdminAppDialogsProps {
  isHelpDialogOpen: boolean;
  setIsHelpDialogOpen: (open: boolean) => void;
  translatedHelpItems: TranslatedHelpItems;
  isAboutDialogOpen: boolean;
  setIsAboutDialogOpen: (open: boolean) => void;
  isDeleteDialogOpen: boolean;
  setIsDeleteDialogOpen: (open: boolean) => void;
  deleteTarget: DeleteTarget | null;
  onDeleteConfirm: () => void;
  t: TFunction;
}

export function AdminAppDialogs({
  isHelpDialogOpen,
  setIsHelpDialogOpen,
  translatedHelpItems,
  isAboutDialogOpen,
  setIsAboutDialogOpen,
  isDeleteDialogOpen,
  setIsDeleteDialogOpen,
  deleteTarget,
  onDeleteConfirm,
  t,
}: AdminAppDialogsProps) {
  return (
    <>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        helpItems={translatedHelpItems}
        appId="admin"
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="admin"
      />
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirm={onDeleteConfirm}
        title={t("apps.admin.dialogs.deleteTitle", {
          type:
            deleteTarget?.type === "allSongs"
              ? t("apps.admin.songs.allSongs", "all songs")
              : deleteTarget?.type === "song"
                ? t("common.dialog.share.itemTypes.song")
                : deleteTarget?.type === "user"
                  ? t("apps.admin.user.user")
                  : deleteTarget?.type === "room"
                    ? t("apps.admin.profile.room")
                    : deleteTarget?.type === "message"
                      ? t("apps.admin.tableHeaders.message")
                      : deleteTarget?.type,
        })}
        description={t("apps.admin.dialogs.deleteDescription", {
          type:
            deleteTarget?.type === "allSongs"
              ? t("apps.admin.songs.allSongs", "all songs")
              : deleteTarget?.type === "song"
                ? t("common.dialog.share.itemTypes.song")
                : deleteTarget?.type === "user"
                  ? t("apps.admin.user.user")
                  : deleteTarget?.type === "room"
                    ? t("apps.admin.profile.room")
                    : deleteTarget?.type === "message"
                      ? t("apps.admin.tableHeaders.message")
                      : deleteTarget?.type,
          name: deleteTarget?.name,
        })}
      />
    </>
  );
}
