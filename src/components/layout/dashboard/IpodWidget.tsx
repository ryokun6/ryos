import { useRef, useEffect, useState, useCallback } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useIpodStore } from "@/stores/useIpodStore";
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

interface IpodWidgetProps {
  widgetId?: string;
}

function MarqueeText({ text, color }: { text: string; color: string }) {
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
          fontWeight: 600,
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
  isXpTheme,
}: {
  onPrev: () => void;
  onNext: () => void;
  onPlayPause: () => void;
  isPlaying: boolean;
  isXpTheme: boolean;
}) {
  const { t } = useTranslation();
  const centerSize = 38;
  const iconColor = "#999";
  const iconColorDark = "#888";

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
          background: isXpTheme
            ? "linear-gradient(160deg, #e4e4e4 0%, #d0d0d0 50%, #c0c0c0 100%)"
            : "radial-gradient(ellipse at 38% 32%, #e6e6e6 0%, #d8d8d8 20%, #c8c8c8 45%, #b4b4b4 70%, #bdbdbd 100%)",
          boxShadow: [
            "0 3px 10px rgba(0,0,0,0.3)",
            "0 1px 3px rgba(0,0,0,0.15)",
            "inset 0 2px 5px rgba(255,255,255,0.65)",
            "inset 0 -2px 4px rgba(0,0,0,0.07)",
          ].join(", "),
          border: "1px solid rgba(0,0,0,0.2)",
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
          background: isXpTheme
            ? "linear-gradient(160deg, #f8f8f8 0%, #e0e0e0 100%)"
            : "radial-gradient(ellipse at 40% 35%, #fafafa 0%, #f0f0f0 35%, #e0e0e0 70%, #d4d4d4 100%)",
          boxShadow: [
            "0 2px 6px rgba(0,0,0,0.2)",
            "inset 0 1px 2px rgba(255,255,255,0.95)",
            "inset 0 -1px 2px rgba(0,0,0,0.06)",
          ].join(", "),
          border: "1px solid rgba(0,0,0,0.14)",
          cursor: "pointer",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isPlaying ? (
          <Pause size={13} weight="fill" color="#666" />
        ) : (
          <Play size={13} weight="fill" color="#666" style={{ marginLeft: 1 }} />
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
        <SkipBack size={10} weight="fill" color={iconColorDark} />
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
        <SkipForward size={10} weight="fill" color={iconColorDark} />
      </button>

      {/* Play/Pause at bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          pointerEvents: "none",
        }}
      >
        <Play size={7} weight="fill" color={iconColor} />
        <span style={{ fontSize: 5, color: iconColor, fontWeight: 700 }}>/</span>
        <Pause size={7} weight="fill" color={iconColor} />
      </div>

      {/* MENU at top */}
      <div
        style={{
          position: "absolute",
          top: 9,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontSize: 7,
            fontWeight: 700,
            fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
            color: iconColor,
            letterSpacing: 0.5,
          }}
        >
          {t("apps.dashboard.ipod.menu", "MENU")}
        </span>
      </div>
    </div>
  );
}

export function IpodWidget({ widgetId: _widgetId }: IpodWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const getCurrentTrack = useIpodStore((s) => s.getCurrentTrack);
  const isPlaying = useIpodStore((s) => s.isPlaying);
  const togglePlay = useIpodStore((s) => s.togglePlay);
  const nextTrack = useIpodStore((s) => s.nextTrack);
  const previousTrack = useIpodStore((s) => s.previousTrack);
  const isShuffled = useIpodStore((s) => s.isShuffled);
  const toggleShuffle = useIpodStore((s) => s.toggleShuffle);
  const loopCurrent = useIpodStore((s) => s.loopCurrent);
  const loopAll = useIpodStore((s) => s.loopAll);
  const toggleLoopCurrent = useIpodStore((s) => s.toggleLoopCurrent);

  const elapsedTime = useIpodStore((s) => s.elapsedTime);
  const track = getCurrentTrack();
  const title = track?.title || "iPod";
  const artist = track?.artist || "";
  const hasTrack = !!track;

  const launchOrDo = useCallback(
    (action: () => void) => {
      if (!hasTrack) {
        requestAppLaunch({ appId: "ipod" });
        return;
      }
      action();
    },
    [hasTrack]
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
          isXpTheme={isXpTheme}
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
            "inset 0 3px 8px rgba(0,0,0,0.22)",
            "inset 0 1px 2px rgba(0,0,0,0.15)",
            "inset 0 -2px 4px rgba(255,255,255,0.10)",
            "0 1px 0 rgba(255,255,255,0.45)",
          ].join(", "),
        }}
      >
        {/* Upper area: Track info text */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "0 18px",
            textAlign: "center",
          }}
        >
          {hasTrack ? (
            <>
              <MarqueeText text={title} color="#1a3300" />
              {artist && (
                <div
                  style={{
                    fontSize: 9,
                    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
                    color: "#3a5a10",
                    marginTop: 1,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    width: "100%",
                    textAlign: "center",
                  }}
                >
                  {artist}
                </div>
              )}
            </>
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
              {t("apps.dashboard.ipod.iTunesNotOpen", "iTunes is not open")}
            </div>
          )}
        </div>

        {/* Subtle divider */}
        <div
          style={{
            height: 1,
            margin: "0 14px",
            background: "rgba(0,0,0,0.08)",
            boxShadow: "0 1px 0 rgba(255,255,255,0.12)",
          }}
        />

        {/* Lower area: Shuffle / Time / Repeat */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
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
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "'SF Mono', 'Monaco', 'Consolas', monospace",
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
  widgetId: _widgetId,
  onDone,
}: {
  widgetId: string;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";

  const handleOpenIpod = useCallback(() => {
    requestAppLaunch({ appId: "ipod" });
    onDone?.();
  }, [onDone]);

  return (
    <div
      className="flex flex-col items-center justify-center px-3 py-3"
      style={{ gap: 8 }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: textColor }}>
        {t("apps.dashboard.widgets.ipod", "iPod")}
      </span>
      <button
        type="button"
        onClick={handleOpenIpod}
        className="text-[11px] font-medium transition-opacity hover:opacity-80"
        style={{
          color: isXpTheme ? "#0066CC" : "rgba(130,180,255,0.9)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {t("apps.dashboard.ipod.openIpod", "Open iPod App")}
      </button>
    </div>
  );
}
