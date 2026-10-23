import { memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { useSound, Sounds } from "@/hooks/useSound";
import type { DisplayQueueItem } from "../queuePending";
import { KaraokeQueueList } from "./KaraokeQueueList";

interface KaraokeQueueDrawerProps {
  isOpen: boolean;
  items: ReadonlyArray<DisplayQueueItem>;
  canEdit: boolean;
  /** When set, the drawer header shows a close button. Karaoke closes from the toolbar toggle. */
  onClose?: () => void;
  onBump: (entryId: string) => void;
  onRemove: (entryId: string) => void;
  onAddSongs?: () => void;
  className?: string;
}

export const KaraokeQueueDrawer = memo(function KaraokeQueueDrawer({
  isOpen,
  items,
  canEdit,
  onClose,
  onBump,
  onRemove,
  onAddSongs,
  className,
}: KaraokeQueueDrawerProps) {
  const { t } = useTranslation();
  const { play: playDrawerOpen } = useSound(Sounds.WINDOW_ZOOM_MAXIMIZE);
  const { play: playDrawerClose } = useSound(Sounds.WINDOW_ZOOM_MINIMIZE);
  const drawerSoundMountedRef = useRef(false);
  useEffect(() => {
    if (!drawerSoundMountedRef.current) {
      drawerSoundMountedRef.current = true;
      return;
    }
    if (isOpen) void playDrawerOpen();
    else void playDrawerClose();
  }, [isOpen, playDrawerOpen, playDrawerClose]);

  return (
    <AppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t("apps.karaoke.queue.title")}
      className={className}
      data-karaoke-queue=""
    >
      <KaraokeQueueList
        items={items}
        canEdit={canEdit}
        onBump={onBump}
        onRemove={onRemove}
        onAddSongs={onAddSongs}
      />
    </AppDrawer>
  );
});
