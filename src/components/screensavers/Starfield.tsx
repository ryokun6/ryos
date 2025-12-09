import { useEffect, useRef } from "react";

export interface ScreenSaverCanvasProps {
  width?: number;
  height?: number;
  /**
   * Used by `ScreenSaverOverlay` (fixed) vs embedded previews (absolute).
   */
  position?: "fixed" | "absolute";
  className?: string;
}

interface Star {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
}

export function Starfield(props: ScreenSaverCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, position = "fixed", className } = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const stars: Star[] = [];
    // Scale down a bit for tiny previews, but keep the same "warp" look.
    const isPreview = typeof width === "number" && typeof height === "number";
    const numStars = isPreview
      ? Math.round(Math.max(120, Math.min(400, (width * height) / 40)))
      : 400;
    const speed = isPreview ? 10 : 15;
    const focalLength = 256;

    const resize = () => {
      if (typeof width === "number" && typeof height === "number") {
        canvas.width = Math.max(1, Math.floor(width));
        canvas.height = Math.max(1, Math.floor(height));
      } else {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };

    const initStars = () => {
      stars.length = 0;
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: Math.random() * canvas.width - canvas.width / 2,
          y: Math.random() * canvas.height - canvas.height / 2,
          z: Math.random() * canvas.width,
          prevX: 0,
          prevY: 0,
        });
      }
    };

    const animate = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.z -= speed;

        if (star.z <= 0) {
          star.x = Math.random() * canvas.width - centerX;
          star.y = Math.random() * canvas.height - centerY;
          star.z = canvas.width;
          star.prevX = 0;
          star.prevY = 0;
        }

        const k = focalLength / star.z;
        const x = star.x * k + centerX;
        const y = star.y * k + centerY;

        if (star.prevX !== 0 || star.prevY !== 0) {
          const brightness = Math.min(255, Math.floor((1 - star.z / canvas.width) * 255));
          ctx.strokeStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
          ctx.lineWidth = (1 - star.z / canvas.width) * 3;
          ctx.beginPath();
          ctx.moveTo(star.prevX, star.prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }

        star.prevX = x;
        star.prevY = y;
      }

      animationId = requestAnimationFrame(animate);
    };

    resize();
    initStars();
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
