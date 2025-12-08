import { useEffect, useRef, useState } from "react";

const COLORS = [
  "#FF0000", // Red
  "#FF7F00", // Orange
  "#FFFF00", // Yellow
  "#00FF00", // Green
  "#0000FF", // Blue
  "#4B0082", // Indigo
  "#9400D3", // Violet
  "#FF1493", // Deep Pink
  "#00FFFF", // Cyan
  "#FF69B4", // Hot Pink
];

export function BouncingLogo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [velocity, setVelocity] = useState({ x: 2, y: 2 });
  const [colorIndex, setColorIndex] = useState(0);
  const logoSize = { width: 120, height: 80 };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationId: number;
    let currentPos = { ...position };
    const currentVel = { ...velocity };
    let currentColor = colorIndex;

    const animate = () => {
      const bounds = container.getBoundingClientRect();
      let newX = currentPos.x + currentVel.x;
      let newY = currentPos.y + currentVel.y;
      let bounced = false;

      // Bounce off walls
      if (newX <= 0 || newX + logoSize.width >= bounds.width) {
        currentVel.x = -currentVel.x;
        newX = Math.max(0, Math.min(newX, bounds.width - logoSize.width));
        bounced = true;
      }

      if (newY <= 0 || newY + logoSize.height >= bounds.height) {
        currentVel.y = -currentVel.y;
        newY = Math.max(0, Math.min(newY, bounds.height - logoSize.height));
        bounced = true;
      }

      if (bounced) {
        currentColor = (currentColor + 1) % COLORS.length;
        setColorIndex(currentColor);
      }

      currentPos = { x: newX, y: newY };
      setPosition(currentPos);
      setVelocity(currentVel);

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 w-full h-full bg-black overflow-hidden"
    >
      <div
        className="absolute transition-colors duration-300"
        style={{
          left: position.x,
          top: position.y,
          width: logoSize.width,
          height: logoSize.height,
        }}
      >
        <svg
          viewBox="0 0 120 80"
          className="w-full h-full"
          style={{ color: COLORS[colorIndex] }}
        >
          {/* ryOS logo - stylized "ry" */}
          <text
            x="50%"
            y="50%"
            dominantBaseline="middle"
            textAnchor="middle"
            fill="currentColor"
            fontSize="36"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="bold"
          >
            ryOS
          </text>
          {/* Decorative underline */}
          <rect
            x="15"
            y="55"
            width="90"
            height="4"
            rx="2"
            fill="currentColor"
            opacity="0.7"
          />
        </svg>
      </div>
    </div>
  );
}
