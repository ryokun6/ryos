import { useEffect, useRef, useState, useImperativeHandle, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useIpodStore } from "@/stores/useIpodStore";
import {
  IPOD_MODERN_TITLEBAR_HEIGHT_PX,
  isModernIpodUiVariant,
} from "../../constants";
import {
  BALL_RADIUS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PADDLE_HEIGHT,
  PADDLE_SMOOTH_SPEED,
  PADDLE_WIDTH,
  PADDLE_Y,
  STARTING_LIVES,
  WHEEL_TICK_PIXELS,
} from "./constants";
import { drawBrickGame } from "./drawGame";
import { initialState, launchBall, makeBricks } from "./gameState";
import type { Brick, BrickGameProps, BrickGameRef, GameState, Phase } from "./types";

export function useBrickGame({
  ref,
  isVisible,
  lcdFilterOn = false,
  backlightOn = true,
  onEnter,
  playClick,
  vibrate,
}: BrickGameProps & { ref?: React.Ref<BrickGameRef> }) {
  const { t } = useTranslation();
  const uiVariant = useIpodStore((s) => s.uiVariant ?? "modern");
  const isModernUi = isModernIpodUiVariant(uiVariant);
  const bodyTopOffsetPx = isModernUi ? IPOD_MODERN_TITLEBAR_HEIGHT_PX : 26;
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
    if (Math.abs(dx) < 0.02) s.paddleX = target;
    else {
      const step = PADDLE_SMOOTH_SPEED * dt;
      s.paddleX += Math.max(-step, Math.min(step, dx));
    }
    const p = phaseRef.current;
    if (p === "ready" || p === "lifeLost") s.ballX = s.paddleX + PADDLE_WIDTH / 2;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawBrickGame(ctx, canvas, stateRef.current, isModernUi);
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
      s.ballX += s.ballVX * dt;
      s.ballY += s.ballVY * dt;
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
      if (
        s.ballVY > 0 &&
        s.ballY + BALL_RADIUS >= PADDLE_Y &&
        s.ballY + BALL_RADIUS <= PADDLE_Y + PADDLE_HEIGHT + 2 &&
        s.ballX >= s.paddleX - BALL_RADIUS &&
        s.ballX <= s.paddleX + PADDLE_WIDTH + BALL_RADIUS
      ) {
        s.ballY = PADDLE_Y - BALL_RADIUS;
        const hit = (s.ballX - (s.paddleX + PADDLE_WIDTH / 2)) / (PADDLE_WIDTH / 2);
        const speed = Math.hypot(s.ballVX, s.ballVY);
        const maxAngle = (60 * Math.PI) / 180;
        const angle = Math.max(-maxAngle, Math.min(maxAngle, hit * maxAngle));
        s.ballVX = Math.sin(angle) * speed;
        s.ballVY = -Math.abs(Math.cos(angle) * speed);
      }
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
          const prevX = s.ballX - s.ballVX * dt;
          const prevY = s.ballY - s.ballVY * dt;
          const wasOutsideX = prevX + BALL_RADIUS <= b.x || prevX - BALL_RADIUS >= b.x + b.w;
          const wasOutsideY = prevY + BALL_RADIUS <= b.y || prevY - BALL_RADIUS >= b.y + b.h;
          if (wasOutsideY) s.ballVY = -s.ballVY;
          else if (wasOutsideX) s.ballVX = -s.ballVX;
          else s.ballVY = -s.ballVY;
          syncUI();
          const now = performance.now();
          if (now - lastBrickVibrateRef.current > 120) {
            lastBrickVibrateRef.current = now;
            vibrate?.();
          }
          break;
        }
      }
      if (s.bricks.every((brick: Brick) => !brick.alive)) {
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
      if (s.ballY - BALL_RADIUS > GAME_HEIGHT) {
        s.lives -= 1;
        const cx = GAME_WIDTH / 2 - PADDLE_WIDTH / 2;
        s.paddleX = cx;
        resetPaddleTarget(cx);
        s.ballX = GAME_WIDTH / 2;
        s.ballY = PADDLE_Y - BALL_RADIUS - 1;
        s.ballVX = 0;
        s.ballVY = 0;
        setPhaseBoth(s.lives <= 0 ? "gameOver" : "lifeLost");
        syncUI();
      }
    },
    [setPhaseBoth, syncUI, vibrate, resetPaddleTarget]
  );

  const loop = useCallback(
    (now: number) => {
      const last = lastFrameRef.current ?? now;
      const dt = Math.min(0.05, (now - last) / 1000);
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
    return () => stopLoop();
  }, [isVisible, onEnter, startLoop, stopLoop, setPhaseBoth, syncUI, resetPaddleTarget]);

  useImperativeHandle(
    ref,
    () => ({
      navigate: (direction: "next" | "previous") => {
        if (!isVisible) return false;
        const maxX = GAME_WIDTH - PADDLE_WIDTH;
        const delta = direction === "next" ? WHEEL_TICK_PIXELS : -WHEEL_TICK_PIXELS;
        paddleTargetXRef.current = Math.max(0, Math.min(maxX, paddleTargetXRef.current + delta));
        return true;
      },
      selectCurrent: () => {
        playClick?.();
        vibrate?.();
        const p = phaseRef.current;
        if (p === "ready" || p === "lifeLost") {
          launchBall(stateRef.current);
          setPhaseBoth("playing");
        } else if (p === "playing") setPhaseBoth("paused");
        else if (p === "paused") setPhaseBoth("playing");
        else if (p === "gameOver" || p === "won") {
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

  return {
    t,
    isVisible,
    isModernUi,
    bodyTopOffsetPx,
    canvasRef,
    score,
    lives,
    phase,
    isResultsScreen: phase === "gameOver" || phase === "won",
    pauseOverlay: phase === "paused" ? t("apps.ipod.brickGame.paused") : null,
    lcdFilterOn,
    backlightOn,
  };
}

export type BrickGameViewModel = ReturnType<typeof useBrickGame>;
