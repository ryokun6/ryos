import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import "../journal.css";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { clamp, isJournalDayId, journalFragments, plainTextFromDoc } from "../logic";
import { formatJournalDay, journalText, sampleDoc } from "../sampleContent";
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

/**
 * Cards are laid out on this frame, not on the live window.
 * Widths and positions stay put when the canvas pane is resized.
 */
const CANVAS_LAYOUT_WIDTH = 1068;
const CANVAS_LAYOUT_HEIGHT = 1360;

const CANVAS_CARD_WIDTH = {
  text: 220,
  photo: 196,
  song: 176,
} as const;

function cardWidth(kind: CanvasCard["kind"]): number {
  return CANVAS_CARD_WIDTH[kind];
}

function CanvasNote({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const overflows = node.scrollHeight - node.clientHeight > 1;
      setClipped((current) => (current === overflows ? current : overflows));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return (
    <p
      ref={ref}
      className={cn("journal-canvas-note text-sm leading-snug", clipped && "journal-canvas-note-clip")}
    >
      {text}
    </p>
  );
}

/** Long enough that a slow double-click still edits instead of opening the day. */
export const CANVAS_TEXT_DOUBLE_CLICK_MS = 500;

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
  const lastClickRef = useRef<{ id: string; at: number } | null>(null);
  const pendingClickRef = useRef<CanvasCard | null>(null);
  const pendingTimerRef = useRef<number | null>(null);
  const editSessionRef = useRef<{ id: string; initial: string; cancel: boolean } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [livePositions, setLivePositions] = useState<Record<string, FragmentPosition>>({});
  const [menu, setMenu] = useState<JournalCardMenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  function textFor(card: CanvasCard): string {
    const saved = texts[card.id];
    return saved ? plainTextFromDoc(saved) : card.text;
  }

  function clearPendingTimer() {
    if (pendingTimerRef.current === null) return;
    window.clearTimeout(pendingTimerRef.current);
    pendingTimerRef.current = null;
  }

  function activateCard(card: CanvasCard) {
    if (card.kind === "song" && card.songId) {
      toggleJournalSong(card.songId);
      return;
    }
    if (card.pageId) onOpenDay?.(card.pageId);
  }

  function flushPendingClick() {
    const pending = pendingClickRef.current;
    pendingClickRef.current = null;
    clearPendingTimer();
    if (pending) activateCard(pending);
  }

  function armTextClick(card: CanvasCard) {
    clearPendingTimer();
    pendingClickRef.current = card;
    pendingTimerRef.current = window.setTimeout(() => {
      pendingTimerRef.current = null;
      const pending = pendingClickRef.current;
      if (!pending || pending.id !== card.id) return;
      pendingClickRef.current = null;
      activateCard(pending);
    }, CANVAS_TEXT_DOUBLE_CLICK_MS);
  }

  function beginTextEdit(card: CanvasCard) {
    const initial = textFor(card);
    editSessionRef.current = { id: card.id, initial, cancel: false };
    setEditingId(card.id);
  }

  function finishTextEdit(value: string) {
    const session = editSessionRef.current;
    editSessionRef.current = null;
    setEditingId(null);
    if (!session || session.cancel || value === session.initial) return;
    l.api.setEntryText(session.id, sampleDoc(value));
  }

  useEffect(() => clearPendingTimer, []);

  useEffect(() => {
    const node = editorRef.current;
    if (!editingId || !node) return;
    node.focus();
    node.select();
  }, [editingId]);

  function onPointerDown(
    event: PointerEvent<HTMLElement>,
    fragment: CanvasCard
  ) {
    if (event.button !== 0 || event.ctrlKey) return;
    if (isJournalSongPlayControl(event.target)) return;
    if (editingId === fragment.id) return;
    if (!canvasRef.current || (!onOpenDay && (!interactive || !onMove))) return;
    if (pendingClickRef.current && pendingClickRef.current.id !== fragment.id) {
      flushPendingClick();
    } else if (pendingClickRef.current?.id === fragment.id) {
      clearPendingTimer();
    }
    const bounds = canvasRef.current.getBoundingClientRect();
    const current = positionFor(fragment);
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
    const target = event.currentTarget;
    if (typeof target.setPointerCapture === "function") {
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Capture is only a convenience. The card still tracks the gesture.
      }
    }
  }

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !interactive || !onMove) return;
    const fragment = cards.find((item) => item.id === drag.id);
    const maxX = fragment ? 100 - (cardWidth(fragment.kind) / CANVAS_LAYOUT_WIDTH) * 100 : 80;
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
    const target = event.currentTarget;
    if (
      typeof target.releasePointerCapture === "function" &&
      target.hasPointerCapture?.(drag.pointerId)
    ) {
      try {
        target.releasePointerCapture(drag.pointerId);
      } catch {
        // The pointer is already released.
      }
    }
    const moved =
      Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) >= CLICK_SLOP_PX;
    if (moved) {
      if (interactive) onMove?.(drag.id, drag.latest);
      if (pendingClickRef.current?.id === drag.id) flushPendingClick();
    } else {
      const fragment = cards.find((item) => item.id === drag.id);
      if (fragment) l.api.selectCard(fragment.id);
      if (fragment) {
        const now = event.timeStamp > 0 ? event.timeStamp : performance.now();
        const previous = lastClickRef.current;
        const doubleClick =
          fragment.kind === "text" &&
          previous?.id === fragment.id &&
          now >= previous.at &&
          now - previous.at <= CANVAS_TEXT_DOUBLE_CLICK_MS;
        if (doubleClick) {
          pendingClickRef.current = null;
          clearPendingTimer();
          lastClickRef.current = null;
          beginTextEdit(fragment);
        } else if (fragment.kind === "text") {
          lastClickRef.current = { id: fragment.id, at: now };
          armTextClick(fragment);
        } else {
          lastClickRef.current = { id: fragment.id, at: now };
          activateCard(fragment);
        }
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
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget && event.target !== canvasRef.current) return;
          flushPendingClick();
          l.api.selectCard(null);
        }}
        className={cn(
          "journal-canvas relative min-h-0 flex-1 overflow-auto",
          "text-[#2c2416] os-dark:text-[#f3ead7]"
        )}
      >
        <div
          ref={canvasRef}
          className="relative"
          style={{ width: CANVAS_LAYOUT_WIDTH, height: CANVAS_LAYOUT_HEIGHT }}
        >
        {cards.map((fragment) => {
          const position = positionFor(fragment);
          const text = textFor(fragment);
          const editing = editingId === fragment.id;
          const current = fragment.pageId === activePageId;
          const selected = l.journal.selectedCardId === fragment.id;
          const isPhoto = fragment.kind === "photo" && Boolean(fragment.photo);
          const cursorClass = editing
            ? "cursor-text select-text"
            : fragment.kind === "song"
              ? "cursor-pointer touch-none"
              : interactive
                ? "cursor-grab touch-none active:cursor-grabbing"
                : "cursor-pointer";
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
                selected && "z-[2] ring-2 ring-[#9a7424] os-dark:ring-[#e6c36a]",
                cursorClass
              )}
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: cardWidth(fragment.kind),
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
              ) : editing ? (
                <textarea
                  ref={editorRef}
                  aria-label={t("apps.journal.toolbar.emptyNote")}
                  defaultValue={text}
                  placeholder={t("apps.journal.toolbar.emptyNote")}
                  rows={Math.min(8, Math.max(2, text.split("\n").length))}
                  className="journal-canvas-note w-full resize-none overflow-y-auto bg-transparent p-0 text-sm leading-snug text-inherit outline-none select-text"
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      if (editSessionRef.current) editSessionRef.current.cancel = true;
                      setEditingId(null);
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      finishTextEdit(event.currentTarget.value);
                    }
                  }}
                  onBlur={(event) => finishTextEdit(event.currentTarget.value)}
                />
              ) : (
                <CanvasNote text={text || t("apps.journal.toolbar.emptyNote")} />
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
      </div>
      <JournalViewToolbar l={l} open={open} pages="canvas" />
      <JournalCardMenu menu={menu} onClose={() => setMenu(null)} l={l} />
    </div>
  );
}
