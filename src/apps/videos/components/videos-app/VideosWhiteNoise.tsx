import { useEffect, useRef } from "react";
import { useIsPresent } from "motion/react";

function WhiteNoiseEffect({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const brightnessAnimationFrameRef = useRef<number | null>(null);
  const brightnessRef = useRef(0);

  useEffect(() => {
    if (!active) {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let imageData: ImageData | null = null;
    let pixels32: Uint32Array | null = null;

    const resizeCanvas = () => {
      const width = Math.max(1, Math.floor(canvas.offsetWidth / 1.5));
      const height = Math.max(1, Math.floor(canvas.offsetHeight / 1.5));
      const sizeChanged = canvas.width !== width || canvas.height !== height;
      if (sizeChanged) {
        canvas.width = width;
        canvas.height = height;
      }
      if (sizeChanged || !imageData || !pixels32) {
        imageData = ctx.createImageData(width, height);
        pixels32 = new Uint32Array(imageData.data.buffer);
      }
    };

    const drawNoise = () => {
      if (!imageData || !pixels32) {
        animationFrameRef.current = requestAnimationFrame(drawNoise);
        return;
      }

      const brightness = brightnessRef.current;
      const len = pixels32.length;
      for (let i = 0; i < len; i++) {
        const value = (Math.random() * 255 * brightness) | 0;
        pixels32[i] = 0xff000000 | (value << 16) | (value << 8) | value;
      }

      for (let y = 0; y < canvas.height; y += 2) {
        const rowStart = y * canvas.width;
        const rowEnd = rowStart + canvas.width;
        for (let i = rowStart; i < rowEnd; i++) {
          const value = ((pixels32[i] & 0xff) * 205) >> 8;
          pixels32[i] = 0xff000000 | (value << 16) | (value << 8) | value;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      animationFrameRef.current = requestAnimationFrame(drawNoise);
    };

    resizeCanvas();
    drawNoise();

    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      imageData = null;
      pixels32 = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active) {
      if (brightnessAnimationFrameRef.current !== null) {
        cancelAnimationFrame(brightnessAnimationFrameRef.current);
        brightnessAnimationFrameRef.current = null;
      }
      brightnessRef.current = 0;
      return;
    }

    const duration = 1000;
    const startTime = performance.now();
    const startBrightness = 0;
    const targetBrightness = 1;
    brightnessRef.current = startBrightness;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      brightnessRef.current =
        startBrightness + (targetBrightness - startBrightness) * easeOut;

      if (progress < 1) {
        brightnessAnimationFrameRef.current = requestAnimationFrame(animate);
      } else {
        brightnessAnimationFrameRef.current = null;
      }
    };

    brightnessAnimationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (brightnessAnimationFrameRef.current !== null) {
        cancelAnimationFrame(brightnessAnimationFrameRef.current);
        brightnessAnimationFrameRef.current = null;
      }
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: "-1px",
        bottom: "-1px",
        width: "calc(100% + 1px)",
        height: "calc(100% + 1px)",
      }}
    />
  );
}

export function VideosWhiteNoiseOverlay() {
  const isPresent = useIsPresent();
  return <WhiteNoiseEffect active={isPresent} />;
}
