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
  const { t, isWindowsTheme, isMacTheme, queueOnly } = vm;
  const { isOpen, onOpenChange, aboveFullscreen = false } = props;

  const dialogContent = <SongSearchDialogBody {...vm} />;
  const dialogTitle = queueOnly
    ? t("apps.karaoke.queue.addSongs")
    : t("apps.ipod.dialogs.addSongTitle");

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(isWindowsTheme && "p-0", aboveFullscreen && "z-[10050]")}
        overlayClassName={aboveFullscreen ? "z-[10040]" : undefined}
        disableSheet={aboveFullscreen}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">
              {dialogTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {queueOnly
                ? t("apps.karaoke.queue.addSongsHint")
                : t("apps.ipod.dialogs.songSearchDescription")}
            </DialogDescription>
            <DialogHeader>{dialogTitle}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogTitle className="sr-only">
              {dialogTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {queueOnly
                ? t("apps.karaoke.queue.addSongsHint")
                : t("apps.ipod.dialogs.songSearchDescription")}
            </DialogDescription>
            <DialogHeader>{dialogTitle}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {queueOnly
                  ? t("apps.karaoke.queue.addSongsHint")
                  : t("apps.ipod.dialogs.songSearchDescription")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
