import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { CaretLeft, CaretRight, Image, MusicNotes, Note, Trash } from "@phosphor-icons/react";
import { motion, type Variants } from "motion/react";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
import { getActiveIpodTracks, useIpodStore } from "@/stores/useIpodStore";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { deleteJournalSelection } from "../journalSelectionDelete";
import {
  activeJournalDayId,
  canvasTextCard,
  currentJournalPage,
  journalCardExists,
} from "../logic";
import type { JournalScrapKind } from "../types";

const BUTTON_CLASS =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors disabled:hover:bg-transparent disabled:[&_svg]:opacity-40";
const BAR_EXPANDED_HEIGHT = 36;
const BAR_COLLAPSED = { width: 72, height: 5 } as const;
const BAR_SPRING = { type: "spring" as const, stiffness: 520, damping: 34, mass: 0.7 };
// Same enter spring as a Books toolbar control that mounts after the bar is
// already open (the remove-highlight button in BooksReaderPane).
const BAR_ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 4, scale: 0.6 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 640, damping: 32 },
  },
};

function RevealedToolbarButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <motion.button
      type="button"
      variants={BAR_ITEM_VARIANTS}
      initial="hidden"
      animate="visible"
      aria-label={label}
      className={className}
      onClick={onClick}
    >
      {children}
    </motion.button>
  );
}

export function useJournalViewChrome() {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const clearTimer = () => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => clearTimer, []);

  const show = () => {
    clearTimer();
    setOpen(true);
  };

  const hideSoon = (delay: number) => {
    clearTimer();
    timer.current = window.setTimeout(() => setOpen(false), delay);
  };

  const hoverProps = {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse") return;
      show();
    },
    onPointerLeave: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType !== "mouse") return;
      hideSoon(160);
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === "mouse") return;
      show();
      hideSoon(3000);
    },
    onFocus: () => show(),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      hideSoon(160);
    },
  };

  return { open, hoverProps };
}

function readJournalImage(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  const url = URL.createObjectURL(file);
  return new Promise<string | null>((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      const maxEdge = 960;
      const scale = Math.min(1, maxEdge / Math.max(image.width, image.height, 1));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      const data = canvas.toDataURL("image/jpeg", 0.72);
      resolve(data.length > 500_000 ? null : data);
    };
    image.onerror = () => resolve(null);
    image.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

export function JournalViewToolbar({
  l,
  open,
  pages,
}: {
  l: JournalLogic;
  open: boolean;
  pages: "canvas" | "none";
}) {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK);
  const { isAquaGlass, isDarkMode } = useThemeFlags();
  const buttonClass = cn(BUTTON_CLASS, isAquaGlass ? null : "hover:bg-white/20");
  const { t, journal } = l;
  const tracks = useIpodStore((state) => {
    const active = getActiveIpodTracks(state);
    if (active.length > 0) return active;
    return state.tracks.length > 0 ? state.tracks : state.appleMusicTracks;
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [songOpen, setSongOpen] = useState(false);
  const [barWidth, setBarWidth] = useState(220);
  const shown = open || songOpen;
  const boards = journal.canvasPages;
  const boardIndex = Math.max(0, boards.indexOf(journal.selectedCanvasPageId));
  const boardId = boards[boardIndex] ?? boards[0];
  const atStart = boardIndex <= 0;
  const atEnd = boardIndex >= boards.length - 1;
  const showPages = pages === "canvas";
  const showDelete =
    journal.selectedCardId !== null &&
    journalCardExists(journal, journal.selectedCardId);

  useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;
    const next = Math.ceil(node.scrollWidth);
    if (next > 0) setBarWidth(next);
  }, [showPages, boardIndex, shown, showDelete]);

  useEffect(() => {
    if (!songOpen) return;
    const close = (event: globalThis.PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      setSongOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [songOpen]);

  function go(direction: -1 | 1) {
    const next = boardIndex + direction;
    if (next >= 0 && next < boards.length) {
      l.api.selectCanvasPage(boards[next]);
      return;
    }
    if (direction > 0) l.api.addCanvasPage();
  }

  function add(
    kind: JournalScrapKind,
    extra?: {
      photo?: string;
      songId?: string;
      songTitle?: string;
      songArtist?: string | null;
      songCover?: string | null;
    }
  ) {
    const pageId = activeJournalDayId(journal) ?? currentJournalPage(journal).id;
    if (kind === "text" && showPages) {
      const decision = canvasTextCard(journal, pageId, boardId);
      if (decision.type === "select") {
        if (decision.boardId !== boardId) l.api.selectCanvasPage(decision.boardId);
        l.api.selectCard(decision.id);
        return;
      }
      if (decision.type === "adopt") {
        l.api.addScrap({
          id: decision.id,
          pageId,
          canvasPageId: boardId,
          kind,
        });
        return;
      }
    }
    l.api.addScrap({
      pageId,
      canvasPageId: showPages ? boardId : boards[0] ?? null,
      kind,
      ...extra,
    });
  }

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 flex justify-center"
      style={{ bottom: 6 }}
    >
      <div
        ref={menuRef}
        className="pointer-events-auto relative flex items-end justify-center"
        style={{ height: BAR_EXPANDED_HEIGHT }}
      >
      <motion.div
        role="toolbar"
        aria-label={t("apps.journal.toolbar.tools")}
        className={cn(
          "journal-view-toolbar flex items-center justify-center overflow-hidden rounded-full",
          isAquaGlass
            ? null
            : cn(
                "border shadow-lg backdrop-blur-md",
                isDarkMode
                  ? "border-white/15 bg-white/10 text-white"
                  : "border-black/10 bg-black/60 text-white"
              )
        )}
        initial={false}
        animate={
          shown
            ? { width: barWidth, height: BAR_EXPANDED_HEIGHT }
            : { width: BAR_COLLAPSED.width, height: BAR_COLLAPSED.height }
        }
        transition={BAR_SPRING}
      >
        <motion.div
          ref={measureRef}
          className="flex w-max items-center gap-0.5 px-1.5"
          initial={false}
          animate={{ opacity: shown ? 1 : 0, scale: shown ? 1 : 0.85 }}
          transition={{ duration: 0.14, ease: "easeOut" }}
          style={{ pointerEvents: shown ? "auto" : "none" }}
        >
        {showPages ? (
          <>
            <button
              type="button"
              aria-label={t("apps.journal.toolbar.previous")}
              className={buttonClass}
              disabled={atStart}
              onClick={() => {
                playClick();
                go(-1);
              }}
            >
              <CaretLeft size={16} weight="bold" />
            </button>
            <span className="max-w-[6.5rem] truncate px-1 text-center text-[12px] font-medium">
              {t("apps.journal.toolbar.page", { count: boardIndex + 1 })}
            </span>
            <button
              type="button"
              aria-label={atEnd ? t("apps.journal.toolbar.newPage") : t("apps.journal.toolbar.next")}
              className={buttonClass}
              onClick={() => {
                playClick();
                go(1);
              }}
            >
              <CaretRight size={16} weight="bold" />
            </button>
            <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-current/20" />
          </>
        ) : null}
        <button
          type="button"
          aria-label={t("apps.journal.toolbar.addNote")}
          className={buttonClass}
          onClick={() => {
            playClick();
            add("text");
          }}
        >
          <Note size={16} weight="bold" />
        </button>
        <button
          type="button"
          aria-label={t("apps.journal.toolbar.addImage")}
          className={buttonClass}
          onClick={() => {
            playClick();
            fileRef.current?.click();
          }}
        >
          <Image size={16} weight="bold" />
        </button>
        <div className="relative">
          <button
            type="button"
            aria-label={t("apps.journal.toolbar.addSong")}
            aria-expanded={songOpen}
            className={buttonClass}
            onClick={() => {
              playClick();
              setSongOpen((current) => !current);
            }}
          >
            <MusicNotes size={16} weight="bold" />
          </button>
        </div>
        {showDelete ? (
          <RevealedToolbarButton
            label={t("apps.journal.toolbar.delete")}
            className={buttonClass}
            onClick={() => {
              if (!journal.selectedCardId) return;
              playClick();
              deleteJournalSelection(journal.selectedCardId, l.api.removeCard);
            }}
          >
            <Trash size={16} weight="bold" />
          </RevealedToolbarButton>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void readJournalImage(file).then((photo) => {
              if (!photo) return;
              add("photo", { photo });
            });
          }}
        />
        </motion.div>
      </motion.div>
      {songOpen ? (
        <div
          className={cn(
            "journal-view-toolbar-menu absolute bottom-full right-0 z-40 mb-2 max-h-52 w-56 overflow-y-auto rounded-[14px] p-1 text-left shadow-lg",
            isAquaGlass
              ? "text-os-text-primary"
              : "border border-white/15 bg-black/80 text-white backdrop-blur-md"
          )}
        >
          {tracks.length === 0 ? (
            <p className={cn("px-2 py-1.5 text-xs", isAquaGlass ? "text-os-text-secondary" : "text-white/70")}>
              {t("apps.journal.toolbar.noSongs")}
            </p>
          ) : (
            tracks.slice(0, 300).map((track) => (
              <button
                key={track.id}
                type="button"
                className={cn(
                  "flex h-auto w-full flex-col items-start rounded-[10px] px-2 py-1 text-left",
                  isAquaGlass ? "hover:bg-black/5 os-dark:hover:bg-white/10" : "hover:bg-white/15"
                )}
                onClick={() => {
                  playClick();
                      add("song", {
                        songId: track.id,
                        songTitle: track.title,
                        songArtist: track.artist ?? null,
                        songCover: track.cover ?? null,
                      });
                  setSongOpen(false);
                }}
              >
                <span className="truncate text-[12px]">{track.title}</span>
                {track.artist ? (
                  <span className={cn("truncate text-[11px]", isAquaGlass ? "text-os-text-secondary" : "text-white/60")}>
                    {track.artist}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
      </div>
    </div>
  );
}
