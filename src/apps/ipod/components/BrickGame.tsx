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
import { BatteryIndicator } from "./screen/BatteryIndicator";
import { IpodModernPlayPauseIcon } from "./screen/IpodModernPlayPauseIcon";

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
// 6 game units ≈ ~9 device pixels at 2× DPR — enough vertical room for the
// three-stop gradient + top gloss strip to read as a glossy lozenge in the
// modern (nano 6G/7G) skin, while still keeping the brick band well above
// the paddle. The classic skin gets slightly chunkier monochrome bricks
// which is fine for the 1st-gen LCD aesthetic.
const BRICK_HEIGHT = 6;

/** Per-row brick palette for the modern (nano 6G/7G) skin. Each row gets
 *  a top-to-bottom glossy gradient mirroring the iPod nano "Brick" game
 *  reference photo: bright highlight at the top, saturated body, darker
 *  shadow at the bottom. Rows cycle (red → orange → yellow → green →
 *  blue → purple) so additional rows added at higher levels still pick up
 *  a distinct color. */
const MODERN_BRICK_COLORS: Array<{
  highlight: string;
  body: string;
  shadow: string;
  topGloss: string;
  /** Thin 1-game-unit border drawn on top of the fill to give bricks a
   *  defined edge, matching the subtle outline visible on each brick in
   *  the nano 6G/7G reference photo. */
  border: string;
}> = [
  // red
  { highlight: "#ff8a78", body: "#e34a3a", shadow: "#a0231a", topGloss: "rgba(255,255,255,0.3)", border: "rgba(74,15,8,0.55)" },
  // orange
  { highlight: "#ffb673", body: "#ef892c", shadow: "#a8540f", topGloss: "rgba(255,255,255,0.28)", border: "rgba(85,40,5,0.5)" },
  // yellow
  { highlight: "#ffe572", body: "#ebc935", shadow: "#9c810e", topGloss: "rgba(255,255,255,0.32)", border: "rgba(80,60,5,0.5)" },
  // green
  { highlight: "#a8e879", body: "#5cbf3f", shadow: "#2c761a", topGloss: "rgba(255,255,255,0.28)", border: "rgba(20,55,12,0.55)" },
  // blue
  { highlight: "#7a96ff", body: "#3a5fd6", shadow: "#193a96", topGloss: "rgba(255,255,255,0.28)", border: "rgba(12,25,70,0.6)" },
  // purple
  { highlight: "#9d70ff", body: "#5d3dc4", shadow: "#31197e", topGloss: "rgba(255,255,255,0.28)", border: "rgba(25,10,60,0.6)" },
];

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
  /** Row index from the top (0-based). Used to pick the per-row color in
   *  the modern skin so each row keeps its hue even as bricks fall. */
  row: number;
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
      bricks.push({ x, y, w: brickWidth, h: BRICK_HEIGHT, alive: true, row: r });
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
   *  Modern bar matches `MODERN_TITLEBAR_HEIGHT` in IpodScreen (17px) so the
   *  brick game's chrome lines up pixel-for-pixel with the main menu's
   *  slim nano 6G/7G silver header. */
  const bodyTopOffsetPx = isModernUi ? 17 : 26;
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

    const s = stateRef.current;

    // Bricks
    //
    // Modern (nano 6G/7G) skin: each row gets a three-stop top-to-bottom
    // gradient (highlight → body → shadow) plus a thin gloss strip across
    // the top edge, so bricks read as glossy lozenges matching the
    // reference photo. The brick row is taken from the precomputed
    // `row` field on each brick (set in `makeBricks`) so colors cycle
    // predictably top-down even as bricks are cleared.
    //
    // Classic 1st-gen LCD skin: bricks stay flat #0a3667 to preserve
    // the monochrome aesthetic (no gradients on a 4-shade LCD). */
    for (const b of s.bricks) {
      if (!b.alive) continue;
      if (isModernUi) {
        const color = MODERN_BRICK_COLORS[b.row % MODERN_BRICK_COLORS.length];
        const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        grad.addColorStop(0, color.highlight);
        grad.addColorStop(0.5, color.body);
        grad.addColorStop(1, color.shadow);
        ctx.fillStyle = grad;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        // Soft top gloss: lit band over the upper ~22% of the brick, low
        // alpha so the shine reads as a gentle wash rather than a hard
        // white stripe.
        ctx.fillStyle = color.topGloss;
        ctx.fillRect(b.x, b.y, b.w, Math.max(1, b.h * 0.22));
        // 1-game-unit border traced inside the brick rectangle. Drawn
        // with lineWidth=1 and inset by 0.5 so the stroke sits flush
        // with the brick edge (canvas stroke is centered on the path).
        ctx.strokeStyle = color.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      } else {
        ctx.fillStyle = fg;
        ctx.fillRect(b.x, b.y, b.w, b.h);
      }
    }

    // Paddle
    //
    // Modern skin: 3-stop top-to-bottom gradient with a thin white gloss
    // strip across the upper ~35% — same glossy-lozenge treatment as the
    // bricks but in dark graphite tones so the bar reads as a heavier
    // object than the colored bricks above it. Classic skin keeps the
    // flat #0a3667 LCD fill.
    if (isModernUi) {
      const pGrad = ctx.createLinearGradient(
        0,
        PADDLE_Y,
        0,
        PADDLE_Y + PADDLE_HEIGHT
      );
      pGrad.addColorStop(0, "#5c5c60");
      pGrad.addColorStop(0.5, "#252527");
      pGrad.addColorStop(1, "#0a0a0b");
      ctx.fillStyle = pGrad;
      ctx.fillRect(s.paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillRect(
        s.paddleX,
        PADDLE_Y,
        PADDLE_WIDTH,
        Math.max(1, PADDLE_HEIGHT * 0.35)
      );
    } else {
      ctx.fillStyle = fg;
      ctx.fillRect(s.paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT);
    }

    // Ball
    //
    // Modern skin: radial gradient biased to the upper-left so the ball
    // reads as a small lit sphere — bright white core fades through a
    // mid graphite to a near-black rim. Classic stays a flat 1.5-unit
    // dot in #0a3667. */
    if (isModernUi) {
      const bGrad = ctx.createRadialGradient(
        s.ballX - BALL_RADIUS * 0.4,
        s.ballY - BALL_RADIUS * 0.4,
        BALL_RADIUS * 0.1,
        s.ballX,
        s.ballY,
        BALL_RADIUS
      );
      bGrad.addColorStop(0, "rgba(255,255,255,0.95)");
      bGrad.addColorStop(0.45, "#6e6e72");
      bGrad.addColorStop(1, "#101012");
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(s.ballX, s.ballY, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(s.ballX, s.ballY, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
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
          ? // Sky-blue gradient — darker mid-sky at the top fading to a
            // pale, almost-white blue at the paddle. Overall lighter and
            // softer than a saturated sea, so the colored bricks pop
            // against the contrasting top while the paddle sits on a
            // calm light wash that doesn't compete with the bar's
            // graphite gloss.
            "ipod-modern-screen bg-gradient-to-b from-[#5d97c4] via-[#a4cbe6] to-[#dcecf6]"
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

      {/* Title bar
       *
       * Brick-game-specific layout (matches the nano 6G/7G "Brick" game
       * reference photo): play indicator on the far left, three "life"
       * dots immediately after it, a flex spacer, then score and the
       * battery icon clustered on the right. No centered title — the
       * brick field below stands in for the screen's identity.
       *
       * Modern skin uses the silver titlebar chrome + tinted blue
       * play/pause SVG (same look as the main iPod menu titlebar).
       * Classic skin uses Chicago glyphs over the LCD's #0a3667 chrome,
       * so the dots and battery render in the matching deep blue. */}
      <div
        className={cn(
          "shrink-0 flex items-center z-10 py-0 px-2 tabular-nums gap-1.5",
          isModernUi
            ? "ipod-modern-titlebar font-ipod-modern-ui text-[12px] font-semibold text-black pl-1.5 pr-1.5"
            : "border-b border-[#0a3667] font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
        )}
        style={isModernUi ? { height: 17, minHeight: 17 } : undefined}
      >
        {/* Play/pause indicator. ▶ while a level is actively in motion,
         *  ⏸ for every other phase (ready, paused, lifeLost, won,
         *  gameOver). */}
        {isModernUi ? (
          <div
            className={cn(
              "flex shrink-0 items-center justify-center w-[14px] h-[14px] [transform:translateY(-0.5px)]",
              "[filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))]"
            )}
          >
            <IpodModernPlayPauseIcon
              playing={phase === "playing"}
              size={14}
            />
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center justify-center w-4 h-4 mt-0.5 font-chicago",
              phase === "playing" ? "text-xs" : "text-[18px]"
            )}
          >
            {phase === "playing" ? "▶" : "⏸︎"}
          </div>
        )}

        {/* Life dots — three pips that drain as the player loses lives.
         *  Modern: each filled dot is a tiny glossy sphere using the same
         *  upper-left-biased radial gradient as the brick-game ball
         *  (white core → graphite → near-black rim) so the pips read as
         *  a row of little balls. Empty dots fade to a soft black/15
         *  shadow. Classic stays a flat #0a3667 LCD dot. */}
        <div
          className="flex shrink-0 items-center gap-[3px]"
          aria-label={`${lives} lives remaining`}
        >
          {Array.from({ length: STARTING_LIVES }, (_, i) => {
            const filled = i < lives;
            if (isModernUi) {
              return (
                <span
                  key={i}
                  className="block size-[6px] rounded-full"
                  style={
                    filled
                      ? {
                          background:
                            "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95) 0%, #6e6e72 45%, #101012 100%)",
                        }
                      : { backgroundColor: "rgba(0,0,0,0.15)" }
                  }
                />
              );
            }
            return (
              <span
                key={i}
                className={cn(
                  "block size-[5px] rounded-full",
                  filled
                    ? "bg-[#0a3667]"
                    : "bg-transparent border border-[#0a3667]/50"
                )}
              />
            );
          })}
        </div>

        <div className="flex-1" aria-hidden />

        {/* Score + battery clustered on the right, mirroring the photo. */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-1",
            isModernUi ? "text-[12px] font-semibold text-black" : "text-xs"
          )}
        >
          <span
            className={cn(
              "tabular-nums leading-none",
              isModernUi && "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]"
            )}
          >
            {score}
          </span>
          <BatteryIndicator
            backlightOn={backlightOn}
            variant={isModernUi ? "modern" : "classic"}
          />
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
