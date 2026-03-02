import { useEffect, useState } from "react";
import { useThemeStore } from "@/stores/useThemeStore";

/** Format hours to 12-hour with AM/PM */
function formatTime12(hours: number, minutes: number): { time: string; ampm: string } {
  const ampm = hours >= 12 ? "PM" : "AM";
  const h12 = hours % 12 || 12;
  const time = `${h12}:${String(minutes).padStart(2, "0")}`;
  return { time, ampm };
}

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

  const secondAngle = (seconds / 60) * 360;
  const minuteAngle = (minutes / 60) * 360 + (seconds / 60) * 6;
  const hourAngle = ((hours % 12) / 12) * 360 + (minutes / 60) * 30;

  const { time: digitalTime, ampm } = formatTime12(hours, minutes);

  if (isXpTheme) {
    return (
      <div className="flex flex-col items-center p-2">
        <svg width={130} height={130} viewBox="0 0 130 130">
          <circle cx={65} cy={65} r={60} fill="#FFFFFF" stroke="#808080" strokeWidth={2} />
          {Array.from({ length: 12 }, (_, i) => {
            const angle = ((i * 30 - 90) * Math.PI) / 180;
            return (
              <line key={i} x1={65 + 48 * Math.cos(angle)} y1={65 + 48 * Math.sin(angle)} x2={65 + 54 * Math.cos(angle)} y2={65 + 54 * Math.sin(angle)} stroke="#333" strokeWidth={i % 3 === 0 ? 2 : 1} strokeLinecap="round" />
            );
          })}
          {[12, 3, 6, 9].map((num) => {
            const angle = ((num * 30 - 90) * Math.PI) / 180;
            return <text key={num} x={65 + 40 * Math.cos(angle)} y={65 + 40 * Math.sin(angle)} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold" fill="#000">{num}</text>;
          })}
          <line x1={65} y1={65} x2={65 + 28 * Math.cos(((hourAngle - 90) * Math.PI) / 180)} y2={65 + 28 * Math.sin(((hourAngle - 90) * Math.PI) / 180)} stroke="#000" strokeWidth={3} strokeLinecap="round" />
          <line x1={65} y1={65} x2={65 + 40 * Math.cos(((minuteAngle - 90) * Math.PI) / 180)} y2={65 + 40 * Math.sin(((minuteAngle - 90) * Math.PI) / 180)} stroke="#000" strokeWidth={2} strokeLinecap="round" />
          <line x1={65} y1={65} x2={65 + 44 * Math.cos(((secondAngle - 90) * Math.PI) / 180)} y2={65 + 44 * Math.sin(((secondAngle - 90) * Math.PI) / 180)} stroke="#CC0000" strokeWidth={1} strokeLinecap="round" />
          <circle cx={65} cy={65} r={3} fill="#CC0000" />
        </svg>
        {/* Digital time for XP */}
        <div className="text-center mt-1">
          <span className="text-sm font-bold">{digitalTime}</span>
          <span className="text-[10px] ml-1 opacity-60">{ampm}</span>
        </div>
      </div>
    );
  }

  // Tiger-style clock
  const size = 150;
  const center = size / 2;
  const outerR = size / 2 - 2;
  const faceRadius = size / 2 - 14;

  return (
    <div className="flex flex-col items-center py-2 px-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="bezelGrad" cx="50%" cy="40%" r="50%">
            <stop offset="0%" stopColor="#666" />
            <stop offset="70%" stopColor="#333" />
            <stop offset="100%" stopColor="#1a1a1a" />
          </radialGradient>
          <radialGradient id="faceGrad" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#f8f8f8" />
            <stop offset="100%" stopColor="#e0e0e0" />
          </radialGradient>
          <filter id="clockShadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.4" />
          </filter>
        </defs>

        {/* Bezel ring */}
        <circle cx={center} cy={center} r={outerR} fill="url(#bezelGrad)" />
        <circle cx={center} cy={center} r={outerR - 1} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={0.5} />

        {/* Clock face */}
        <circle cx={center} cy={center} r={faceRadius} fill="url(#faceGrad)" filter="url(#clockShadow)" />
        <circle cx={center} cy={center} r={faceRadius} fill="none" stroke="rgba(0,0,0,0.15)" strokeWidth={0.5} />

        {/* Minute markers */}
        {Array.from({ length: 60 }, (_, i) => {
          const angle = ((i * 6 - 90) * Math.PI) / 180;
          const isHour = i % 5 === 0;
          const innerR2 = faceRadius - (isHour ? 10 : 5);
          const outerR2 = faceRadius - 2;
          return (
            <line
              key={i}
              x1={center + innerR2 * Math.cos(angle)}
              y1={center + innerR2 * Math.sin(angle)}
              x2={center + outerR2 * Math.cos(angle)}
              y2={center + outerR2 * Math.sin(angle)}
              stroke={isHour ? "#333" : "#bbb"}
              strokeWidth={isHour ? 1.5 : 0.5}
              strokeLinecap="round"
            />
          );
        })}

        {/* Hour numbers */}
        {Array.from({ length: 12 }, (_, i) => {
          const num = i === 0 ? 12 : i;
          const angle = ((num * 30 - 90) * Math.PI) / 180;
          const r = faceRadius - 20;
          return (
            <text
              key={num}
              x={center + r * Math.cos(angle)}
              y={center + r * Math.sin(angle)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={11}
              fontWeight="600"
              fill="#333"
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
          x2={center + 30 * Math.cos(((hourAngle - 90) * Math.PI) / 180)}
          y2={center + 30 * Math.sin(((hourAngle - 90) * Math.PI) / 180)}
          stroke="#222"
          strokeWidth={3.5}
          strokeLinecap="round"
        />

        {/* Minute hand */}
        <line
          x1={center}
          y1={center}
          x2={center + 42 * Math.cos(((minuteAngle - 90) * Math.PI) / 180)}
          y2={center + 42 * Math.sin(((minuteAngle - 90) * Math.PI) / 180)}
          stroke="#222"
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Second hand */}
        <line
          x1={center - 10 * Math.cos(((secondAngle - 90) * Math.PI) / 180)}
          y1={center - 10 * Math.sin(((secondAngle - 90) * Math.PI) / 180)}
          x2={center + 48 * Math.cos(((secondAngle - 90) * Math.PI) / 180)}
          y2={center + 48 * Math.sin(((secondAngle - 90) * Math.PI) / 180)}
          stroke="#CC3333"
          strokeWidth={1}
          strokeLinecap="round"
        />

        {/* Center cap */}
        <circle cx={center} cy={center} r={4} fill="#333" />
        <circle cx={center} cy={center} r={2.5} fill="#CC3333" />
      </svg>

      {/* Digital time + AM/PM below clock */}
      <div className="text-center mt-1">
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {digitalTime}
        </span>
        <span
          className="text-[10px] ml-1 font-medium"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          {ampm}
        </span>
      </div>
    </div>
  );
}
