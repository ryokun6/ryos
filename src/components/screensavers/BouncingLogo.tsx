import { useEffect, useRef, useState, useCallback } from "react";

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

  // Calculate logo size based on viewport width (30% of viewport width)
  const getLogoSize = useCallback(() => {
    const vw = window.innerWidth;
    const width = Math.max(200, Math.min(800, vw * 0.3));
    const height = width * 0.5; // Maintain aspect ratio
    return { width, height };
  }, []);

  const [logoSize, setLogoSize] = useState(getLogoSize);
  const logoSizeRef = useRef(logoSize);

  // Update logo size on window resize
  useEffect(() => {
    const handleResize = () => {
      const newSize = getLogoSize();
      setLogoSize(newSize);
      logoSizeRef.current = newSize;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getLogoSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationId: number;
    let currentPos = { ...position };
    const currentVel = { ...velocity };
    let currentColor = colorIndex;

    const animate = () => {
      const bounds = container.getBoundingClientRect();
      const size = logoSizeRef.current;
      let newX = currentPos.x + currentVel.x;
      let newY = currentPos.y + currentVel.y;
      let bounced = false;

      // Bounce off walls
      if (newX <= 0 || newX + size.width >= bounds.width) {
        currentVel.x = -currentVel.x;
        newX = Math.max(0, Math.min(newX, bounds.width - size.width));
        bounced = true;
      }

      if (newY <= 0 || newY + size.height >= bounds.height) {
        currentVel.y = -currentVel.y;
        newY = Math.max(0, Math.min(newY, bounds.height - size.height));
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
          viewBox="0 0 120 60"
          className="w-full h-full"
          style={{ color: COLORS[colorIndex] }}
        >
          {/* ryOS logo */}
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
        </svg>
      </div>
    </div>
  );
}
