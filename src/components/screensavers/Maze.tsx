import { useEffect, useRef } from "react";
import type { ScreenSaverCanvasProps } from "./Starfield";

export function Maze(props: ScreenSaverCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height, position = "fixed", className } = props;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;

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
    const isPreview = typeof width === "number" && typeof height === "number";

    // First-person 3D maze parameters
    const cellSize = 64;
    const mazeWidth = 20;
    const mazeHeight = 20;
    const maze: number[][] = [];

    // Generate maze using recursive backtracking
    const generateMaze = () => {
      // Initialize with all walls
      for (let y = 0; y < mazeHeight; y++) {
        maze[y] = [];
        for (let x = 0; x < mazeWidth; x++) {
          maze[y][x] = 1;
        }
      }

      const carve = (x: number, y: number) => {
        const directions = [
          [0, -2],
          [2, 0],
          [0, 2],
          [-2, 0],
        ];
        
        // Shuffle directions
        for (let i = directions.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [directions[i], directions[j]] = [directions[j], directions[i]];
        }

        for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;

          if (nx > 0 && nx < mazeWidth - 1 && ny > 0 && ny < mazeHeight - 1 && maze[ny][nx] === 1) {
            maze[y + dy / 2][x + dx / 2] = 0;
            maze[ny][nx] = 0;
            carve(nx, ny);
          }
        }
      };

      maze[1][1] = 0;
      carve(1, 1);
    };

    generateMaze();

    // Player position and direction
    let playerX = 1.5 * cellSize;
    let playerY = 1.5 * cellSize;
    let playerAngle = 0;
    const moveSpeed = 2;
    const turnSpeed = 0.02;

    // Raycasting parameters
    const fov = Math.PI / 3;
    const numRays = isPreview ? 90 : 120;

    const castRay = (angle: number) => {
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      
      let dist = 0;
      const maxDist = 1000;
      const step = 2;

      while (dist < maxDist) {
        const testX = playerX + cos * dist;
        const testY = playerY + sin * dist;
        
        const mapX = Math.floor(testX / cellSize);
        const mapY = Math.floor(testY / cellSize);

        if (mapX < 0 || mapX >= mazeWidth || mapY < 0 || mapY >= mazeHeight) {
          return maxDist;
        }

        if (maze[mapY][mapX] === 1) {
          return dist;
        }

        dist += step;
      }

      return maxDist;
    };

    // Auto-navigate: simple wall-following
    let turnDirection = 0;
    let stuckCounter = 0;

    const autoMove = () => {
      // Check front, left, and right
      const frontDist = castRay(playerAngle);
      const leftDist = castRay(playerAngle - Math.PI / 4);
      const rightDist = castRay(playerAngle + Math.PI / 4);

      // Turn if wall ahead
      if (frontDist < cellSize * 1.5) {
        if (leftDist > rightDist) {
          turnDirection = -1;
        } else {
          turnDirection = 1;
        }
        stuckCounter++;
      } else {
        turnDirection = 0;
        stuckCounter = 0;
      }

      // If stuck, turn more aggressively
      if (stuckCounter > 50) {
        playerAngle += Math.PI / 2;
        stuckCounter = 0;
      }

      playerAngle += turnDirection * turnSpeed * 2;

      // Move forward if possible
      const newX = playerX + Math.cos(playerAngle) * moveSpeed;
      const newY = playerY + Math.sin(playerAngle) * moveSpeed;
      
      const mapX = Math.floor(newX / cellSize);
      const mapY = Math.floor(newY / cellSize);

      if (mapX >= 0 && mapX < mazeWidth && mapY >= 0 && mapY < mazeHeight) {
        if (maze[mapY][mapX] === 0) {
          playerX = newX;
          playerY = newY;
        }
      }
    };

    const render = () => {
      // Clear with floor/ceiling gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#001133");
      gradient.addColorStop(0.5, "#002244");
      gradient.addColorStop(0.5, "#111111");
      gradient.addColorStop(1, "#222222");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Cast rays and draw walls
      const rayWidth = canvas.width / numRays;

      for (let i = 0; i < numRays; i++) {
        const rayAngle = playerAngle - fov / 2 + (i / numRays) * fov;
        const dist = castRay(rayAngle);

        // Fish-eye correction
        const correctedDist = dist * Math.cos(rayAngle - playerAngle);

        // Calculate wall height
        const wallHeight = (cellSize * canvas.height) / correctedDist;
        const wallTop = (canvas.height - wallHeight) / 2;

        // Wall brightness based on distance
        const brightness = Math.max(0, Math.min(255, 255 - correctedDist * 0.3));
        const color = `rgb(${brightness * 0.3}, ${brightness * 0.5}, ${brightness})`;

        ctx.fillStyle = color;
        ctx.fillRect(i * rayWidth, wallTop, rayWidth + 1, wallHeight);

        // Add edge highlighting
        if (i > 0) {
          const prevDist = castRay(playerAngle - fov / 2 + ((i - 1) / numRays) * fov);
          if (Math.abs(dist - prevDist) > 10) {
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.fillRect(i * rayWidth, wallTop, 2, wallHeight);
          }
        }
      }
    };

    const animate = () => {
      autoMove();
      render();
      animationId = requestAnimationFrame(animate);
    };

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
