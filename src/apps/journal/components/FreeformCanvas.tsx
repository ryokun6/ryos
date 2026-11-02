import { useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { clamp, plainTextFromDoc } from "../logic";
import {
  journalText,
  JOURNAL_FRAGMENTS,
  type JournalFragment,
} from "../sampleContent";
import type { FragmentPosition, JournalDoc } from "../types";

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
  interactive,
  onMove,
}: {
  positions: Record<string, FragmentPosition>;
  texts: Record<string, JournalDoc>;
  interactive: boolean;
  onMove?: (id: string, position: FragmentPosition) => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [livePositions, setLivePositions] = useState<Record<string, FragmentPosition>>({});
  const fragments = JOURNAL_FRAGMENTS;

  function positionFor(fragment: JournalFragment): FragmentPosition {
    return (
      livePositions[fragment.id] ??
      positions[fragment.id] ?? { x: fragment.x, y: fragment.y }
    );
  }

  function onPointerDown(
    event: PointerEvent<HTMLElement>,
    fragment: JournalFragment
  ) {
    if (!interactive || !onMove || !canvasRef.current) return;
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
    if (!drag || drag.pointerId !== event.pointerId) return;
    const fragment = fragments.find((item) => item.id === drag.id);
    const maxX = fragment ? 100 - fragment.w : 80;
    drag.latest = {
      x: clamp(drag.startX + ((event.clientX - drag.originX) / drag.width) * 100, 0, maxX),
      y: clamp(drag.startY + ((event.clientY - drag.originY) / drag.height) * 100, 0, 88),
    };
    setLivePositions((current) => ({ ...current, [drag.id]: drag.latest }));
  }

  function onPointerUp(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    onMove?.(drag.id, drag.latest);
    setLivePositions((current) => {
      const next = { ...current };
      delete next[drag.id];
      return next;
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={canvasRef}
        className={cn(
          "relative min-h-[22rem] flex-1 overflow-hidden",
          "bg-[#f4efe4] text-[#2c2416]",
          "os-dark:bg-[#2a261f] os-dark:text-[#f3ead7]",
          "bg-[linear-gradient(transparent_31px,rgba(90,70,40,0.08)_32px)] bg-[length:100%_32px]"
        )}
      >
        {fragments.map((fragment) => {
          const position = positionFor(fragment);
          const saved = texts[fragment.id];
          const text = saved
            ? plainTextFromDoc(saved)
            : fragment.text
              ? journalText(fragment.text, language)
              : "";
          return (
            <article
              key={fragment.id}
              className={cn(
                "absolute select-none rounded-sm border border-black/10 bg-[#fffdf8] p-2 shadow-os-window",
                "os-dark:border-white/10 os-dark:bg-[#3a342c]",
                interactive ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-default"
              )}
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                width: `${fragment.w}%`,
                transform: `rotate(${fragment.rotate}deg)`,
              }}
              onPointerDown={(event) => onPointerDown(event, fragment)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {fragment.kind === "photo" && fragment.photo ? (
                <img
                  src={fragment.photo}
                  alt={t("apps.journal.photo.alt")}
                  draggable={false}
                  className="aspect-[4/3] w-full rounded-sm object-cover"
                />
              ) : (
                <p className="text-sm leading-snug">{text}</p>
              )}
            </article>
          );
        })}
      </div>
      {interactive ? (
        <p className="shrink-0 px-3 py-1.5 text-xs text-os-text-secondary">
          {t("apps.journal.canvas.hint")}
        </p>
      ) : null}
    </div>
  );
}
