import { useEffect, useState } from "react";
import { useThemeStore } from "@/stores/useThemeStore";

export function ClockWidget() {
  const [time, setTime] = useState(new Date());
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();

  // Calculate hand angles
  const secondAngle = (seconds / 60) * 360;
  const minuteAngle = (minutes / 60) * 360 + (seconds / 60) * 6;
  const hourAngle = ((hours % 12) / 12) * 360 + (minutes / 60) * 30;

  const size = 140;
  const center = size / 2;
  const faceRadius = size / 2 - 6;

  // Colors based on theme
  const faceColor = isXpTheme ? "#FFFFFF" : "rgba(255,255,255,0.15)";
  const faceBorder = isXpTheme ? "#808080" : "rgba(255,255,255,0.3)";
  const hourHandColor = isXpTheme ? "#000000" : "#FFFFFF";
  const minuteHandColor = isXpTheme ? "#000000" : "#FFFFFF";
  const secondHandColor = isXpTheme ? "#CC0000" : "#FF6B6B";
  const tickColor = isXpTheme ? "#333333" : "rgba(255,255,255,0.6)";
  const numberColor = isXpTheme ? "#000000" : "rgba(255,255,255,0.8)";

  return (
    <div className="flex items-center justify-center p-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Clock face */}
        <circle
          cx={center}
          cy={center}
          r={faceRadius}
          fill={faceColor}
          stroke={faceBorder}
          strokeWidth={isXpTheme ? 2 : 1}
        />

        {/* Hour markers */}
        {Array.from({ length: 12 }, (_, i) => {
          const angle = ((i * 30 - 90) * Math.PI) / 180;
          const innerR = faceRadius - 10;
          const outerR = faceRadius - 4;
          return (
            <line
              key={i}
              x1={center + innerR * Math.cos(angle)}
              y1={center + innerR * Math.sin(angle)}
              x2={center + outerR * Math.cos(angle)}
              y2={center + outerR * Math.sin(angle)}
              stroke={tickColor}
              strokeWidth={i % 3 === 0 ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}

        {/* Hour numbers */}
        {[12, 3, 6, 9].map((num) => {
          const angle = ((num * 30 - 90) * Math.PI) / 180;
          const r = faceRadius - 20;
          return (
            <text
              key={num}
              x={center + r * Math.cos(angle)}
              y={center + r * Math.sin(angle)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={12}
              fontWeight="bold"
              fill={numberColor}
              style={{ fontFamily: "var(--os-font-ui)" }}
            >
              {num}
            </text>
          );
        })}

        {/* Hour hand */}
        <line
          x1={center}
          y1={center}
          x2={center + 32 * Math.cos(((hourAngle - 90) * Math.PI) / 180)}
          y2={center + 32 * Math.sin(((hourAngle - 90) * Math.PI) / 180)}
          stroke={hourHandColor}
          strokeWidth={3.5}
          strokeLinecap="round"
        />

        {/* Minute hand */}
        <line
          x1={center}
          y1={center}
          x2={center + 45 * Math.cos(((minuteAngle - 90) * Math.PI) / 180)}
          y2={center + 45 * Math.sin(((minuteAngle - 90) * Math.PI) / 180)}
          stroke={minuteHandColor}
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Second hand */}
        <line
          x1={center}
          y1={center}
          x2={center + 50 * Math.cos(((secondAngle - 90) * Math.PI) / 180)}
          y2={center + 50 * Math.sin(((secondAngle - 90) * Math.PI) / 180)}
          stroke={secondHandColor}
          strokeWidth={1}
          strokeLinecap="round"
        />

        {/* Center dot */}
        <circle cx={center} cy={center} r={3} fill={secondHandColor} />
      </svg>
    </div>
  );
}
