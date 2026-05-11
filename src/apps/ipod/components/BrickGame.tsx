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
import { useIpodStore } from "@/stores/useIpodStore";

// Game-world dimensions in CSS pixels. The iPod screen is 150px tall ×
// ~218px wide (250px device − 2×16px padding); the title bar takes 26px,
// leaving ~124px of body. We design the world for the smallest sensible
// body size so the paddle is always reachable, and let the canvas
// element's CSS handle the actual rendered size.
const GAME_WIDTH = 200;
const GAME_HEIGHT = 110;

// Brick layout — slim rows occupying ~20% of the play area.
const BRICK_COLS = 10;
const BRICK_ROWS = 4;
const BRICK_GAP = 1;
const BRICK_TOP_OFFSET = 3;
const BRICK_SIDE_OFFSET = 2;
const BRICK_HEIGHT = 4;

// Paddle / ball
const PADDLE_WIDTH = 28;
const PADDLE_HEIGHT = 3;
const PADDLE_Y = GAME_HEIGHT - 7;
const BALL_RADIUS = 1.5;
const BALL_BASE_SPEED = 75; // px / sec
const BALL_SPEED_INCREMENT = 7; // per level

// Target nudge per wheel detent (IpodWheel ≈15°); paddle eases toward target each frame.
const WHEEL_TICK_PIXELS = 11;
const PADDLE_SMOOTH_SPEED = 520; // game-units / sec toward target

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
    playScroll: _playScroll,
    vibrate,
  },
  ref
) {
  const { t } = useTranslation();
  const uiVariant = useIpodStore((s) => s.uiVariant ?? "modern");
  const isModernUi = uiVariant === "modern";
  /** Body offset for `calc(100% - …)` — classic chrome ~26px.
   *  Modern bar matches `MODERN_TITLEBAR_HEIGHT` in IpodScreen (21px) so the
   *  brick game's chrome lines up with the main menu's titlebar. */
  const bodyTopOffsetPx = isModernUi ? 21 : 26;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<GameState>(initialState());
  const phaseRef = useRef<Phase>("ready");
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const enteredRef = useRef(false);
  const paddleTargetXRef = useRef(GAME_WIDTH / 2 - PADDLE_WIDTH / 2);
  const lastSyncedScoreRef = useRef(0);
  const lastSyncedLivesRef = useRef(STARTING_LIVES);
  const lastBrickVibrateRef = useRef(0);

  // React state mirrors only what the UI text needs to render.
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(STARTING_LIVES);
  const [phase, setPhase] = useState<Phase>("ready");

  const syncUI = useCallback(() => {
    const s = stateRef.current;
    if (s.score !== lastSyncedScoreRef.current) {
      lastSyncedScoreRef.current = s.score;
      setScore(s.score);
    }
    if (s.lives !== lastSyncedLivesRef.current) {
      lastSyncedLivesRef.current = s.lives;
      setLives(s.lives);
    }
  }, []);

  const resetPaddleTarget = useCallback((paddleX: number) => {
    paddleTargetXRef.current = paddleX;
  }, []);

  const stepPaddle = useCallback((dt: number) => {
    const s = stateRef.current;
    const maxX = GAME_WIDTH - PADDLE_WIDTH;
    const target = Math.max(0, Math.min(maxX, paddleTargetXRef.current));
    const dx = target - s.paddleX;
    if (Math.abs(dx) < 0.02) {
      s.paddleX = target;
    } else {
      const step = PADDLE_SMOOTH_SPEED * dt;
      s.paddleX += Math.max(-step, Math.min(step, dx));
    }
    const p = phaseRef.current;
    if (p === "ready" || p === "lifeLost") {
      s.ballX = s.paddleX + PADDLE_WIDTH / 2;
    }
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // Backing-store pixels already include devicePixelRatio; map game units to bitmap.
    const sx = canvas.width / GAME_WIDTH;
    const sy = canvas.height / GAME_HEIGHT;
    if (sx <= 0 || sy <= 0) return;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    // Default 2d context is transparent so the LCD gradient behind the canvas shows through.
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const fg = isModernUi ? "#1c1c1e" : "#0a3667";
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
  }, [isModernUi]);

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
          const now = performance.now();
          if (now - lastBrickVibrateRef.current > 120) {
            lastBrickVibrateRef.current = now;
            vibrate?.();
          }
          break;
        }
      }

      // All bricks cleared → next level
      if (s.bricks.every((b) => !b.alive)) {
        s.level += 1;
        s.bricks = makeBricks(s.level);
        const cx = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
        s.paddleX = cx;
        resetPaddleTarget(cx);
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
        const cx = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
        s.paddleX = cx;
        resetPaddleTarget(cx);
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
    [setPhaseBoth, syncUI, vibrate, resetPaddleTarget]
  );

  const loop = useCallback(
    (now: number) => {
      const last = lastFrameRef.current ?? now;
      const dt = Math.min(0.05, (now - last) / 1000); // clamp huge gaps (tab switch)
      lastFrameRef.current = now;
      stepPaddle(dt);
      stepPhysics(dt);
      draw();
      rafRef.current = requestAnimationFrame(loop);
    },
    [stepPaddle, stepPhysics, draw]
  );

  const startLoop = useCallback(() => {
    if (rafRef.current != null) return;
    lastFrameRef.current = null;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // Size the bitmap from the play-area container. CSS must pin display size
  // (w-full h-full); otherwise width/height attributes become the layout size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const cssW = container.clientWidth;
      const cssH = container.clientHeight;
      if (cssW <= 0 || cssH <= 0) return;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      const targetW = Math.round(cssW * dpr);
      const targetH = Math.round(cssH * dpr);
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;
      draw();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, [draw]);

  // Reset and start the render/physics loop while visible.
  useEffect(() => {
    if (isVisible) {
      if (!enteredRef.current) {
        enteredRef.current = true;
        onEnter?.();
        const fresh = initialState(1);
        stateRef.current = fresh;
        resetPaddleTarget(fresh.paddleX);
        lastSyncedScoreRef.current = 0;
        lastSyncedLivesRef.current = STARTING_LIVES;
        setPhaseBoth("ready");
        syncUI();
      }
      startLoop();
    } else {
      enteredRef.current = false;
      stopLoop();
      const fresh = initialState(1);
      stateRef.current = fresh;
      resetPaddleTarget(fresh.paddleX);
      setPhaseBoth("ready");
      syncUI();
    }
    return () => {
      stopLoop();
    };
  }, [isVisible, onEnter, startLoop, stopLoop, setPhaseBoth, syncUI, resetPaddleTarget]);

  // Imperative API
  useImperativeHandle(
    ref,
    () => ({
      navigate: (direction) => {
        if (!isVisible) return false;
        const maxX = GAME_WIDTH - PADDLE_WIDTH;
        const delta = direction === "next" ? WHEEL_TICK_PIXELS : -WHEEL_TICK_PIXELS;
        paddleTargetXRef.current = Math.max(
          0,
          Math.min(maxX, paddleTargetXRef.current + delta)
        );
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
          const fresh = initialState(1);
          stateRef.current = fresh;
          resetPaddleTarget(fresh.paddleX);
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
    [isVisible, playClick, setPhaseBoth, syncUI, vibrate, resetPaddleTarget]
  );

  if (!isVisible) return null;

  const isResultsScreen = phase === "gameOver" || phase === "won";

  const pauseOverlay = phase === "paused" ? t("apps.ipod.brickGame.paused") : null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex h-full max-h-full flex-col overflow-hidden select-none",
        !isModernUi && "font-chicago",
        isModernUi ? "font-ipod-modern-ui" : "",
        "border border-black border-2 rounded-[2px]",
        lcdFilterOn && !isModernUi ? "lcd-screen" : "",
        isModernUi
          ? "ipod-modern-screen bg-white"
          : backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        lcdFilterOn &&
          backlightOn &&
          !isModernUi &&
          "shadow-[0_0_10px_2px_rgba(197,224,245,0.05)]"
      )}
    >
      {lcdFilterOn && !isModernUi && (
        <div className="absolute inset-0 pointer-events-none z-[25] lcd-scan-lines" />
      )}
      {lcdFilterOn && !isModernUi && (
        <div className="absolute inset-0 pointer-events-none z-[25] lcd-reflection" />
      )}

      {/* Title bar */}
      <div
        className={cn(
          "shrink-0 flex items-center z-10 py-0 px-2 tabular-nums",
          isModernUi
            ? "ipod-modern-titlebar font-ipod-modern-ui text-[15px] font-semibold text-black"
            : "border-b border-[#0a3667] font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
        )}
        style={isModernUi ? { height: 21, minHeight: 21 } : undefined}
      >
        <div
          className={cn(
            "flex w-10 items-center justify-start",
            isModernUi ? "text-[15px] font-semibold text-black/80" : "text-xs"
          )}
        >
          {isResultsScreen ? t("apps.ipod.brickGame.results") : `♥ ${lives}`}
        </div>
        <div
          className={cn(
            "flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-center",
            isModernUi && "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]"
          )}
        >
          {t("apps.ipod.brickGame.title")}
        </div>
        <div
          className={cn(
            "flex w-10 items-center justify-end",
            isModernUi ? "text-[15px] font-semibold text-black/80" : "text-xs"
          )}
        >
          {score}
        </div>
      </div>

      <div
        className="relative z-30 w-full min-h-0 overflow-hidden"
        style={{ height: `calc(100% - ${bodyTopOffsetPx}px)` }}
      >
        {/* Results screen replaces the canvas entirely */}
        {isResultsScreen ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center",
              isModernUi ? "font-ipod-modern-ui" : "font-chicago text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
            )}
          >
            <span
              className={cn(
                "tabular-nums leading-4 text-[16px]",
                isModernUi ? "font-semibold text-black" : ""
              )}
            >
              {score} {t("apps.ipod.brickGame.pts")}
            </span>
            <span
              className={cn(
                "leading-4 text-[14px]",
                isModernUi ? "font-normal text-[rgb(99,101,103)]" : ""
              )}
            >
              {phase === "won"
                ? t("apps.ipod.brickGame.youWin")
                : t("apps.ipod.brickGame.gameOverTitle")}
            </span>
            <div
              className={cn(
                "flex flex-col leading-4 opacity-85 text-[14px]",
                isModernUi ? "font-normal text-[rgb(99,101,103)]" : ""
              )}
            >
              <span>{t("apps.ipod.brickGame.pressCenterToReplay")}</span>
              <span>{t("apps.ipod.brickGame.menuToExit")}</span>
            </div>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="block size-full max-h-full max-w-full"
              style={{ imageRendering: "pixelated" }}
              aria-label={t("apps.ipod.brickGame.title")}
            />
            {pauseOverlay && (
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
                aria-live="polite"
              >
                <div
                  className={cn(
                    "rounded-[2px] border px-2 py-0.5 text-center whitespace-nowrap text-[11px] leading-tight",
                    isModernUi
                      ? "border-[rgb(200,200,205)] bg-white/90 font-ipod-modern-ui font-semibold text-black"
                      : "border-[#0a3667] bg-[#c5e0f5]/85 font-chicago text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                  )}
                >
                  {pauseOverlay}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});
