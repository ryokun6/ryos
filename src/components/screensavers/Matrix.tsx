import { useEffect, useRef } from "react";

export function Matrix() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resize();

    // Matrix characters (mix of katakana, numbers, and symbols)
    const chars = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ@#$%^&*()";
    const charArray = chars.split("");

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = new Array(columns).fill(1);

    // Initialize drops at random positions
    for (let i = 0; i < drops.length; i++) {
      drops[i] = Math.random() * -100;
    }

    const draw = () => {
      // Semi-transparent black to create trail effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#0F0";
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        // Random character
        const char = charArray[Math.floor(Math.random() * charArray.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Brighter head of the drop
        if (drops[i] > 0) {
          ctx.fillStyle = "#FFF";
          ctx.fillText(char, x, y);
          ctx.fillStyle = "#0F0";
        }

        // Draw the character
        if (drops[i] > 1) {
          const prevChar = charArray[Math.floor(Math.random() * charArray.length)];
          ctx.fillStyle = `rgba(0, 255, 0, ${0.8 - (drops[i] % 20) * 0.04})`;
          ctx.fillText(prevChar, x, y - fontSize);
        }

        drops[i]++;

        // Reset drop randomly after it goes off screen
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
      }

      animationId = requestAnimationFrame(draw);
    };

    // Initial black fill
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Start slower for smoother effect
    const intervalId = setInterval(() => {
      cancelAnimationFrame(animationId);
      draw();
    }, 50);

    const handleResize = () => {
      resize();
      // Recalculate columns
      const newColumns = Math.floor(canvas.width / fontSize);
      while (drops.length < newColumns) {
        drops.push(Math.random() * -100);
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      clearInterval(intervalId);
      cancelAnimationFrame(animationId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ background: "black" }}
    />
  );
}
