export type Phase = "ready" | "playing" | "paused" | "lifeLost" | "won" | "gameOver";

export interface BrickGameRef {
  /** Move paddle left/right. Returns true if handled. */
  navigate: (direction: "next" | "previous") => boolean;
  /** Confirm: start / pause / resume / restart from game over. */
  selectCurrent: () => void;
  /** Bottom of wheel — toggle pause during play. */
  togglePause: () => void;
}

export interface BrickGameProps {
  isVisible: boolean;
  onExit: () => void;
  lcdFilterOn?: boolean;
  backlightOn?: boolean;
  /** Pause main player when entering, called once when visible turns true. */
  onEnter?: () => void;
  playClick?: () => void;
  playScroll?: () => void;
  vibrate?: () => void;
}

export interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
  row: number;
}

export interface GameState {
  paddleX: number;
  ballX: number;
  ballY: number;
  ballVX: number;
  ballVY: number;
  bricks: Brick[];
  score: number;
  lives: number;
  level: number;
}
