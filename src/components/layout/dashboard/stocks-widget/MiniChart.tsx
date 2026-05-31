import { useMemo } from "react";
import type { ChartPoint } from "./types";

export function MiniChart({
  history,
  xLabels,
  isXpTheme,
  widgetId,
}: {
  history: number[];
  xLabels: string[];
  isXpTheme: boolean;
  widgetId: string;
}) {
  const width = 220;
  const height = 90;
  const topPad = 4;
  const bottomPad = 14;
  const leftPad = 4;
  const rightPad = 40;
  const gradientId = `chartFill-${widgetId}`;

  const chartW = width - rightPad - leftPad;
  const chartH = height - topPad - bottomPad;

  const { line, area, yLabels } = useMemo(() => {
    if (history.length < 2)
      return { line: [] as ChartPoint[], area: "", yLabels: [] as { value: number; y: number }[] };
    const min = Math.min(...history);
    const max = Math.max(...history);
    const range = max - min || 1;

    const pts: ChartPoint[] = history.map((val, i) => ({
      x: leftPad + (i / (history.length - 1)) * chartW,
      y: topPad + chartH - ((val - min) / range) * chartH,
    }));

    const areaPath =
      `M ${pts[0].x} ${pts[0].y} ` +
      pts.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ") +
      ` L ${pts[pts.length - 1].x} ${topPad + chartH} L ${pts[0].x} ${topPad + chartH} Z`;

    const labelCount = 4;
    const yLbls = Array.from({ length: labelCount }, (_, i) => {
      const val = min + (range * (labelCount - 1 - i)) / (labelCount - 1);
      return {
        value: Math.round(val),
        y: topPad + (i / (labelCount - 1)) * chartH,
      };
    });

    return { line: pts, area: areaPath, yLabels: yLbls };
  }, [history, chartW, chartH]);

  if (line.length < 2) return null;

  const linePath =
    `M ${line[0].x} ${line[0].y} ` +
    line.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isXpTheme ? "#4A90D9" : "#FFFFFF"} stopOpacity={0.3} />
          <stop offset="20%" stopColor={isXpTheme ? "#4A90D9" : "#FFFFFF"} stopOpacity={0.15} />
          <stop offset="50%" stopColor={isXpTheme ? "#4A90D9" : "#FFFFFF"} stopOpacity={0.05} />
          <stop offset="100%" stopColor={isXpTheme ? "#4A90D9" : "#FFFFFF"} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={isXpTheme ? "#2060A0" : "#FFFFFF"} strokeWidth={1.5} />
      {yLabels.map((label) => (
        <text
          key={label.value}
          x={width - rightPad + 4}
          y={label.y + 3}
          fill={isXpTheme ? "#666" : "rgba(255,255,255,0.4)"}
          fontSize={9}
          fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
        >
          {label.value}
        </text>
      ))}
      {xLabels.map((label, i) => {
        const xPos = leftPad + (i / Math.max(xLabels.length - 1, 1)) * chartW;
        return (
          <text
            key={`${label}-${Math.round(xPos)}`}
            x={xPos}
            y={height - 2}
            fill={isXpTheme ? "#666" : "rgba(255,255,255,0.4)"}
            fontSize={9}
            fontFamily="'Helvetica Neue', Helvetica, Arial, sans-serif"
            textAnchor="middle"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
