import { useEffect, useRef } from "react";

interface Toaster {
  x: number;
  y: number;
  speed: number;
  frame: number;
  wingUp: boolean;
  wingTimer: number;
  scale: number;
}

// Simple pixel art toaster represented as a path
const drawToaster = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  wingUp: boolean,
  scale: number
) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Toaster body (silver/gray)
  ctx.fillStyle = "#C0C0C0";
  ctx.fillRect(0, 10, 40, 30);

  // Toaster slots (dark)
  ctx.fillStyle = "#404040";
  ctx.fillRect(5, 12, 12, 8);
  ctx.fillRect(23, 12, 12, 8);

  // Toast popping out
  ctx.fillStyle = "#D4A574";
  ctx.fillRect(6, 2, 10, 12);
  ctx.fillRect(24, 4, 10, 10);

  // Toast darker crust
  ctx.fillStyle = "#8B6914";
  ctx.fillRect(6, 2, 10, 2);
  ctx.fillRect(24, 4, 10, 2);

  // Toaster shine
  ctx.fillStyle = "#E8E8E8";
  ctx.fillRect(2, 12, 3, 10);

  // Toaster base
  ctx.fillStyle = "#808080";
  ctx.fillRect(-2, 38, 44, 4);

  // Wings
  ctx.fillStyle = "#FFFFFF";
  if (wingUp) {
    // Wings up
    ctx.beginPath();
    ctx.moveTo(-5, 15);
    ctx.lineTo(-20, 0);
    ctx.lineTo(-15, 5);
    ctx.lineTo(-5, 20);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(45, 15);
    ctx.lineTo(60, 0);
    ctx.lineTo(55, 5);
    ctx.lineTo(45, 20);
    ctx.fill();
  } else {
    // Wings down
    ctx.beginPath();
    ctx.moveTo(-5, 20);
    ctx.lineTo(-20, 30);
    ctx.lineTo(-15, 28);
    ctx.lineTo(-5, 25);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(45, 20);
    ctx.lineTo(60, 30);
    ctx.lineTo(55, 28);
    ctx.lineTo(45, 25);
    ctx.fill();
  }

  // Wing feather lines
  ctx.strokeStyle = "#D0D0D0";
  ctx.lineWidth = 1;
  if (wingUp) {
    ctx.beginPath();
    ctx.moveTo(-10, 10);
    ctx.lineTo(-17, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 10);
    ctx.lineTo(57, 5);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(-10, 25);
    ctx.lineTo(-17, 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 25);
    ctx.lineTo(57, 28);
    ctx.stroke();
  }

  ctx.restore();
};

export function FlyingToasters() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    const toasters: Toaster[] = [];
    const numToasters = 12;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const initToasters = () => {
      toasters.length = 0;
      for (let i = 0; i < numToasters; i++) {
        toasters.push({
          x: Math.random() * (canvas.width + 200) - 100,
          y: Math.random() * canvas.height - canvas.height,
          speed: 1 + Math.random() * 2,
          frame: 0,
          wingUp: Math.random() > 0.5,
          wingTimer: 0,
          scale: 0.8 + Math.random() * 0.6,
        });
      }
    };

    const animate = () => {
      // Dark blue/black background like After Dark
      ctx.fillStyle = "#000020";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw some stars in background
      ctx.fillStyle = "#FFFFFF";
      for (let i = 0; i < 50; i++) {
        const x = (i * 137.5) % canvas.width;
        const y = (i * 73.7) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
      }

      for (let i = 0; i < toasters.length; i++) {
        const toaster = toasters[i];

        // Move diagonally down-left
        toaster.x -= toaster.speed * 1.5;
        toaster.y += toaster.speed;

        // Flap wings
        toaster.wingTimer++;
        if (toaster.wingTimer > 8) {
          toaster.wingUp = !toaster.wingUp;
          toaster.wingTimer = 0;
        }

        // Reset if off screen
        if (toaster.y > canvas.height + 50 || toaster.x < -80) {
          toaster.x = canvas.width + 50 + Math.random() * 100;
          toaster.y = -50 - Math.random() * 200;
          toaster.speed = 1 + Math.random() * 2;
          toaster.scale = 0.8 + Math.random() * 0.6;
        }

        drawToaster(ctx, toaster.x, toaster.y, toaster.wingUp, toaster.scale);
      }

      animationId = requestAnimationFrame(animate);
    };

    resize();
    initToasters();
    animate();

    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ background: "#000020" }}
    />
  );
}
