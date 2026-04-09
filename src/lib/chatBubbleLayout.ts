import {
  prepareWithSegments,
  measureLineStats,
  measureNaturalWidth,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

const LINE_HEIGHT = 18;

export function getChatFont(fontSize: number): string {
  return `${fontSize}px "Geneva-12", "Geneva", system-ui, sans-serif`;
}

export interface BubbleMetrics {
  shrinkWidth: number;
  naturalWidth: number;
  lineCount: number;
  prepared: PreparedTextWithSegments;
}

export function measureBubble(
  text: string,
  maxWidth: number,
  fontSize: number = 12,
  _lineHeight: number = LINE_HEIGHT
): BubbleMetrics {
  const font = getChatFont(fontSize);
  const prepared = prepareWithSegments(text, font, {
    whiteSpace: "pre-wrap",
  });

  const naturalWidth = measureNaturalWidth(prepared);
  const { lineCount, maxLineWidth } = measureLineStats(prepared, maxWidth);
  const shrinkWidth = Math.min(maxLineWidth, maxWidth);

  return { shrinkWidth, naturalWidth, lineCount, prepared };
}
