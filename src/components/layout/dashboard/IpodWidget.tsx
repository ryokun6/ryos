import { useRef, useEffect, useState, useCallback } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useAppStore } from "@/stores/useAppStore";
import { useDashboardStore, type IpodWidgetConfig } from "@/stores/useDashboardStore";
import { requestAppLaunch } from "@/utils/appEventBus";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  RepeatOnce,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { isWindowsTheme } from "@/themes";

interface IpodWidgetProps {
  widgetId?: string;
}

function MarqueeText({ text, color, fontWeight = 600 }: { text: string; color: string; fontWeight?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const textEl = textRef.current;
    if (!container || !textEl) return;
    setShouldScroll(textEl.scrollWidth > container.clientWidth);
  }, [text]);

  return (
    <div
      ref={containerRef}
      className="overflow-hidden whitespace-nowrap"
      style={{ width: "100%", position: "relative", textAlign: shouldScroll ? "left" : "center" }}
    >
      <span
        ref={textRef}
        className={shouldScroll ? "ipod-marquee" : ""}
        style={{
          display: "inline-block",
          paddingRight: shouldScroll ? "3em" : 0,
          fontSize: 11,
          fontWeight,
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          color,
        }}
      >
        {text}
      </span>
    </div>
  );
}

const WHEEL_SIZE = 104;

function ClickWheel({
  onPrev,
  onNext,
  onPlayPause,
  isPlaying,
}: {
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  isPlaying: boolean;
}) {
  const { t } = useTranslation();
  const centerSize = 46;
  const iconColor = "#aaa";

  return (
    <div
      style={{
        position: "relative",
        width: WHEEL_SIZE,
        height: WHEEL_SIZE,
        flexShrink: 0,
      }}
    >
      {/* Outer wheel */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: "linear-gradient(180deg, #f8f8f8 0%, #eee 100%)",
          border: "1px solid rgba(0,0,0,0.2)",
          boxShadow: "inset 0 2px 3px rgba(0,0,0,0.08), inset 0 -1px 2px rgba(255,255,255,0.6)",
        }}
      />

      {/* Center button */}
      <button
        type="button"
        onClick={onPlayPause}
        title={isPlaying ? t("apps.dashboard.ipod.pause", "Pause") : t("apps.dashboard.ipod.play", "Play")}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: centerSize,
          height: centerSize,
          borderRadius: "50%",
          background: "linear-gradient(180deg, #fff 0%, #f0f0f0 100%)",
          border: "1px solid rgba(0,0,0,0.15)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          cursor: "pointer",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isPlaying ? (
          <Pause size={20} weight="fill" color="#aaa" />
        ) : (
          <Play size={20} weight="fill" color="#aaa" style={{ marginLeft: 1 }} />
        )}
      </button>

      {/* Prev (left) */}
      <button
        type="button"
        onClick={onPrev}
        title={t("apps.dashboard.ipod.previous", "Previous")}
        style={{
          position: "absolute",
          top: "50%",
          left: 2,
          transform: "translateY(-50%)",
          width: 26,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          zIndex: 2,
        }}
      >
        <SkipBack size={10} weight="fill" color={iconColor} />
      </button>

      {/* Next (right) */}
      <button
        type="button"
        onClick={onNext}
        title={t("apps.dashboard.ipod.next", "Next")}
        style={{
          position: "absolute",
          top: "50%",
          right: 2,
          transform: "translateY(-50%)",
          width: 26,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          zIndex: 2,
        }}
      >
        <SkipForward size={10} weight="fill" color={iconColor} />
      </button>
    </div>
  );
}

export function IpodWidget({ widgetId }: IpodWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = isWindowsTheme(currentTheme);

  const widget = useDashboardStore((s) => widgetId ? s.widgets.find((w) => w.id === widgetId) : undefined);
  const controlMode = (widget?.config as IpodWidgetConfig | undefined)?.controlMode ?? "ipod";
  const isKaraoke = controlMode === "karaoke";

  const ipodGetCurrentTrack = useIpodStore((s) => s.getCurrentTrack);
  const ipodIsPlaying = useIpodStore((s) => s.isPlaying);
  const ipodTogglePlay = useIpodStore((s) => s.togglePlay);
  const ipodNextTrack = useIpodStore((s) => s.nextTrack);
  const ipodPreviousTrack = useIpodStore((s) => s.previousTrack);
  const ipodIsShuffled = useIpodStore((s) => s.isShuffled);
  const ipodToggleShuffle = useIpodStore((s) => s.toggleShuffle);
  const ipodLoopCurrent = useIpodStore((s) => s.loopCurrent);
  const ipodLoopAll = useIpodStore((s) => s.loopAll);
  const ipodToggleLoopCurrent = useIpodStore((s) => s.toggleLoopCurrent);
  const ipodElapsedTime = useIpodStore((s) => s.elapsedTime);
  const ipodTotalTime = useIpodStore((s) => s.totalTime);

  const karaokeGetCurrentTrack = useKaraokeStore((s) => s.getCurrentTrack);
  const karaokeIsPlaying = useKaraokeStore((s) => s.isPlaying);
  const karaokeTogglePlay = useKaraokeStore((s) => s.togglePlay);
  const karaokeNextTrack = useKaraokeStore((s) => s.nextTrack);
  const karaokePreviousTrack = useKaraokeStore((s) => s.previousTrack);
  const karaokeIsShuffled = useKaraokeStore((s) => s.isShuffled);
  const karaokeToggleShuffle = useKaraokeStore((s) => s.toggleShuffle);
  const karaokeLoopCurrent = useKaraokeStore((s) => s.loopCurrent);
  const karaokeLoopAll = useKaraokeStore((s) => s.loopAll);
  const karaokeToggleLoopCurrent = useKaraokeStore((s) => s.toggleLoopCurrent);
  const karaokeElapsedTime = useKaraokeStore((s) => s.elapsedTime);
  const karaokeTotalTime = useKaraokeStore((s) => s.totalTime);

  const getCurrentTrack = isKaraoke ? karaokeGetCurrentTrack : ipodGetCurrentTrack;
  const isPlaying = isKaraoke ? karaokeIsPlaying : ipodIsPlaying;
  const togglePlay = isKaraoke ? karaokeTogglePlay : ipodTogglePlay;
  const nextTrack = isKaraoke ? karaokeNextTrack : ipodNextTrack;
  const previousTrack = isKaraoke ? karaokePreviousTrack : ipodPreviousTrack;
  const isShuffled = isKaraoke ? karaokeIsShuffled : ipodIsShuffled;
  const toggleShuffle = isKaraoke ? karaokeToggleShuffle : ipodToggleShuffle;
  const loopCurrent = isKaraoke ? karaokeLoopCurrent : ipodLoopCurrent;
  const loopAll = isKaraoke ? karaokeLoopAll : ipodLoopAll;
  const toggleLoopCurrent = isKaraoke ? karaokeToggleLoopCurrent : ipodToggleLoopCurrent;
  const elapsedTime = isKaraoke ? karaokeElapsedTime : ipodElapsedTime;
  const totalTime = isKaraoke ? karaokeTotalTime : ipodTotalTime;

  const targetAppId = isKaraoke ? "karaoke" : "ipod";
  const isTargetAppOpen = useAppStore(
    (s) => Object.values(s.instances).some((inst) => inst.appId === targetAppId && inst.isOpen)
  );

  const track = getCurrentTrack();
  const title = track?.title || (isKaraoke ? "Karaoke" : "iPod");
  const artist = track?.artist || "";
  const hasTrack = !!track;

  const launchOrDo = useCallback(
    (action: () => void) => {
      if (!isTargetAppOpen) {
        requestAppLaunch({ appId: targetAppId });
        return;
      }
      action();
    },
    [isTargetAppOpen, targetAppId]
  );

  const handlePlayPause = useCallback(() => launchOrDo(togglePlay), [launchOrDo, togglePlay]);
  const handlePrev = useCallback(() => launchOrDo(previousTrack), [launchOrDo, previousTrack]);
  const handleNext = useCallback(() => launchOrDo(nextTrack), [launchOrDo, nextTrack]);
  const handleShufflePress = useCallback(() => launchOrDo(toggleShuffle), [launchOrDo, toggleShuffle]);

  const handleToggleRepeat = useCallback(() => {
    launchOrDo(toggleLoopCurrent);
  }, [launchOrDo, toggleLoopCurrent]);

  const RepeatIcon = loopCurrent ? RepeatOnce : Repeat;
  const repeatActive = loopCurrent || loopAll;

  const shuffleColor = isShuffled ? "#1a3a00" : "#5a7a20";
  const repeatColor = repeatActive ? "#1a3a00" : "#5a7a20";

  const displayHeight = WHEEL_SIZE;
  const displayRadius = displayHeight / 2;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        height: "100%",
        minHeight: 125,
        background: isXpTheme
          ? "linear-gradient(180deg, #e4e4e4 0%, #d4d4d4 30%, #c8c8c8 60%, #d4d4d4 100%)"
          : "linear-gradient(180deg, #e2e2e2 0%, #d6d6d6 12%, #cccccc 28%, #c0c0c0 45%, #b8b8b8 55%, #c0c0c0 68%, #cccccc 82%, #d6d6d6 100%)",
        borderRadius: "inherit",
        padding: "0 10px 0 8px",
        gap: 6,
        userSelect: "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Brushed metal shimmer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(90deg, rgba(255,255,255,0.01) 0%, rgba(255,255,255,0.06) 12%, transparent 28%, rgba(255,255,255,0.04) 48%, transparent 65%, rgba(255,255,255,0.05) 82%, rgba(255,255,255,0.01) 100%)",
          pointerEvents: "none",
          borderRadius: "inherit",
        }}
      />
      {/* Top highlight shine */}
      <div
        style={{
          position: "absolute",
          top: 2,
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100% - 6px)",
          height: "35%",
          maxHeight: 50,
          borderRadius: "9999px 9999px 50% 50%",
          background: "linear-gradient(rgba(255,255,255,0.7), rgba(255,255,255,0))",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />
      {/* Bottom subtle glow */}
      <div
        style={{
          position: "absolute",
          bottom: 2,
          left: "50%",
          transform: "translateX(-50%)",
          width: "calc(100% - 10px)",
          height: "20%",
          maxHeight: 30,
          borderRadius: "50% 50% 9999px 9999px",
          background: "linear-gradient(rgba(255,255,255,0), rgba(255,255,255,0.25))",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Left: Click Wheel */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        <ClickWheel
          onPrev={handlePrev}
          onNext={handleNext}
          onPlayPause={handlePlayPause}
          isPlaying={isPlaying}
        />
      </div>

      {/* Right: Fully green LCD pill — same height as wheel */}
      <div
        style={{
          flex: 1,
          height: displayHeight,
          minWidth: 0,
          borderRadius: displayRadius,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 1,
          background:
            "linear-gradient(180deg, #d6ec82 0%, #c4e050 15%, #b0d63c 35%, #a0cc2c 55%, #94c420 75%, #8cbc18 100%)",
          border: "1px solid #6a8a14",
          boxShadow: [
            "inset 0 4px 6px rgba(0,0,0,0.3)",
            "inset 0 1px 1px rgba(0,0,0,0.2)",
            "inset 0 -3px 6px rgba(255,255,255,0.25)",
            "inset 0 -1px 1px rgba(255,255,255,0.4)",
            "0 1px 0 rgba(255,255,255,0.5)",
          ].join(", "),
        }}
      >
        {/* Upper area: Track info text */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            alignItems: "center",
            padding: "0 18px 4px",
            textAlign: "center",
          }}
        >
          {hasTrack ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%", lineHeight: 1.2 }}>
              <MarqueeText text={title} color="#1a3300" />
              {artist && (
                <MarqueeText text={artist} color="#3a5a10" fontWeight={400} />
              )}
            </div>
          ) : (
            <div
              style={{
                fontSize: 11,
                fontWeight: 500,
                fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                color: "#2a4a00",
                textAlign: "center",
              }}
            >
              {isKaraoke
                ? t("apps.dashboard.ipod.karaokeNotOpen", "Karaoke is not open")
                : t("apps.dashboard.ipod.iTunesNotOpen", "iTunes is not open")}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {hasTrack && (
          <div
            style={{
              height: 3,
              margin: "0 18px",
              background: "rgba(0,0,0,0.10)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${totalTime > 0 ? (elapsedTime / totalTime) * 100 : 0}%`,
                background: "#2a4a00",
                borderRadius: 2,
                transition: "width 0.3s linear",
              }}
            />
          </div>
        )}
        {!hasTrack && (
          <div
            style={{
              height: 1,
              margin: "0 14px",
              background: "rgba(0,0,0,0.08)",
              boxShadow: "0 1px 0 rgba(255,255,255,0.12)",
            }}
          />
        )}

        {/* Lower area: Shuffle / Time / Repeat */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 26px",
          }}
        >
          <button
            type="button"
            onClick={handleShufflePress}
            title={t("apps.dashboard.ipod.shuffle", "Shuffle")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 2,
              display: "flex",
              alignItems: "center",
              color: shuffleColor,
              opacity: isShuffled ? 1 : 0.6,
            }}
          >
            <Shuffle size={14} weight="bold" />
          </button>

          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
              color: "#2a4a00",
              letterSpacing: "0.5px",
            }}
          >
            {hasTrack
              ? `${Math.floor(elapsedTime / 60)}:${String(Math.floor(elapsedTime % 60)).padStart(2, "0")}`
              : "0:00"}
          </span>

          <button
            type="button"
            onClick={handleToggleRepeat}
            title={loopCurrent ? t("apps.dashboard.ipod.repeatOne", "Repeat One") : t("apps.dashboard.ipod.repeatAll", "Repeat All")}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 2,
              display: "flex",
              alignItems: "center",
              color: repeatColor,
              opacity: repeatActive ? 1 : 0.6,
            }}
          >
            <RepeatIcon size={14} weight="bold" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes ipod-marquee-scroll {
          0%, 15% { transform: translateX(0); }
          85%, 100% { transform: translateX(-50%); }
        }
        .ipod-marquee {
          animation: ipod-marquee-scroll 8s linear infinite;
        }
      `}</style>
    </div>
  );
}

export function IpodBackPanel({
  widgetId,
  onDone,
}: {
  widgetId: string;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = isWindowsTheme(currentTheme);
  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const config = widget?.config as IpodWidgetConfig | undefined;
  const controlMode = config?.controlMode ?? "ipod";

  const handleModeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const mode = e.target.value as "ipod" | "karaoke";
      updateWidgetConfig(widgetId, { ...config, controlMode: mode });
    },
    [widgetId, config, updateWidgetConfig]
  );

  const handleOpenApp = useCallback(() => {
    requestAppLaunch({ appId: controlMode === "karaoke" ? "karaoke" : "ipod" });
    onDone?.();
  }, [onDone, controlMode]);

  const linkColor = isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)";

  return (
    <div
      className="flex flex-col items-center justify-center px-6 py-2"
      style={{ gap: 6, flex: 1 }}
    >
      <div className="flex items-center" style={{ gap: 6 }}>
        <label
          style={{ fontSize: 11, fontWeight: 600, color: textColor, whiteSpace: "nowrap" }}
        >
          {t("apps.dashboard.ipod.controlLabel", "Controls")}
        </label>
        <select
          value={controlMode}
          onChange={handleModeChange}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            fontSize: 11,
            fontWeight: 500,
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            padding: "2px 4px",
            borderRadius: isXpTheme ? 2 : 6,
            border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.2)",
            background: isXpTheme ? "#fff" : "rgba(255,255,255,0.1)",
            color: textColor,
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="ipod" style={{ color: "#000" }}>
            {t("apps.dashboard.ipod.modeIpod", "iPod")}
          </option>
          <option value="karaoke" style={{ color: "#000" }}>
            {t("apps.dashboard.ipod.modeKaraoke", "Karaoke")}
          </option>
        </select>
      </div>

      <button
        type="button"
        onClick={handleOpenApp}
        className="text-[11px] font-medium transition-opacity hover:opacity-80"
        style={{
          color: linkColor,
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
      >
        {controlMode === "karaoke"
          ? t("apps.dashboard.ipod.openKaraoke", "Open Karaoke App")
          : t("apps.dashboard.ipod.openIpod", "Open iPod App")}
      </button>

      <button
        type="button"
        data-flip-btn
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDone?.(); }}
        className="font-bold"
        style={{
          fontSize: 12,
          padding: "2px 10px",
          cursor: "pointer",
          color: linkColor,
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          background: "transparent",
          border: "none",
        }}
      >
        {t("common.dialog.done", "Done")}
      </button>
    </div>
  );
}
