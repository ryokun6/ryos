import {
  BALL_RADIUS,
  GAME_HEIGHT,
  GAME_WIDTH,
  MODERN_BRICK_COLORS,
  PADDLE_HEIGHT,
  PADDLE_WIDTH,
  PADDLE_Y,
} from "./constants";
import type { GameState } from "./types";

export function drawBrickGame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  state: GameState,
  isModernUi: boolean
) {
  ctx.imageSmoothingEnabled = false;
  const sx = canvas.width / GAME_WIDTH;
  const sy = canvas.height / GAME_HEIGHT;
  if (sx <= 0 || sy <= 0) return;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  const fg = isModernUi ? "#1c1c1e" : "#0a3667";

  for (const b of state.bricks) {
    if (!b.alive) continue;
    if (isModernUi) {
      const color = MODERN_BRICK_COLORS[b.row % MODERN_BRICK_COLORS.length];
      const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      grad.addColorStop(0, color.highlight);
      grad.addColorStop(0.5, color.body);
      grad.addColorStop(1, color.shadow);
      ctx.fillStyle = grad;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      const glossH = b.h * 0.5;
      const glossGrad = ctx.createLinearGradient(0, b.y, 0, b.y + glossH);
      glossGrad.addColorStop(0, color.topGloss);
      glossGrad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glossGrad;
      ctx.fillRect(b.x, b.y, b.w, glossH);
      ctx.strokeStyle = color.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    } else {
      ctx.fillStyle = fg;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
  }

  if (isModernUi) {
    const pGrad = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_HEIGHT);
    pGrad.addColorStop(0, "#5c5c60");
    pGrad.addColorStop(0.5, "#252527");
    pGrad.addColorStop(1, "#0a0a0b");
    ctx.fillStyle = pGrad;
    ctx.fillRect(state.paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillRect(state.paddleX, PADDLE_Y, PADDLE_WIDTH, Math.max(1, PADDLE_HEIGHT * 0.35));
  } else {
    ctx.fillStyle = fg;
    ctx.fillRect(state.paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT);
  }

  if (isModernUi) {
    const bGrad = ctx.createRadialGradient(
      state.ballX - BALL_RADIUS * 0.4,
      state.ballY - BALL_RADIUS * 0.4,
      BALL_RADIUS * 0.1,
      state.ballX,
      state.ballY,
      BALL_RADIUS
    );
    bGrad.addColorStop(0, "rgba(255,255,255,0.95)");
    bGrad.addColorStop(0.45, "#6e6e72");
    bGrad.addColorStop(1, "#101012");
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(state.ballX, state.ballY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(state.ballX, state.ballY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}
