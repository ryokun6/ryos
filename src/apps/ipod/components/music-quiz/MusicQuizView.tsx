import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppleMusicPlayerBridge } from "../AppleMusicPlayerBridge";
import { MenuListItem } from "../screen";
import {
  IPOD_MODERN_SCREEN_HEIGHT_PX,
  IPOD_MODERN_TITLEBAR_HEIGHT_PX,
} from "../../constants";
import {
  MAX_GAME_SCORE,
  SNIPPET_DURATION_MS,
  TOTAL_ROUNDS,
} from "./constants";
import { SnippetProgressBar } from "./SnippetProgressBar";
import { formatOption, scoreMessageKey } from "./utils";
import type { MusicQuizViewModel } from "./useMusicQuiz";

type MusicQuizViewProps = MusicQuizViewModel & {
  lcdFilterOn: boolean;
  backlightOn: boolean;
};

export function MusicQuizView({
  t,
  isModernUi,
  bodyTopOffsetPx,
  finalVolume,
  phase,
  round,
  roundNumber,
  score,
  lastRoundPoints,
  selectedIndex,
  isPlayerReady,
  hasEnoughTracks,
  correctTrack,
  isAppleMusicRound,
  headerTitle,
  youtubePlayerRef,
  appleMusicPlayerRef,
  setSelectedIndex,
  handleAnswer,
  unlockAndStart,
  handleReady,
  handlePlay,
  handleDuration,
  playClick,
  vibrate,
  lcdFilterOn,
  backlightOn,
}: MusicQuizViewProps) {
  const correctTrackUrl = correctTrack?.url;

  return (
    <div
      className={cn(
        "relative z-50 flex h-full w-full flex-col overflow-hidden select-none",
        !isModernUi && "font-chicago",
        isModernUi ? "font-ipod-modern-ui" : "",
        "border border-black border-2 rounded-[2px]",
        lcdFilterOn && !isModernUi ? "lcd-screen" : "",
        isModernUi
          ? cn(
              "ipod-modern-screen bg-white",
              !backlightOn && "ipod-modern-backlight-off"
            )
          : backlightOn
          ? "bg-[#c5e0f5] bg-gradient-to-b from-[#d1e8fa] to-[#e0f0fc]"
          : "bg-[#8a9da9] contrast-65 saturate-50",
        lcdFilterOn &&
          backlightOn &&
          !isModernUi &&
          "shadow-[0_0_10px_2px_rgba(197,224,245,0.05)]"
      )}
      style={{
        minHeight: isModernUi ? IPOD_MODERN_SCREEN_HEIGHT_PX : undefined,
      }}
    >
      {lcdFilterOn && !isModernUi && (
        <div className="absolute inset-0 pointer-events-none z-[25] lcd-scan-lines" />
      )}
      {lcdFilterOn && !isModernUi && (
        <div className="absolute inset-0 pointer-events-none z-[25] lcd-reflection" />
      )}

      <div
        className={cn(
          "shrink-0 flex items-center sticky top-0 z-10 py-0 px-2 tabular-nums",
          isModernUi
            ? "ipod-modern-titlebar font-ipod-modern-ui text-[12px] font-semibold text-black"
            : "border-b border-[#0a3667] font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
        )}
        style={
          isModernUi
            ? {
                height: IPOD_MODERN_TITLEBAR_HEIGHT_PX,
                minHeight: IPOD_MODERN_TITLEBAR_HEIGHT_PX,
              }
            : undefined
        }
      >
        <div
          className={cn(
            "flex w-6 items-center justify-start",
            isModernUi ? "font-semibold text-[12px] text-black/80" : "text-xs"
          )}
        >
          {phase !== "finished" && hasEnoughTracks && (
            <span>
              {Math.min(roundNumber, TOTAL_ROUNDS)}/{TOTAL_ROUNDS}
            </span>
          )}
        </div>
        <div
          className={cn(
            "flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-center",
            isModernUi && "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]"
          )}
        >
          {headerTitle}
        </div>
        <div
          className={cn(
            "flex w-6 items-center justify-end",
            isModernUi ? "font-semibold text-[12px] text-black/80" : "text-xs"
          )}
        >
          {phase !== "finished" && hasEnoughTracks && <span>{score}</span>}
        </div>
      </div>

      <div
        className="relative overflow-hidden z-30"
        style={{ height: `calc(100% - ${bodyTopOffsetPx}px)` }}
      >
        {!hasEnoughTracks ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center px-3 text-center",
              isModernUi
                ? "text-[rgb(99,101,103)] font-ipod-modern-ui font-normal text-[14px]"
                : "font-chicago text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
            )}
          >
            <p className={cn(!isModernUi && "text-[14px]")}>
              {t("apps.ipod.musicQuiz.notEnoughTracks")}
            </p>
          </div>
        ) : phase === "finished" ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center",
              isModernUi
                ? "font-ipod-modern-ui"
                : "font-chicago text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
            )}
          >
            <span
              className={cn(
                "tabular-nums leading-4 text-[16px]",
                isModernUi ? "font-semibold text-black" : ""
              )}
            >
              {score}/{MAX_GAME_SCORE}
            </span>
            <span
              className={cn(
                "leading-4 text-[14px]",
                isModernUi ? "font-normal text-[rgb(99,101,103)]" : ""
              )}
            >
              {t(scoreMessageKey(score, MAX_GAME_SCORE))}
            </span>
            <div
              className={cn(
                "flex flex-col leading-4 opacity-85 text-[14px]",
                isModernUi ? "font-normal text-[rgb(99,101,103)]" : ""
              )}
            >
              <span>{t("apps.ipod.musicQuiz.pressCenterToReplay")}</span>
              <span>{t("apps.ipod.musicQuiz.menuToExit")}</span>
            </div>
          </div>
        ) : phase === "loading" || phase === "starting" ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center px-3 text-center",
              isModernUi
                ? "font-ipod-modern-ui font-normal text-[14px] text-[rgb(99,101,103)]"
                : "font-chicago text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
            )}
          >
            <div className="animate-pulse">
              {t("apps.ipod.musicQuiz.loading")}
            </div>
          </div>
        ) : phase === "awaitingStart" ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-3 text-center",
              isModernUi
                ? "font-ipod-modern-ui text-[rgb(99,101,103)]"
                : "font-chicago text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]",
              isPlayerReady ? "cursor-pointer" : ""
            )}
            onClick={() => {
              if (!isPlayerReady) return;
              playClick?.();
              vibrate?.();
              unlockAndStart();
            }}
          >
            {isPlayerReady ? (
              <div
                className={cn(
                  "text-[14px] leading-4",
                  isModernUi ? "font-normal" : "font-chicago"
                )}
              >
                {t("apps.ipod.musicQuiz.pressCenterToStart")}
              </div>
            ) : (
              <div
                className={cn(
                  "text-[14px] animate-pulse",
                  isModernUi && "font-normal"
                )}
              >
                {t("apps.ipod.musicQuiz.loading")}
              </div>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col">
            <div
              className={cn(
                "border-b px-2 py-px",
                isModernUi
                  ? "border-[rgb(229,229,234)] text-black"
                  : "border-[#0a3667] font-chicago text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
              )}
            >
              <div className="flex h-5 w-full items-center justify-center">
                {phase === "feedback" ? (
                  <div
                    className={cn(
                      "block w-full overflow-x-clip overflow-y-visible text-ellipsis whitespace-nowrap text-center",
                      isModernUi
                        ? "font-ipod-modern-ui font-semibold text-[15px] leading-normal text-black"
                        : "font-chicago text-[16px] leading-4 text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
                    )}
                  >
                    {round?.isCorrect
                      ? t("apps.ipod.musicQuiz.correctWithPoints", {
                          points: lastRoundPoints,
                        })
                      : round?.selectedIndex == null
                        ? t("apps.ipod.musicQuiz.timesUp")
                        : t("apps.ipod.musicQuiz.wrong")}
                  </div>
                ) : (
                  <SnippetProgressBar
                    key={`${roundNumber}-playing`}
                    durationMs={SNIPPET_DURATION_MS}
                    running={phase === "playing"}
                    isModernUi={isModernUi}
                  />
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden ipod-menu-container">
              {round?.options.map((option, idx) => {
                const isSelected = idx === selectedIndex;
                const isCorrectOption =
                  phase === "feedback" && idx === round.correctIndex;
                const isWrongPicked =
                  phase === "feedback" &&
                  round.selectedIndex === idx &&
                  idx !== round.correctIndex;
                return (
                  <div
                    key={option.id}
                    className={cn(
                      "ipod-menu-item h-6",
                      isSelected ? "selected" : "",
                      isCorrectOption && "bg-[#1c8a3a]/30",
                      isWrongPicked && "bg-[#a83232]/30"
                    )}
                  >
                    <MenuListItem
                      text={formatOption(option)}
                      isSelected={isSelected}
                      backlightOn={backlightOn}
                      variant={isModernUi ? "modern" : "classic"}
                      onClick={() => {
                        if (phase === "playing") {
                          setSelectedIndex(idx);
                          handleAnswer(idx);
                        }
                      }}
                      showChevron={false}
                      value={
                        isCorrectOption ? "✓" : isWrongPicked ? "✗" : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {isAppleMusicRound && correctTrack && phase !== "idle" ? (
        <AppleMusicPlayerBridge
          ref={appleMusicPlayerRef}
          currentTrack={correctTrack}
          playing={phase === "playing" || phase === "starting"}
          resumeAtSeconds={round?.startSec ?? 0}
          volume={finalVolume}
          onReady={handleReady}
          onPlay={handlePlay}
          onDuration={handleDuration}
        />
      ) : (
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{ visibility: "hidden" }}
          aria-hidden
        >
          {correctTrackUrl && phase !== "idle" && (
            <ReactPlayer
              ref={youtubePlayerRef}
              url={correctTrackUrl}
              playing={phase === "playing" || phase === "starting"}
              controls={false}
              volume={finalVolume}
              width="100%"
              height="100%"
              playsinline
              onReady={handleReady}
              onPlay={handlePlay}
              onDuration={handleDuration}
              config={{
                youtube: {
                  playerVars: {
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                    iv_load_policy: 3,
                    fs: 0,
                    disablekb: 1,
                    playsinline: 1,
                    enablejsapi: 1,
                    origin: window.location.origin,
                  },
                  embedOptions: {
                    referrerPolicy: "strict-origin-when-cross-origin",
                  },
                },
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
