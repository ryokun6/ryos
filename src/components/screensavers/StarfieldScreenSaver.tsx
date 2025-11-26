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

    const stars: { x: number; y: number; z: number; pz: number }[] = [];
    const speed = 15; // Slightly faster for better effect
    const numStars = 1000;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    };

    const initStars = () => {
      stars.length = 0;
      for (let i = 0; i < numStars; i++) {
        stars.push({
          x: (Math.random() - 0.5) * width * 2,
          y: (Math.random() - 0.5) * height * 2,
          z: Math.random() * width,
          pz: Math.random() * width, // previous z
        });
      }
    };

    const update = () => {
      // Create trail effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      for (let i = 0; i < numStars; i++) {
        const star = stars[i];
        
        // Move star closer
        star.z -= speed;

        // Reset star if it passes screen
        if (star.z <= 0) {
          star.x = (Math.random() - 0.5) * width * 2;
          star.y = (Math.random() - 0.5) * height * 2;
          star.z = width;
          star.pz = width;
        }

        // Project 3D coordinates to 2D
        const x = (star.x / star.z) * width + cx;
        const y = (star.y / star.z) * height + cy;

        // Project previous coordinates for trails
        const px = (star.x / star.pz) * width + cx;
        const py = (star.y / star.pz) * height + cy;

        star.pz = star.z;

        // Draw if within bounds
        if (x >= 0 && x <= width && y >= 0 && y <= height) {
          const distance = 1 - star.z / width;
          const size = distance * 3;
          const brightness = Math.floor(distance * 255);
          
          ctx.lineWidth = Math.max(0.5, size);
          ctx.strokeStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
          ctx.lineCap = "round";
          
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }

      animationFrameId = requestAnimationFrame(update);
    };

    window.addEventListener("resize", resize);
    resize();
    initStars();
    update();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full block bg-black" />;
}


