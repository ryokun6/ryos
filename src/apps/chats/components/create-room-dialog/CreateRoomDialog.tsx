import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CreateRoomDialogContent } from "./CreateRoomDialogContent";
import type { CreateRoomDialogProps } from "./types";
import { useCreateRoomDialog } from "./useCreateRoomDialog";

export function CreateRoomDialog(props: CreateRoomDialogProps) {
  const { isOpen, onOpenChange, isAdmin } = props;
  const vm = useCreateRoomDialog(props);
  const { t, theme } = vm;
  const { isWindowsTheme, isMacOSTheme } = theme;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-w-[400px] min-w-0 w-full",
          isWindowsTheme && "p-0 overflow-hidden"
        )}
        style={isWindowsTheme ? { fontSize: "11px" } : undefined}
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">
              {t("apps.chats.dialogs.newChatTitle")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isAdmin
                ? t("apps.chats.dialogs.newChatDescription")
                : t("apps.chats.dialogs.newChatDescriptionPrivate")}
            </DialogDescription>
            <DialogHeader>
              {t("apps.chats.dialogs.newChatTitle")}
            </DialogHeader>
            <div className="window-body min-w-0">
              <CreateRoomDialogContent vm={vm} />
            </div>
          </>
        ) : isMacOSTheme ? (
          <>
            <DialogTitle className="sr-only">
              {t("apps.chats.dialogs.newChatTitle")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isAdmin
                ? t("apps.chats.dialogs.newChatDescription")
                : t("apps.chats.dialogs.newChatDescriptionPrivate")}
            </DialogDescription>
            <DialogHeader>
              {t("apps.chats.dialogs.newChatTitle")}
            </DialogHeader>
            <CreateRoomDialogContent vm={vm} />
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("apps.chats.dialogs.newChatTitle")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {isAdmin
                  ? t("apps.chats.dialogs.newChatDescription")
                  : t("apps.chats.dialogs.newChatDescriptionPrivate")}
              </DialogDescription>
            </DialogHeader>
            <CreateRoomDialogContent vm={vm} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
