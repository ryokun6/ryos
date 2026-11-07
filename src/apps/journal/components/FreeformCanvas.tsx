import { useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import "../journal.css";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { clamp, isJournalDayId, journalFragments, plainTextFromDoc } from "../logic";
import { formatJournalDay, journalText } from "../sampleContent";
import type { FragmentPosition, JournalDoc, JournalScrap } from "../types";
import { JournalCardMenu, type JournalCardMenuState } from "./JournalCardMenu";
import { JournalViewToolbar, useJournalViewChrome } from "./JournalViewToolbar";
import { isJournalSongPlayControl, JournalSongMark, toggleJournalSong } from "./journalSong";

interface CanvasCard {
  id: string;
  pageId: string;
  kind: "text" | "photo" | "song";
  text: string;
  photo: string | null;
  songId: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songCover: string | null;
  x: number;
  y: number;
  w: number;
  rotate: number;
}

const CLICK_SLOP_PX = 5;

interface DragState {
  id: string;
  pointerId: number;
  originX: number;
  originY: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  latest: FragmentPosition;
}

export function FreeformCanvas({
  positions,
  texts,
  scraps,
  showDates,
  interactive,
  activePageId,
  onMove,
  onOpenDay,
  l,
}: {
  positions: Record<string, FragmentPosition>;
  texts: Record<string, JournalDoc>;
  scraps: JournalScrap[];
  showDates: boolean;
  interactive: boolean;
  activePageId: string;
  onMove?: (id: string, position: FragmentPosition) => void;
  onOpenDay?: (pageId: string) => void;
  l: JournalLogic;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const { open, hoverProps } = useJournalViewChrome();
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [livePositions, setLivePositions] = useState<Record<string, FragmentPosition>>({});
  const [menu, setMenu] = useState<JournalCardMenuState | null>(null);
  const boards = l.journal.canvasPages;
  const boardId = boards.includes(l.journal.selectedCanvasPageId)
    ? l.journal.selectedCanvasPageId
    : boards[0];
  const onFirstBoard = boardId === boards[0];
  const boardScraps = scraps.filter((scrap) => (scrap.canvasPageId ?? boards[0]) === boardId);
  const cards: CanvasCard[] = [
    ...(onFirstBoard
      ? journalFragments(l.journal).map((fragment) => ({
      id: fragment.id,
      pageId: fragment.dayId,
      kind: fragment.kind,
      text: fragment.text ? journalText(fragment.text, language) : "",
      photo: fragment.photo,
      songId: null,
      songTitle: null,
      songArtist: null,
      songCover: null,
      x: fragment.x,
      y: fragment.y,
      w: fragment.w,
      rotate: fragment.rotate,
    }))
      : []),
    ...boardScraps.map((scrap) => ({
      id: scrap.id,
      pageId: scrap.pageId,
      kind: scrap.kind,
      text: plainTextFromDoc(texts[scrap.id] ?? { type: "doc" }),
      photo: scrap.photo,
      songId: scrap.songId,
      songTitle: scrap.songTitle,
      songArtist: scrap.songArtist,
      songCover: scrap.songCover,
      x: scrap.x,
      y: scrap.y,
      w: scrap.w,
      rotate: scrap.rotate,
    })),
  ];

  function positionFor(card: CanvasCard): FragmentPosition {
    return livePositions[card.id] ?? positions[card.id] ?? { x: card.x, y: card.y };
  }

  function onPointerDown(
    event: PointerEvent<HTMLElement>,
    fragment: CanvasCard
  ) {
    if (event.button !== 0 || event.ctrlKey) return;
    if (isJournalSongPlayControl(event.target)) return;
    if (!canvasRef.current || (!onOpenDay && (!interactive || !onMove))) return;
    const bounds = canvasRef.current.getBoundingClientRect();
    const current = positionFor(fragment);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      id: fragment.id,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      startX: current.x,
      startY: current.y,
      width: bounds.width || 1,
      height: bounds.height || 1,
      latest: current,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !interactive || !onMove) return;
    const fragment = cards.find((item) => item.id === drag.id);
    const maxX = fragment ? 100 - fragment.w : 80;
    drag.latest = {
      x: clamp(drag.startX + ((event.clientX - drag.originX) / drag.width) * 100, 0, maxX),
      y: clamp(drag.startY + ((event.clientY - drag.originY) / drag.height) * 100, 0, 88),
    };
    setLivePositions((current) => ({ ...current, [drag.id]: drag.latest }));
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    if (isJournalSongPlayControl(event.target)) {
      const cardId = event.currentTarget.dataset.journalCard;
      if (cardId) l.api.selectCard(cardId);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const moved =
      Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) >= CLICK_SLOP_PX;
    if (moved) {
      if (interactive) onMove?.(drag.id, drag.latest);
    } else {
      const fragment = cards.find((item) => item.id === drag.id);
      if (fragment) l.api.selectCard(fragment.id);
      if (fragment?.kind === "song" && fragment.songId) {
        toggleJournalSong(fragment.songId);
      } else if (fragment?.pageId) {
        onOpenDay?.(fragment.pageId);
      }
    }
    setLivePositions((current) => {
      const next = { ...current };
      delete next[drag.id];
      return next;
    });
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col" {...hoverProps}>
      <div
        ref={canvasRef}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) l.api.selectCard(null);
        }}
        className={cn(
          "journal-canvas relative min-h-[22rem] flex-1 overflow-hidden",
          "text-[#2c2416] os-dark:text-[#f3ead7]",
          "bg-[linear-gradient(transparent_31px,rgba(90,70,40,0.08)_32px)] bg-[length:100%_32px]"
        )}
      >
        {cards.map((fragment) => {
          const position = positionFor(fragment);
          const saved = texts[fragment.id];
          const text = saved ? plainTextFromDoc(saved) : fragment.text;
          const current = fragment.pageId === activePageId;
          const selected = l.journal.selectedCardId === fragment.id;
          const marked = selected || current;
          const isPhoto = fragment.kind === "photo" && Boolean(fragment.photo);
          const dateLabel =
            showDates && fragment.kind !== "song" && isJournalDayId(fragment.pageId)
              ? formatJournalDay(fragment.pageId, language)
              : null;
          return (
            <article
              key={fragment.id}
              aria-current={current ? "true" : undefined}
              data-journal-card={fragment.id}
              className={cn(
                "group absolute select-none overflow-hidden !rounded-[8px] shadow-[0_2px_8px_rgba(0,0,0,0.18)]",
                fragment.kind === "song" && "group/song",
                isPhoto
                  ? "border-0 bg-transparent p-0"
                  : cn(
                      "border border-black/10 bg-[#fffdf8] p-2 os-dark:border-white/10 os-dark:bg-[#3a342c]",
                      dateLabel && "pb-5"
                    ),
                marked && "z-[2] ring-2 ring-[#9a7424] os-dark:ring-[#e6c36a]",
                fragment.kind === "song"
                  ? "cursor-pointer touch-none"
                  : interactive
                    ? "cursor-grab touch-none active:cursor-grabbing"
                    : "cursor-pointer"
              )}
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: `${fragment.w}%`,
                transform: `rotate(${fragment.rotate}deg)`,
                borderRadius: 8,
              }}
              onPointerDown={(event) => onPointerDown(event, fragment)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                l.api.selectCard(fragment.id);
                setMenu({ x: event.clientX, y: event.clientY, id: fragment.id });
              }}
            >
              {isPhoto ? (
                <img
                  src={fragment.photo!}
                  alt={t("apps.journal.photo.alt")}
                  draggable={false}
                  className="block aspect-[4/3] w-full object-cover"
                  style={{ borderRadius: 8 }}
                />
              ) : fragment.kind === "song" ? (
                <div className="flex items-start gap-1.5">
                  <JournalSongMark songId={fragment.songId} cover={fragment.songCover} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-snug">
                      {fragment.songTitle || t("apps.journal.toolbar.addSong")}
                    </p>
                    {fragment.songArtist ? (
                      <p className="truncate text-xs text-os-text-secondary">{fragment.songArtist}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-snug">{text || t("apps.journal.toolbar.emptyNote")}</p>
              )}
              {dateLabel ? (
                <p
                  className={cn(
                    "pointer-events-none absolute bottom-1.5 left-1.5 text-[10px] font-medium leading-none",
                    isPhoto
                      ? "text-white opacity-0 transition-opacity group-hover:opacity-100"
                      : "text-os-text-secondary"
                  )}
                  style={
                    isPhoto
                      ? { textShadow: "0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.65)" }
                      : undefined
                  }
                >
                  {dateLabel}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      <JournalViewToolbar l={l} open={open} pages="canvas" />
      <JournalCardMenu menu={menu} onClose={() => setMenu(null)} l={l} />
    </div>
  );
}
