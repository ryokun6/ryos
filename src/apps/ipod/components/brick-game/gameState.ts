import {
  BALL_BASE_SPEED,
  BALL_RADIUS,
  BALL_SPEED_INCREMENT,
  BRICK_COLS,
  BRICK_GAP,
  BRICK_HEIGHT,
  BRICK_ROWS,
  BRICK_SIDE_OFFSET,
  BRICK_TOP_OFFSET,
  GAME_WIDTH,
  PADDLE_WIDTH,
  PADDLE_Y,
  STARTING_LIVES,
} from "./constants";
import type { Brick, GameState } from "./types";

export function makeBricks(level: number): Brick[] {
  const totalGapWidth = BRICK_GAP * (BRICK_COLS - 1);
  const usableWidth = GAME_WIDTH - BRICK_SIDE_OFFSET * 2 - totalGapWidth;
  const brickWidth = usableWidth / BRICK_COLS;
  const bricks: Brick[] = [];
  const rows = Math.min(BRICK_ROWS + Math.floor((level - 1) / 2), BRICK_ROWS + 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const x = BRICK_SIDE_OFFSET + c * (brickWidth + BRICK_GAP);
      const y = BRICK_TOP_OFFSET + r * (BRICK_HEIGHT + BRICK_GAP);
      bricks.push({ x, y, w: brickWidth, h: BRICK_HEIGHT, alive: true, row: r });
    }
  }
  return bricks;
}

export function initialState(level = 1): GameState {
  return {
    paddleX: GAME_WIDTH / 2 - PADDLE_WIDTH / 2,
    ballX: GAME_WIDTH / 2,
    ballY: PADDLE_Y - BALL_RADIUS - 1,
    ballVX: 0,
    ballVY: 0,
    bricks: makeBricks(level),
    score: 0,
    lives: STARTING_LIVES,
    level,
  };
}

export function launchBall(state: GameState) {
  const speed = BALL_BASE_SPEED + (state.level - 1) * BALL_SPEED_INCREMENT;
  const dir = Math.random() < 0.5 ? -1 : 1;
  const angle = ((Math.random() * 30) + 30) * (Math.PI / 180);
  state.ballVX = Math.cos(angle) * speed * dir;
  state.ballVY = -Math.sin(angle) * speed;
}
