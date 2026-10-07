import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowCounterClockwise, Trash, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { DictionaryLogic } from "../hooks/useDictionaryLogic";
import {
  loadHandwritingRecognizer,
  recognizeHandwriting,
  type HandwritingStroke,
} from "../utils/handwriting";

const PAD_SIZE = 168;

type RecognizerStatus = "loading" | "ready" | "error";

export function DictionaryHandwritingPad({ l }: { l: DictionaryLogic }) {
  const { t } = l;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<HandwritingStroke[]>([]);
  const activeStrokeRef = useRef<HandwritingStroke | null>(null);
  const recognizeIdRef = useRef(0);
  const [strokeCount, setStrokeCount] = useState(0);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [status, setStatus] = useState<RecognizerStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    loadHandwritingRecognizer()
      .then(() => !cancelled && setStatus("ready"))
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, []);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PAD_SIZE, PAD_SIZE);

    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(PAD_SIZE / 2, 0);
    ctx.lineTo(PAD_SIZE / 2, PAD_SIZE);
    ctx.moveTo(0, PAD_SIZE / 2);
    ctx.lineTo(PAD_SIZE, PAD_SIZE / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "#111";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const strokes = activeStrokeRef.current
      ? [...strokesRef.current, activeStrokeRef.current]
      : strokesRef.current;
    for (const stroke of strokes) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0][0], stroke[0][1]);
      if (stroke.length === 1) ctx.lineTo(stroke[0][0] + 0.1, stroke[0][1]);
      for (const [x, y] of stroke.slice(1)) ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = PAD_SIZE * dpr;
    canvas.height = PAD_SIZE * dpr;
    redraw();
  }, [redraw]);

  const runRecognition = useCallback(async () => {
    const id = ++recognizeIdRef.current;
    if (strokesRef.current.length === 0) {
      setCandidates([]);
      return;
    }
    try {
      const matches = await recognizeHandwriting(strokesRef.current);
      if (id === recognizeIdRef.current) setCandidates(matches);
    } catch {
      if (id === recognizeIdRef.current) setStatus("error");
    }
  }, []);

  const strokesChanged = useCallback(() => {
    setStrokeCount(strokesRef.current.length);
    redraw();
    void runRecognition();
  }, [redraw, runRecognition]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = PAD_SIZE / rect.width;
    return [
      Math.round((event.clientX - rect.left) * scale),
      Math.round((event.clientY - rect.top) * scale),
    ];
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeStrokeRef.current = [pointFromEvent(event)];
    redraw();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    const point = pointFromEvent(event);
    const last = stroke[stroke.length - 1];
    if (Math.abs(point[0] - last[0]) + Math.abs(point[1] - last[1]) < 2) return;
    stroke.push(point);
    redraw();
  };

  const finishStroke = () => {
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (!stroke) return;
    strokesRef.current = [...strokesRef.current, stroke];
    strokesChanged();
  };

  const undo = () => {
    strokesRef.current = strokesRef.current.slice(0, -1);
    strokesChanged();
  };

  const clear = () => {
    strokesRef.current = [];
    strokesChanged();
  };

  const pickCandidate = (character: string) => {
    l.appendToQuery(character);
    clear();
  };

  const iconButton =
    "flex size-6 shrink-0 items-center justify-center rounded text-black/70 hover:bg-black/10 disabled:opacity-40";

  return (
    <div
      className="flex flex-col gap-2 border-t border-black/15 bg-white/95 p-2.5 shadow-[0_-10px_28px_rgba(0,0,0,0.18)]"
      role="group"
      aria-label={t("apps.dictionary.handwriting.title")}
    >
      <div className="flex items-center gap-1">
        <span className="text-[11px] font-semibold text-black/70">
          {t("apps.dictionary.handwriting.title")}
        </span>
        <div className="min-w-2 flex-1" />
        <button
          type="button"
          className={iconButton}
          onClick={undo}
          disabled={strokeCount === 0}
          aria-label={t("apps.dictionary.handwriting.undo")}
          title={t("apps.dictionary.handwriting.undo")}
        >
          <ArrowCounterClockwise size={14} />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={clear}
          disabled={strokeCount === 0}
          aria-label={t("apps.dictionary.handwriting.clear")}
          title={t("apps.dictionary.handwriting.clear")}
        >
          <Trash size={14} />
        </button>
        <button
          type="button"
          className={iconButton}
          onClick={() => l.setHandwritingOpen(false)}
          aria-label={t("common.menu.close")}
          title={t("common.menu.close")}
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex min-w-0 gap-3">
        <canvas
          ref={canvasRef}
          style={{ width: PAD_SIZE, height: PAD_SIZE, touchAction: "none" }}
          className="shrink-0 cursor-crosshair rounded border border-black/20 bg-white shadow-[inset_0_1px_2px_rgba(0,0,0,0.08)]"
          aria-label={t("apps.dictionary.handwriting.canvas")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
        <div className="flex min-w-0 flex-1 flex-wrap content-start gap-1">
          {status === "loading" ? (
            <p className="text-[11px] text-black/50">{t("apps.dictionary.handwriting.loading")}</p>
          ) : status === "error" ? (
            <p className="text-[11px] text-red-600">{t("apps.dictionary.handwriting.error")}</p>
          ) : candidates.length === 0 ? (
            <p className="text-[11px] text-black/50">{t("apps.dictionary.handwriting.hint")}</p>
          ) : (
            candidates.map((character, index) => (
              <button
                key={`${character}-${index}`}
                type="button"
                lang="zh"
                onClick={() => pickCandidate(character)}
                className={cn(
                  "flex size-9 items-center justify-center rounded border border-black/15 bg-white text-[20px] leading-none hover:bg-black/5",
                  index === 0 && "border-black/40"
                )}
              >
                {character}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
