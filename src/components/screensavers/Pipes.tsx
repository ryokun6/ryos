import { useEffect, useRef } from "react";
import type { ScreenSaverCanvasProps } from "./Starfield";

interface Pipe {
  x: number;
  y: number;
  z: number;
  direction: number; // 0-5 for 6 directions
  color: string;
  segments: { x: number; y: number; z: number; dir: number }[];
}

const COLORS = [
  "#FF4444",
  "#44FF44",
  "#4444FF",
  "#FFFF44",
  "#FF44FF",
  "#44FFFF",
  "#FF8844",
  "#88FF44",
];

export function Pipes(props: ScreenSaverCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, position = "fixed", className } = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const pipes: Pipe[] = [];
    const isPreview = typeof width === "number" && typeof height === "number";
    const maxPipes = isPreview ? 4 : 6;
    const gridSize = isPreview ? 16 : 30;
    const pipeWidth = isPreview ? 5 : 8;

    const resize = () => {
      if (typeof width === "number" && typeof height === "number") {
        canvas.width = Math.max(1, Math.floor(width));
        canvas.height = Math.max(1, Math.floor(height));
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };

    resize();

    // Isometric projection helpers
    const project = (x: number, y: number, z: number) => {
      const isoX = (x - z) * 0.866;
      const isoY = (x + z) * 0.5 - y;
      return {
        x: canvas.width / 2 + isoX * gridSize,
        y: canvas.height / 2 + isoY * gridSize,
      };
    };

    const createPipe = (): Pipe => {
      const x = Math.floor(Math.random() * 10) - 5;
      const y = Math.floor(Math.random() * 10) - 5;
      const z = Math.floor(Math.random() * 10) - 5;
      return {
        x,
        y,
        z,
        direction: Math.floor(Math.random() * 6),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        segments: [{ x, y, z, dir: Math.floor(Math.random() * 6) }],
      };
    };

    // Initialize some pipes
    for (let i = 0; i < 3; i++) {
      pipes.push(createPipe());
    }

    const getNextPosition = (pipe: Pipe) => {
      const dirs = [
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: -1 },
      ];

      // Maybe change direction
      if (Math.random() > 0.85) {
        pipe.direction = Math.floor(Math.random() * 6);
      }

      const dir = dirs[pipe.direction];
      return {
        x: pipe.x + dir.x,
        y: pipe.y + dir.y,
        z: pipe.z + dir.z,
      };
    };

    const drawPipeSegment = (
      from: { x: number; y: number; z: number },
      to: { x: number; y: number; z: number },
      color: string
    ) => {
      const p1 = project(from.x, from.y, from.z);
      const p2 = project(to.x, to.y, to.z);

      // Draw pipe with 3D effect
      ctx.strokeStyle = color;
      ctx.lineWidth = pipeWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Highlight
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = pipeWidth / 3;
      ctx.beginPath();
      ctx.moveTo(p1.x - 2, p1.y - 2);
      ctx.lineTo(p2.x - 2, p2.y - 2);
      ctx.stroke();
    };

    const drawJoint = (pos: { x: number; y: number; z: number }, color: string) => {
      const p = project(pos.x, pos.y, pos.z);

      // Draw spherical joint
      const gradient = ctx.createRadialGradient(
        p.x - 3,
        p.y - 3,
        0,
        p.x,
        p.y,
        pipeWidth
      );
      gradient.addColorStop(0, "rgba(255,255,255,0.5)");
      gradient.addColorStop(0.5, color);
      gradient.addColorStop(1, "rgba(0,0,0,0.3)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pipeWidth / 1.5, 0, Math.PI * 2);
      ctx.fill();
    };

    let frameCount = 0;

    const animate = () => {
      frameCount++;

      // Slowly fade background for trail effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.02)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update pipes every few frames
      if (frameCount % 3 === 0) {
        for (const pipe of pipes) {
          const nextPos = getNextPosition(pipe);

          // Check bounds
          if (
            Math.abs(nextPos.x) > 8 ||
            Math.abs(nextPos.y) > 8 ||
            Math.abs(nextPos.z) > 8
          ) {
            // Reset pipe
            Object.assign(pipe, createPipe());
            continue;
          }

          // Draw segment
          drawPipeSegment({ x: pipe.x, y: pipe.y, z: pipe.z }, nextPos, pipe.color);
          drawJoint(nextPos, pipe.color);

          // Update position
          pipe.segments.push({ ...nextPos, dir: pipe.direction });
          pipe.x = nextPos.x;
          pipe.y = nextPos.y;
          pipe.z = nextPos.z;

          // Limit segment history
          if (pipe.segments.length > 100) {
            pipe.segments.shift();
          }
        }

        // Maybe add a new pipe
        if (pipes.length < maxPipes && Math.random() > 0.99) {
          pipes.push(createPipe());
        }
      }

      animationId = requestAnimationFrame(animate);
    };

    // Initial black fill
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    animate();

    if (!isPreview) {
      window.addEventListener("resize", resize);
    }

    return () => {
      cancelAnimationFrame(animationId);
      if (!isPreview) {
        window.removeEventListener("resize", resize);
      }
    };
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      className={`${position === "fixed" ? "fixed" : "absolute"} inset-0 w-full h-full ${className ?? ""}`}
      style={{ background: "black" }}
    />
  );
}
