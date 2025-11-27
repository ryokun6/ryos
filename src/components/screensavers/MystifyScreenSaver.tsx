import { useEffect, useRef } from "react";

interface Point {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Polygon {
  points: Point[];
  color: string; // current color
  hue: number; // for color cycling
}

const MAX_HISTORY = 8; // Reduced trails
const HISTORY_GAP = 5; // Frames to skip between snapshots
const NUM_POLYGONS = 2;
const NUM_POINTS = 4;
const SPEED = 4.5;

export function MystifyScreenSaver() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let animationFrameId: number;

    // State for polygons
    const polygons: Polygon[] = [];
    // History buffers: [polygonIndex][historyIndex] -> Array of points
    const history: Point[][][] = [];

    // Initialize Polygons
    for (let i = 0; i < NUM_POLYGONS; i++) {
      const points: Point[] = [];
      for (let j = 0; j < NUM_POINTS; j++) {
        points.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * SPEED * 2,
          vy: (Math.random() - 0.5) * SPEED * 2,
        });
      }
      // Start with distinct hues
      const hue = (i * 360) / NUM_POLYGONS;
      polygons.push({
        points,
        color: `hsl(${hue}, 100%, 50%)`,
        hue,
      });
      history.push([]);
    }

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const update = () => {
      // Clear with slight fade for extra trail smoothness, or hard clear
      // Classic Mystify is usually hard clear but draws multiple history frames
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);

      polygons.forEach((poly, polyIndex) => {
        // Update color
        poly.hue = (poly.hue + 0.5) % 360;
        poly.color = `hsl(${poly.hue}, 100%, 50%)`;

        // Update points
        poly.points.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;

          // Bounce off walls
          if (p.x < 0) {
            p.x = 0;
            p.vx *= -1;
          }
          if (p.x > width) {
            p.x = width;
            p.vx *= -1;
          }
          if (p.y < 0) {
            p.y = 0;
            p.vy *= -1;
          }
          if (p.y > height) {
            p.y = height;
            p.vy *= -1;
          }
        });

        // Save current state to history periodically
        // Deep copy points
        if (animationFrameId % HISTORY_GAP === 0) {
          const currentPoints = poly.points.map((p) => ({ ...p }));
          history[polyIndex].unshift(currentPoints);
          if (history[polyIndex].length > MAX_HISTORY) {
            history[polyIndex].pop();
          }
        }

        // Draw history
        history[polyIndex].forEach((pointsSnapshot) => {
          // Use constant full brightness/opacity
          ctx.strokeStyle = `hsl(${poly.hue}, 100%, 50%)`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pointsSnapshot[0].x, pointsSnapshot[0].y);
          for (let k = 1; k < pointsSnapshot.length; k++) {
            ctx.lineTo(pointsSnapshot[k].x, pointsSnapshot[k].y);
          }
          // Close the loop
          ctx.lineTo(pointsSnapshot[0].x, pointsSnapshot[0].y);
          ctx.stroke();
        });
      });

      animationFrameId = requestAnimationFrame(update);
    };

    window.addEventListener("resize", resize);
    resize();
    update();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full block bg-black" />;
}

export default MystifyScreenSaver;

