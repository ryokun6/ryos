import { useEffect, useRef } from "react";

export function StarfieldScreenSaver() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = window.innerWidth;
    let height = window.innerHeight;

    const stars: { x: number; y: number; z: number }[] = [];
    const speed = 18;
    const density = 0.0012;
    let starCount = 0;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      initStars();
    };

    const initStars = () => {
      stars.length = 0;
      starCount = Math.max(
        750,
        Math.floor(width * height * density)
      );
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: (Math.random() - 0.5) * width * 2,
          y: (Math.random() - 0.5) * height * 2,
          z: Math.random() * width,
        });
      }
    };

    const update = () => {
      ctx.fillStyle = "rgba(0, 0, 0, 1)";
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      for (let i = 0; i < starCount; i++) {
        const star = stars[i];
        star.z -= speed;

        if (star.z <= 0) {
          star.x = (Math.random() - 0.5) * width * 2;
          star.y = (Math.random() - 0.5) * height * 2;
          star.z = width;
        }

        const x = (star.x / star.z) * width + cx;
        const y = (star.y / star.z) * height + cy;

        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          const depthScale = 1 - star.z / width;
          const size = Math.max(1, depthScale * 4);
          const brightness = Math.min(255, Math.floor(180 + depthScale * 75));

          ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
          const drawX = Math.round(x);
          const drawY = Math.round(y);
          ctx.fillRect(drawX, drawY, size, size);
        }
      }

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


