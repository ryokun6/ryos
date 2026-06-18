import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SongSearchDialogProps } from "./types";
import { useSongSearchDialog } from "./hooks/useSongSearchDialog";
import { SongSearchDialogBody } from "./components/SongSearchDialogBody";

export function SongSearchDialog(props: SongSearchDialogProps) {
  const vm = useSongSearchDialog(props);
  const { t, isWindowsTheme, isMacTheme } = vm;
  const { isOpen, onOpenChange } = props;

  const dialogContent = <SongSearchDialogBody {...vm} />;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(isWindowsTheme && "p-0")}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {isWindowsTheme ? (
          <>
            <DialogHeader>{t("apps.ipod.dialogs.addSongTitle")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogHeader>{t("apps.ipod.dialogs.addSongTitle")}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("apps.ipod.dialogs.addSongTitle")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("apps.ipod.dialogs.songSearchDescription")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
