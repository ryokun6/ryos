import { useTranslation } from "react-i18next";
import { ArrowUp, Trash } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type { DisplayQueueItem } from "../queuePending";

interface KaraokeQueueListProps {
  items: ReadonlyArray<DisplayQueueItem>;
  canEdit: boolean;
  onBump: (entryId: string) => void;
  onRemove: (entryId: string) => void;
  onAddSongs?: () => void;
}

export function KaraokeQueueList({
  items,
  canEdit,
  onBump,
  onRemove,
  onAddSongs,
}: KaraokeQueueListProps) {
  const { t } = useTranslation();
  const {
    isMacOSTheme,
    isSystem7Theme: isSystem7,
    isWindowsTheme,
    isWin98,
  } = useThemeFlags();

  const rowFont = cn(
    isMacOSTheme && "font-lucida-grande text-[11px]",
    isSystem7 && "font-chicago text-[12px]",
    isWindowsTheme && "font-tahoma text-[11px]"
  );

  const showAdd = canEdit && Boolean(onAddSongs);
  const addSongsButton = showAdd ? (
    <button
      type="button"
      data-karaoke-queue-add=""
      className={cn(
        "w-full min-w-0 justify-center px-3 py-2 h-auto text-[12px] leading-normal focus:outline-none",
        rowFont,
        isMacOSTheme && "aqua-button primary",
        isSystem7 &&
          "inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90",
        isWindowsTheme && "button"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onAddSongs?.();
      }}
    >
      {t("apps.karaoke.queue.addSongs")}
    </button>
  ) : null;

  return (
    <>
      <ul
        className={cn(
          "flex flex-1 min-h-0 flex-col overflow-y-auto",
          !isMacOSTheme && "bg-white"
        )}
        aria-label={t("apps.karaoke.queue.title")}
      >
        {items.length === 0 ? (
          <li
            className={cn(
              "flex flex-1 items-center justify-center px-3 text-center",
              rowFont
            )}
          >
            <span className="opacity-60">{t("apps.karaoke.queue.empty")}</span>
          </li>
        ) : (
          items.map((item, index) => (
            <li
              key={item.entryId}
              data-karaoke-queue-pending={item.pending ? "" : undefined}
              aria-busy={item.pending || undefined}
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
              {canEdit && !item.pending ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("apps.karaoke.queue.playNext")}
                    title={t("apps.karaoke.queue.playNext")}
                    className="p-1 focus:outline-none"
                    onClick={(event) => {
                      event.stopPropagation();
                      onBump(item.entryId);
                    }}
                  >
                    <ArrowUp size={14} weight="bold" />
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
      {showAdd ? (
        <div
          className={cn(
            "shrink-0 w-full min-w-0 border-t px-2 py-2",
            isMacOSTheme ? "border-black/10" : "border-black/15"
          )}
        >
          {addSongsButton}
        </div>
      ) : null}
    </>
  );
}
