import { useEffect, useRef, useReducer, useCallback } from "react";

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
  // Calculate logo size based on viewport width (30% of viewport width)
  const getLogoSize = useCallback(() => {
    const vw = window.innerWidth;
    const width = Math.max(200, Math.min(800, vw * 0.3));
    const height = width * 0.5; // Maintain aspect ratio
    return { width, height };
  }, []);

  type LogoState = {
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    colorIndex: number;
    logoSize: { width: number; height: number };
  };
  type LogoAction =
    | { type: "setLogoSize"; logoSize: { width: number; height: number } }
    | {
        type: "updateFrame";
        position: { x: number; y: number };
        velocity: { x: number; y: number };
        colorIndex: number;
      };
  const initialState: LogoState = {
    position: { x: 100, y: 100 },
    velocity: { x: 2, y: 2 },
    colorIndex: 0,
    logoSize: getLogoSize(),
  };
  const reducer = (state: LogoState, action: LogoAction): LogoState => {
    switch (action.type) {
      case "setLogoSize":
        return { ...state, logoSize: action.logoSize };
      case "updateFrame":
        return {
          ...state,
          position: action.position,
          velocity: action.velocity,
          colorIndex: action.colorIndex,
        };
      default:
        return state;
    }
  };
  const [state, dispatch] = useReducer(reducer, initialState);
  const { position, velocity, colorIndex, logoSize } = state;
  const positionRef = useRef(position);
  const velocityRef = useRef(velocity);
  const colorIndexRef = useRef(colorIndex);
  const logoSizeRef = useRef(logoSize);

  // Update logo size on window resize
  useEffect(() => {
    const handleResize = () => {
      const newSize = getLogoSize();
      dispatch({ type: "setLogoSize", logoSize: newSize });
      logoSizeRef.current = newSize;
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [getLogoSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationId: number;
    let currentPos = { ...positionRef.current };
    const currentVel = { ...velocityRef.current };
    let currentColor = colorIndexRef.current;

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
        colorIndexRef.current = currentColor;
      }

      currentPos = { x: newX, y: newY };
      positionRef.current = currentPos;
      velocityRef.current = currentVel;
      dispatch({
        type: "updateFrame",
        position: currentPos,
        velocity: { x: currentVel.x, y: currentVel.y },
        colorIndex: currentColor,
      });

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
