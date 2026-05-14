import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/stores/useCalendarStore";
import {
  GRID_MIN_DURATION_MINUTES,
  GRID_SNAP_MINUTES,
  defaultEndMinutes,
  minutesToTimeString,
  snapMinutes,
  timeStringToMinutes,
} from "../utils/timeGridMath";

type DragPreview = { startTime: string; endTime: string };

export interface TimedEventBlockProps {
  event: CalendarEvent;
  hourHeight: number;
  hourStart: number;
  hourEnd: number;
  selectedEventId: string | null;
  isMacOSTheme: boolean;
  useGeneva: boolean;
  /** rgba / hex background wash */
  washColor: string;
  accentColor: string;
  blockOpacity: number;
  minHeightPx: number;
  onUpdateEvent: (id: string, updates: Partial<CalendarEvent>) => void;
  onEventClick: (event: CalendarEvent, e: React.MouseEvent) => void;
  /** Week view: map client X to column date on pointer up (day change). Omit in day view. */
  resolveDateAtClientX?: (clientX: number) => string | null;
  timeLabelMode: "week" | "day";
}

function gridBounds(hourStart: number, hourEnd: number) {
  return { lo: hourStart * 60, hi: hourEnd * 60 };
}

export function TimedEventBlock({
  event,
  hourHeight,
  hourStart,
  hourEnd,
  selectedEventId,
  isMacOSTheme,
  useGeneva,
  washColor,
  accentColor,
  blockOpacity,
  minHeightPx,
  onUpdateEvent,
  onEventClick,
  resolveDateAtClientX,
  timeLabelMode,
}: TimedEventBlockProps) {
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const suppressClickRef = useRef(false);
  const livePreviewRef = useRef<DragPreview | null>(null);

  const stOrig = event.startTime || "09:00";
  const endDefault = defaultEndMinutes(
    timeStringToMinutes(stOrig),
    event.endTime
  );

  const display = preview ?? {
    startTime: stOrig,
    endTime: event.endTime || minutesToTimeString(endDefault),
  };

  const startMin = timeStringToMinutes(display.startTime);
  const endMin = timeStringToMinutes(display.endTime);
  const { lo, hi } = gridBounds(hourStart, hourEnd);

  const top = ((startMin - hourStart * 60) / 60) * hourHeight;
  const rawHeight = ((endMin - startMin) / 60) * hourHeight;
  const height = Math.max(rawHeight, minHeightPx);

  const pointerSessionRef = useRef<{
    mode: "move" | "resize-start" | "resize-end";
    pointerId: number;
    origDate: string;
    origStartMin: number;
    origEndMin: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  const setPreviewBoth = useCallback((p: DragPreview | null) => {
    livePreviewRef.current = p;
    setPreview(p);
  }, []);

  const applyPointerMove = useCallback(
    (_clientX: number, clientY: number) => {
      const sess = pointerSessionRef.current;
      if (!sess) return;

      const deltaY = clientY - sess.startClientY;
      const deltaMin = snapMinutes((deltaY / hourHeight) * 60, GRID_SNAP_MINUTES);

      const origDur = Math.max(
        GRID_MIN_DURATION_MINUTES,
        sess.origEndMin - sess.origStartMin
      );

      if (sess.mode === "move") {
        let ns = sess.origStartMin + deltaMin;
        ns = snapMinutes(ns, GRID_SNAP_MINUTES);
        ns = Math.max(lo, Math.min(hi - origDur, ns));
        const ne = ns + origDur;
        const next: DragPreview = {
          startTime: minutesToTimeString(ns),
          endTime: minutesToTimeString(Math.min(ne, hi)),
        };
        setPreviewBoth(next);
        return;
      }

      if (sess.mode === "resize-start") {
        let ns = sess.origStartMin + deltaMin;
        ns = snapMinutes(ns, GRID_SNAP_MINUTES);
        ns = Math.max(lo, Math.min(sess.origEndMin - GRID_MIN_DURATION_MINUTES, ns));
        setPreviewBoth({
          startTime: minutesToTimeString(ns),
          endTime: minutesToTimeString(sess.origEndMin),
        });
        return;
      }

      if (sess.mode === "resize-end") {
        let ne = sess.origEndMin + deltaMin;
        ne = snapMinutes(ne, GRID_SNAP_MINUTES);
        ne = Math.max(
          sess.origStartMin + GRID_MIN_DURATION_MINUTES,
          Math.min(hi, ne)
        );
        setPreviewBoth({
          startTime: minutesToTimeString(sess.origStartMin),
          endTime: minutesToTimeString(ne),
        });
      }
    },
    [hourHeight, lo, hi, setPreviewBoth]
  );

  const attachWindowListeners = useCallback(
    (sess: NonNullable<typeof pointerSessionRef.current>) => {
      const onMove = (e: PointerEvent) => {
        if (e.pointerId !== sess.pointerId) return;
        applyPointerMove(e.clientX, e.clientY);
      };

      const onUp = (e: PointerEvent) => {
        if (e.pointerId !== sess.pointerId) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);

        const moved =
          Math.abs(e.clientX - sess.startClientX) > 3 ||
          Math.abs(e.clientY - sess.startClientY) > 3;

        if (moved) suppressClickRef.current = true;

        const last = livePreviewRef.current;
        pointerSessionRef.current = null;
        livePreviewRef.current = null;
        setPreview(null);

        if (!moved || !last) return;

        if (sess.mode === "move") {
          const finalDate =
            resolveDateAtClientX?.(e.clientX) ?? sess.origDate;
          onUpdateEvent(event.id, {
            date: finalDate,
            startTime: last.startTime,
            endTime: last.endTime,
          });
        } else {
          onUpdateEvent(event.id, {
            startTime: last.startTime,
            endTime: last.endTime,
          });
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [applyPointerMove, event.id, onUpdateEvent, resolveDateAtClientX]
  );

  const beginMove = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const st = timeStringToMinutes(event.startTime || "09:00");
    const en = defaultEndMinutes(st, event.endTime);
    const sess = {
      mode: "move" as const,
      pointerId: e.pointerId,
      origDate: event.date,
      origStartMin: st,
      origEndMin: en,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    pointerSessionRef.current = sess;
    setPreviewBoth({
      startTime: event.startTime || "09:00",
      endTime: event.endTime || minutesToTimeString(en),
    });
    attachWindowListeners(sess);
  };

  const beginResizeStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const st = timeStringToMinutes(event.startTime || "09:00");
    const en = defaultEndMinutes(st, event.endTime);
    const sess = {
      mode: "resize-start" as const,
      pointerId: e.pointerId,
      origDate: event.date,
      origStartMin: st,
      origEndMin: en,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    pointerSessionRef.current = sess;
    setPreviewBoth({
      startTime: event.startTime || "09:00",
      endTime: event.endTime || minutesToTimeString(en),
    });
    attachWindowListeners(sess);
  };

  const beginResizeEnd = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const st = timeStringToMinutes(event.startTime || "09:00");
    const en = defaultEndMinutes(st, event.endTime);
    const sess = {
      mode: "resize-end" as const,
      pointerId: e.pointerId,
      origDate: event.date,
      origStartMin: st,
      origEndMin: en,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    pointerSessionRef.current = sess;
    setPreviewBoth({
      startTime: event.startTime || "09:00",
      endTime: event.endTime || minutesToTimeString(en),
    });
    attachWindowListeners(sess);
  };

  const onClickSelect = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onEventClick(event, e);
  };

  const dragging = preview !== null;

  return (
    <div
      className="absolute left-0.5 right-0.5 rounded overflow-hidden select-none"
      style={{
        top: Math.max(top, 0),
        height,
        backgroundColor: washColor,
        borderLeft: `3px solid ${accentColor}`,
        // Prevent mobile touch panning while dragging/resizing timed events.
        touchAction: "none",
        boxShadow:
          selectedEventId === event.id
            ? `0 0 0 1px ${accentColor}`
            : isMacOSTheme
              ? "0 1px 3px rgba(0,0,0,0.1)"
              : "0 1px 2px rgba(0,0,0,0.08)",
        opacity: blockOpacity,
        zIndex: dragging ? 25 : 2,
      }}
    >
      {/* Invisible edge hit-zones (stack above body); do not shrink content layout */}
      <div
        className="pointer-events-auto absolute left-0 right-0 top-0 z-20 h-2 cursor-ns-resize"
        onPointerDown={beginResizeStart}
        aria-hidden
      />
      <div
        className="pointer-events-auto absolute left-0 right-0 bottom-0 z-20 h-2 cursor-ns-resize"
        onPointerDown={beginResizeEnd}
        aria-hidden
      />
      <div
        role="button"
        tabIndex={0}
        onClick={onClickSelect}
        onPointerDown={beginMove}
        className={cn(
          "pointer-events-auto absolute inset-0 z-10 min-h-0 text-left overflow-hidden flex items-start cursor-grab active:cursor-grabbing",
          timeLabelMode === "day" ? "px-1.5 py-0.5" : "px-1 py-0.5"
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-baseline min-w-0",
            timeLabelMode === "day" ? "gap-x-1.5 py-0.5" : "gap-x-1 py-0.5"
          )}
        >
          {timeLabelMode === "week" ? (
            <>
              <span
                className={cn(
                  "text-[10px] font-semibold shrink-0 whitespace-nowrap",
                  useGeneva && "font-geneva-12"
                )}
                style={{ color: accentColor }}
              >
                {display.startTime}
              </span>
              <span className="text-[10px] truncate leading-tight">{event.title}</span>
            </>
          ) : (
            <>
              <span
                className={cn(
                  "text-[11px] font-semibold shrink-0 whitespace-nowrap",
                  useGeneva && "font-geneva-12"
                )}
                style={{ color: accentColor }}
              >
                {display.startTime}
                {display.endTime ? ` – ${display.endTime}` : ""}
              </span>
              <span className="text-xs truncate leading-tight">{event.title}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
