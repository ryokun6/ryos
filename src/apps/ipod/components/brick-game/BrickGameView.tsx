import { cn } from "@/lib/utils";
import { BrickGameTitleBar } from "./BrickGameTitleBar";
import type { BrickGameViewModel } from "./useBrickGame";

export function BrickGameView({
  t,
  isModernUi,
  bodyTopOffsetPx,
  canvasRef,
  score,
  lives,
  phase,
  isResultsScreen,
  pauseOverlay,
  lcdFilterOn,
  backlightOn,
}: BrickGameViewModel) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex h-full max-h-full flex-col overflow-hidden select-none",
        !isModernUi && "font-chicago",
        isModernUi ? "font-ipod-modern-ui" : "",
        "border border-black border-2 rounded-[2px]",
        lcdFilterOn && !isModernUi ? "lcd-screen" : "",
        isModernUi
          ? cn("ipod-modern-screen bg-gradient-to-b from-[#5d97c4] via-[#a4cbe6] to-[#dcecf6]", !backlightOn && "ipod-modern-backlight-off")
          : backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        lcdFilterOn && backlightOn && !isModernUi && "shadow-[0_0_10px_2px_rgba(197,224,245,0.05)]"
      )}
    >
      {lcdFilterOn && !isModernUi && <div className="absolute inset-0 pointer-events-none z-[25] lcd-scan-lines" />}
      {lcdFilterOn && !isModernUi && <div className="absolute inset-0 pointer-events-none z-[25] lcd-reflection" />}
      <BrickGameTitleBar isModernUi={isModernUi} phase={phase} lives={lives} score={score} backlightOn={backlightOn} />
      <div className="relative z-30 w-full min-h-0 overflow-hidden" style={{ height: `calc(100% - ${bodyTopOffsetPx}px)` }}>
        {isResultsScreen ? (
          <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center", isModernUi ? "font-ipod-modern-ui" : "font-chicago text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]")}>
            <span className={cn("tabular-nums leading-4 text-[16px]", isModernUi ? "font-semibold text-black" : "")}>{score} {t("apps.ipod.brickGame.pts")}</span>
            <span className={cn("leading-4 text-[14px]", isModernUi ? "font-normal text-[rgb(99,101,103)]" : "")}>
              {phase === "won" ? t("apps.ipod.brickGame.youWin") : t("apps.ipod.brickGame.gameOverTitle")}
            </span>
            <div className={cn("flex flex-col leading-4 opacity-85 text-[14px]", isModernUi ? "font-normal text-[rgb(99,101,103)]" : "")}>
              <span>{t("apps.ipod.brickGame.pressCenterToReplay")}</span>
              <span>{t("apps.ipod.brickGame.menuToExit")}</span>
            </div>
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} className="block size-full max-h-full max-w-full" style={{ imageRendering: "pixelated" }} aria-label={t("apps.ipod.brickGame.title")} />
            {pauseOverlay && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center" aria-live="polite">
                <div className={cn("rounded-[2px] border px-2 py-0.5 text-center whitespace-nowrap text-[11px] leading-tight", isModernUi ? "border-[rgb(200,200,205)] bg-white/90 font-ipod-modern-ui font-semibold text-black" : "border-[#0a3667] bg-[#c5e0f5]/85 font-chicago text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]")}>
                  {pauseOverlay}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
