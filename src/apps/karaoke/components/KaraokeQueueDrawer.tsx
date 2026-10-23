import { memo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Trash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { AppDrawer } from "@/components/shared/AppDrawer";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useSound, Sounds } from "@/hooks/useSound";
import type { ListenQueueItem } from "@/shared/listen/queue";

interface KaraokeQueueDrawerProps {
  isOpen: boolean;
  items: ListenQueueItem[];
  canEdit: boolean;
  onClose: () => void;
  onBump: (entryId: string) => void;
  onRemove: (entryId: string) => void;
  className?: string;
}

export const KaraokeQueueDrawer = memo(function KaraokeQueueDrawer({
  isOpen,
  items,
  canEdit,
  onClose,
  onBump,
  onRemove,
  className,
}: KaraokeQueueDrawerProps) {
  const { t } = useTranslation();
  const {
    isMacOSTheme,
    isSystem7Theme: isSystem7,
    isWindowsTheme,
    isWin98,
  } = useThemeFlags();

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

  const rowFont = cn(
    isMacOSTheme && "font-lucida-grande text-[11px]",
    isSystem7 && "font-chicago text-[12px]",
    isWindowsTheme && "font-tahoma text-[11px]"
  );

  return (
    <AppDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t("apps.karaoke.queue.title")}
      className={className}
      data-karaoke-queue=""
    >
      <ul
        className={cn("flex-1 min-h-0 overflow-y-auto", !isMacOSTheme && "bg-white")}
        aria-label={t("apps.karaoke.queue.title")}
      >
        {items.length === 0 ? (
          <li className={cn("px-3 py-2 opacity-60", rowFont)}>
            {t("apps.karaoke.queue.empty")}
          </li>
        ) : (
          items.map((item, index) => (
            <li
              key={item.entryId}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 text-black/90",
                rowFont,
                isMacOSTheme && "hover:bg-[#3875D7]/12",
                isSystem7 && "hover:bg-black hover:text-white",
                isWindowsTheme && !isWin98 && "hover:bg-[#316AC5]/15",
                isWin98 && "hover:bg-[#000080] hover:text-white"
              )}
            >
              <span className="shrink-0 w-5 text-right tabular-nums opacity-70">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate">{item.title}</div>
                <div className="truncate opacity-60">
                  {item.artist ? `${item.artist} · ` : ""}
                  {t("apps.karaoke.queue.from", { name: item.requestedBy })}
                </div>
              </div>
              {canEdit ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      "px-1.5 py-0.5 hover:underline focus:outline-none",
                      isWin98 && "border border-[#808080] bg-[#c0c0c0] text-black hover:no-underline"
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      onBump(item.entryId);
                    }}
                  >
                    {t("apps.karaoke.queue.playNext")}
                  </button>
                  <button
                    type="button"
                    aria-label={t("apps.karaoke.queue.remove")}
                    title={t("apps.karaoke.queue.remove")}
                    className="p-1 focus:outline-none"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemove(item.entryId);
                    }}
                  >
                    <Trash size={14} weight="regular" />
                  </button>
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </AppDrawer>
  );
});
