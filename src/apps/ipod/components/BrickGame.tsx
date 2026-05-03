import {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// Logical (CSS) game canvas dimensions. The iPod screen is 150px tall and
// the title bar consumes ~24-28px depending on font metrics, leaving
// ~120-126px for the body. We size the canvas conservatively so the
// paddle never gets clipped, and anchor the canvas to the TOP of the
// flex body so the bottom (paddle) stays visible even if the title bar
// renders slightly taller than expected.
const GAME_WIDTH = 200;
const GAME_HEIGHT = 96;

// Brick layout — keep bricks shallow so the lower play area dominates.
const BRICK_COLS = 10;
const BRICK_ROWS = 4;
const BRICK_GAP = 1;
const BRICK_TOP_OFFSET = 3;
const BRICK_SIDE_OFFSET = 2;
const BRICK_HEIGHT = 3;

// Paddle / ball
const PADDLE_WIDTH = 28;
const PADDLE_HEIGHT = 2;
const PADDLE_Y = GAME_HEIGHT - 6;
const BALL_RADIUS = 1.5;
const BALL_BASE_SPEED = 70; // px / sec
const BALL_SPEED_INCREMENT = 7; // per level

// Wheel sensitivity: pixels of paddle movement per single rotation tick
const WHEEL_TICK_PIXELS = 14;

const STARTING_LIVES = 3;

type Phase = "ready" | "playing" | "paused" | "lifeLost" | "won" | "gameOver";

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

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  alive: boolean;
}

interface GameState {
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

function makeBricks(level: number): Brick[] {
  const totalGapWidth = BRICK_GAP * (BRICK_COLS - 1);
  const usableWidth = GAME_WIDTH - BRICK_SIDE_OFFSET * 2 - totalGapWidth;
  const brickWidth = usableWidth / BRICK_COLS;
  const bricks: Brick[] = [];
  // Number of rows scales modestly with level; cap so the brick block
  // never grows past ~⅓ of the play area, leaving room to track the ball.
  const rows = Math.min(BRICK_ROWS + Math.floor((level - 1) / 2), BRICK_ROWS + 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const x = BRICK_SIDE_OFFSET + c * (brickWidth + BRICK_GAP);
      const y = BRICK_TOP_OFFSET + r * (BRICK_HEIGHT + BRICK_GAP);
      bricks.push({ x, y, w: brickWidth, h: BRICK_HEIGHT, alive: true });
    }
  }
  return bricks;
}

function initialState(level = 1): GameState {
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

function launchBall(state: GameState) {
  const speed = BALL_BASE_SPEED + (state.level - 1) * BALL_SPEED_INCREMENT;
  // Slight random horizontal direction so launches aren't identical.
  const dir = Math.random() < 0.5 ? -1 : 1;
  const angle = ((Math.random() * 30) + 30) * (Math.PI / 180); // 30°–60° from horizontal
  state.ballVX = Math.cos(angle) * speed * dir;
  state.ballVY = -Math.sin(angle) * speed;
}

export const BrickGame = forwardRef<BrickGameRef, BrickGameProps>(function BrickGame(
  {
    isVisible,
    onExit: _onExit,
    lcdFilterOn = false,
    backlightOn = true,
    onEnter,
    playClick,
    playScroll,
    vibrate,
  },
  ref
) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(initialState());
  const phaseRef = useRef<Phase>("ready");
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const enteredRef = useRef(false);

  // React state mirrors only what the UI text needs to render.
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [level, setLevel] = useState(1);
  const [phase, setPhase] = useState<Phase>("ready");

  const syncUI = useCallback(() => {
    const s = stateRef.current;
    setScore(s.score);
    setLives(s.lives);
    setLevel(s.level);
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    // Reset transform then scale so logical units map to CSS pixels.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const fg = "#0a3667";
    ctx.fillStyle = fg;

    const s = stateRef.current;

    // Bricks
    for (const b of s.bricks) {
      if (!b.alive) continue;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    // Paddle
    ctx.fillRect(s.paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Ball
    ctx.beginPath();
    ctx.arc(s.ballX, s.ballY, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }, []);

  const stopLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameRef.current = null;
  }, []);

  const setPhaseBoth = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const stepPhysics = useCallback(
    (dt: number) => {
      const s = stateRef.current;
      if (phaseRef.current !== "playing") return;

      // Move ball
      s.ballX += s.ballVX * dt;
      s.ballY += s.ballVY * dt;

      // Wall collisions
      if (s.ballX - BALL_RADIUS < 0) {
        s.ballX = BALL_RADIUS;
        s.ballVX = Math.abs(s.ballVX);
      } else if (s.ballX + BALL_RADIUS > GAME_WIDTH) {
        s.ballX = GAME_WIDTH - BALL_RADIUS;
        s.ballVX = -Math.abs(s.ballVX);
      }
      if (s.ballY - BALL_RADIUS < 0) {
        s.ballY = BALL_RADIUS;
        s.ballVY = Math.abs(s.ballVY);
      }

      // Paddle collision
      if (
        s.ballVY > 0 &&
        s.ballY + BALL_RADIUS >= PADDLE_Y &&
        s.ballY + BALL_RADIUS <= PADDLE_Y + PADDLE_HEIGHT + 2 &&
        s.ballX >= s.paddleX - BALL_RADIUS &&
        s.ballX <= s.paddleX + PADDLE_WIDTH + BALL_RADIUS
      ) {
        s.ballY = PADDLE_Y - BALL_RADIUS;
        // Reflect off paddle with angle based on hit position.
        const hit = (s.ballX - (s.paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
        const speed = Math.hypot(s.ballVX, s.ballVY);
        const maxAngle = (60 * Math.PI) / 180;
        const angle = Math.max(-maxAngle, Math.min(maxAngle, hit * maxAngle));
        s.ballVX = Math.sin(angle) * speed;
        s.ballVY = -Math.abs(Math.cos(angle) * speed);
        vibrate?.();
      }

      // Brick collision: simple AABB vs circle (treat ball as small square).
      for (const b of s.bricks) {
        if (!b.alive) continue;
        if (
          s.ballX + BALL_RADIUS > b.x &&
          s.ballX - BALL_RADIUS < b.x + b.w &&
          s.ballY + BALL_RADIUS > b.y &&
          s.ballY - BALL_RADIUS < b.y + b.h
        ) {
          b.alive = false;
          s.score += 10;
          // Determine which side was hit to flip the correct velocity component.
          const prevX = s.ballX - s.ballVX * dt;
          const prevY = s.ballY - s.ballVY * dt;
          const wasOutsideX =
            prevX + BALL_RADIUS <= b.x || prevX - BALL_RADIUS >= b.x + b.w;
          const wasOutsideY =
            prevY + BALL_RADIUS <= b.y || prevY - BALL_RADIUS >= b.y + b.h;
          if (wasOutsideY) {
            s.ballVY = -s.ballVY;
          } else if (wasOutsideX) {
            s.ballVX = -s.ballVX;
          } else {
            s.ballVY = -s.ballVY;
          }
          syncUI();
          vibrate?.();
          break;
        }
      }

      // All bricks cleared → next level
      if (s.bricks.every((b) => !b.alive)) {
        s.level += 1;
        s.bricks = makeBricks(s.level);
        s.paddleX = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
        s.ballX = GAME_WIDTH / 2;
        s.ballY = PADDLE_Y - BALL_RADIUS - 1;
        s.ballVX = 0;
        s.ballVY = 0;
        setPhaseBoth("ready");
        syncUI();
        return;
      }

      // Ball fell below paddle → lose a life
      if (s.ballY - BALL_RADIUS > GAME_HEIGHT) {
        s.lives -= 1;
        s.paddleX = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
        s.ballX = GAME_WIDTH / 2;
        s.ballY = PADDLE_Y - BALL_RADIUS - 1;
        s.ballVX = 0;
        s.ballVY = 0;
        if (s.lives <= 0) {
          setPhaseBoth("gameOver");
        } else {
          setPhaseBoth("lifeLost");
        }
        syncUI();
      }
    },
    [setPhaseBoth, syncUI, vibrate]
  );

  const loop = useCallback(
    (now: number) => {
      const last = lastFrameRef.current ?? now;
      const dt = Math.min(0.05, (now - last) / 1000); // clamp huge gaps (tab switch)
      lastFrameRef.current = now;
      stepPhysics(dt);
      draw();
      rafRef.current = requestAnimationFrame(loop);
    },
    [stepPhysics, draw]
  );

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    lastFrameRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // Set up the canvas with a DPR-scaled backing store.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = GAME_WIDTH * dpr;
    canvas.height = GAME_HEIGHT * dpr;
    canvas.style.width = `${GAME_WIDTH}px`;
    canvas.style.height = `${GAME_HEIGHT}px`;
    draw();
  }, [draw]);

  // Reset and start the render/physics loop while visible.
  useEffect(() => {
    if (isVisible) {
      if (!enteredRef.current) {
        enteredRef.current = true;
        onEnter?.();
        stateRef.current = initialState(1);
        setPhaseBoth("ready");
        syncUI();
      }
      startLoop();
    } else {
      enteredRef.current = false;
      stopLoop();
      stateRef.current = initialState(1);
      setPhaseBoth("ready");
      syncUI();
    }
    return () => {
      stopLoop();
    };
  }, [isVisible, onEnter, startLoop, stopLoop, setPhaseBoth, syncUI]);

  // Imperative API
  useImperativeHandle(
    ref,
    () => ({
      navigate: (direction) => {
        if (!isVisible) return false;
        playScroll?.();
        const s = stateRef.current;
        const delta = direction === "next" ? WHEEL_TICK_PIXELS : -WHEEL_TICK_PIXELS;
        s.paddleX = Math.max(
          0,
          Math.min(GAME_WIDTH - PADDLE_WIDTH, s.paddleX + delta)
        );
        // While ball is stuck to paddle (ready / lifeLost), keep it centered above paddle.
        if (phaseRef.current === "ready" || phaseRef.current === "lifeLost") {
          s.ballX = s.paddleX + PADDLE_WIDTH / 2;
        }
        return true;
      },
      selectCurrent: () => {
        playClick?.();
        vibrate?.();
        const p = phaseRef.current;
        if (p === "ready" || p === "lifeLost") {
          launchBall(stateRef.current);
          setPhaseBoth("playing");
        } else if (p === "playing") {
          setPhaseBoth("paused");
        } else if (p === "paused") {
          setPhaseBoth("playing");
        } else if (p === "gameOver" || p === "won") {
          stateRef.current = initialState(1);
          setPhaseBoth("ready");
          syncUI();
        }
      },
      togglePause: () => {
        playClick?.();
        const p = phaseRef.current;
        if (p === "playing") setPhaseBoth("paused");
        else if (p === "paused") setPhaseBoth("playing");
      },
    }),
    [isVisible, playClick, playScroll, setPhaseBoth, syncUI, vibrate]
  );

  if (!isVisible) return null;

  const overlayMessage =
    phase === "ready"
      ? t("apps.ipod.brickGame.pressCenterToStart")
      : phase === "lifeLost"
      ? t("apps.ipod.brickGame.pressCenterToContinue")
      : phase === "paused"
      ? t("apps.ipod.brickGame.paused")
      : phase === "gameOver"
      ? t("apps.ipod.brickGame.gameOver")
      : phase === "won"
      ? t("apps.ipod.brickGame.youWin")
      : null;

  return (
    <div
      className={cn(
        "relative z-50 flex h-full min-h-[150px] w-full flex-col overflow-hidden select-none font-chicago",
        "border border-black border-2 rounded-[2px]",
        lcdFilterOn ? "lcd-screen" : "",
        backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        lcdFilterOn &&
          backlightOn &&
          "shadow-[0_0_10px_2px_rgba(197,224,245,0.05)]"
      )}
    >
      {lcdFilterOn && (
        <div className="absolute inset-0 pointer-events-none z-[25] lcd-scan-lines" />
      )}
      {lcdFilterOn && (
        <div className="absolute inset-0 pointer-events-none z-[25] lcd-reflection" />
      )}

      {/* Title bar — match IpodScreen */}
      <div className="border-b border-[#0a3667] py-0 px-2 font-chicago text-[16px] flex items-center sticky top-0 z-10 text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]">
        <div className="w-10 flex items-center justify-start text-xs tabular-nums">
          ♥ {lives}
        </div>
        <div className="flex-1 truncate text-center">
          {t("apps.ipod.brickGame.title")}
        </div>
        <div className="w-10 flex items-center justify-end text-xs tabular-nums">
          {score}
        </div>
      </div>

      {/* Body — anchor canvas to the top so the paddle (bottom edge of
          canvas) is always visible regardless of title-bar height. */}
      <div className="relative flex-1 min-h-0 overflow-hidden z-30">
        <canvas
          ref={canvasRef}
          className="block absolute top-0 left-1/2 -translate-x-1/2"
          style={{ width: GAME_WIDTH, height: GAME_HEIGHT, imageRendering: "pixelated" }}
          aria-label={t("apps.ipod.brickGame.title")}
        />

        {/* Level indicator (top-right of play area, away from bricks). */}
        <div className="pointer-events-none absolute top-0.5 right-1 font-chicago text-[9px] leading-none text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)] tabular-nums">
          L{level}
        </div>

        {overlayMessage && (
          <div
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
            style={{ top: GAME_HEIGHT / 2 - 10 }}
            aria-live="polite"
          >
            <div className="rounded-[2px] border border-[#0a3667] bg-[#c5e0f5]/85 px-2 py-0.5 font-chicago text-[11px] leading-tight text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)] text-center whitespace-nowrap">
              {overlayMessage}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
