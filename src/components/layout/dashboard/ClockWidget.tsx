import { useEffect, useState, useMemo } from "react";
import { useThemeStore } from "@/stores/useThemeStore";

function getCityFromTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const city = tz.split("/").pop() || "";
    return city.replace(/_/g, " ").toUpperCase();
  } catch {
    return "LOCAL";
  }
}

/** Build a tapered polygon (wide at center, pointed at tip) */
function handPolygon(
  cx: number,
  cy: number,
  angleDeg: number,
  length: number,
  baseHalf: number,
  tailLength = 0,
): string {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const perpRad = rad + Math.PI / 2;
  const tipX = cx + length * Math.cos(rad);
  const tipY = cy + length * Math.sin(rad);
  const bx1 = cx + baseHalf * Math.cos(perpRad);
  const by1 = cy + baseHalf * Math.sin(perpRad);
  const bx2 = cx - baseHalf * Math.cos(perpRad);
  const by2 = cy - baseHalf * Math.sin(perpRad);
  if (tailLength > 0) {
    const tx = cx - tailLength * Math.cos(rad);
    const ty = cy - tailLength * Math.sin(rad);
    return `${bx1},${by1} ${tipX},${tipY} ${bx2},${by2} ${tx},${ty}`;
  }
  return `${bx1},${by1} ${tipX},${tipY} ${bx2},${by2}`;
}

export function ClockWidget() {
  const [time, setTime] = useState(new Date());
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const cityName = useMemo(getCityFromTimezone, []);

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  const secondAngle = (seconds / 60) * 360;
  const minuteAngle = (minutes / 60) * 360 + (seconds / 60) * 6;
  const hourAngle = ((hours % 12) / 12) * 360 + (minutes / 60) * 30;
  const ampm = hours >= 12 ? "PM" : "AM";

  const svgSize = 170;
  const clockCenterX = svgSize / 2;
  const clockCenterY = svgSize / 2;
  const topLabelY = 15;
  const bottomLabelY = svgSize - 10;
  const faceRadius = isXpTheme ? 52 : 55;

  return (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      style={{ display: "block" }}
    >
      <defs>
        {!isXpTheme && (
          <>
            <radialGradient id="faceGrad" cx="50%" cy="38%" r="58%">
              <stop offset="0%" stopColor="#f8f8f8" />
              <stop offset="100%" stopColor="#ddd" />
            </radialGradient>
            <filter id="clockShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
            </filter>
          </>
        )}
      </defs>

      {/* AM / PM label at top */}
      <text
        x={clockCenterX}
        y={topLabelY}
        textAnchor="middle"
        fontSize={11}
        fontWeight="700"
        fill={isXpTheme ? "#000" : "rgba(255,255,255,0.7)"}
        style={{ fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif" }}
      >
        {ampm}
      </text>

      {/* Clock face */}
      <circle
        cx={clockCenterX}
        cy={clockCenterY}
        r={faceRadius}
        fill={isXpTheme ? "#FFFFFF" : "url(#faceGrad)"}
        stroke={isXpTheme ? "#808080" : "none"}
        strokeWidth={isXpTheme ? 1.5 : 0}
        filter={isXpTheme ? undefined : "url(#clockShadow)"}
      />

      {/* Hour numbers */}
      {Array.from({ length: 12 }, (_, i) => {
        const num = i === 0 ? 12 : i;
        const angle = ((num * 30 - 90) * Math.PI) / 180;
        const r = faceRadius - 15;
        return (
          <text
            key={num}
            x={clockCenterX + r * Math.cos(angle)}
            y={clockCenterY + r * Math.sin(angle)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={14}
            fontWeight="700"
            fill="#333"
            style={{ fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif" }}
          >
            {num}
          </text>
        );
      })}

      {/* Hour hand (tapered) */}
      <polygon
        points={handPolygon(clockCenterX, clockCenterY, hourAngle, 28, 3.5, 5)}
        fill="#222"
      />

      {/* Minute hand (tapered) */}
      <polygon
        points={handPolygon(clockCenterX, clockCenterY, minuteAngle, 40, 2.5, 5)}
        fill="#222"
      />

      {/* Second hand */}
      <line
        x1={clockCenterX - 10 * Math.cos(((secondAngle - 90) * Math.PI) / 180)}
        y1={clockCenterY - 10 * Math.sin(((secondAngle - 90) * Math.PI) / 180)}
        x2={clockCenterX + 46 * Math.cos(((secondAngle - 90) * Math.PI) / 180)}
        y2={clockCenterY + 46 * Math.sin(((secondAngle - 90) * Math.PI) / 180)}
        stroke="#D95030"
        strokeWidth={1}
        strokeLinecap="round"
      />

      {/* Center cap */}
      <circle cx={clockCenterX} cy={clockCenterY} r={6} fill="#D95030" />
      <circle cx={clockCenterX} cy={clockCenterY} r={2.5} fill="#FFF" />

      {/* City name at bottom */}
      <text
        x={clockCenterX}
        y={bottomLabelY}
        textAnchor="middle"
        fontSize={12}
        fontWeight="700"
        fill={isXpTheme ? "#000" : "rgba(255,255,255,0.8)"}
        style={{ fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif" }}
      >
        {cityName}
      </text>
    </svg>
  );
}
