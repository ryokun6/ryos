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

interface IpodWidgetProps {
  widgetId?: string;
}

function MarqueeText({ text, isXpTheme }: { text: string; isXpTheme: boolean }) {
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
      style={{ width: "100%", position: "relative" }}
    >
      <span
        ref={textRef}
        className={shouldScroll ? "ipod-marquee" : ""}
        style={{
          display: "inline-block",
          paddingRight: shouldScroll ? "3em" : 0,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: "'SF Mono', 'Monaco', 'Consolas', monospace",
          color: isXpTheme ? "#222" : "#1a3300",
        }}
      >
        {text}
      </span>
    </div>
  );
}

export function IpodWidget({ widgetId: _widgetId }: IpodWidgetProps) {
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

  const track = getCurrentTrack();
  const title = track?.title || "No Track";
  const artist = track?.artist || "";

  const handleToggleRepeat = useCallback(() => {
    toggleLoopCurrent();
  }, [toggleLoopCurrent]);

  const RepeatIcon = loopCurrent ? RepeatOnce : Repeat;
  const repeatActive = loopCurrent || loopAll;

  const btnColor = isXpTheme ? "#333" : "#1a3300";
  const btnActiveColor = isXpTheme ? "#0066CC" : "#4a8c00";
  const btnHoverBg = isXpTheme
    ? "rgba(0,0,0,0.06)"
    : "rgba(0,0,0,0.12)";

  return (
    <div
      className="flex flex-col items-center justify-center select-none"
      style={{
        padding: "8px 10px 6px",
        gap: 4,
        width: "100%",
        minHeight: "inherit",
      }}
    >
      {/* LCD display */}
      <div
        style={{
          width: "100%",
          background: isXpTheme
            ? "linear-gradient(180deg, #b8d86e 0%, #9ec63f 50%, #8ab835 100%)"
            : "linear-gradient(180deg, #b8d86e 0%, #9ec63f 50%, #8ab835 100%)",
          borderRadius: isXpTheme ? 3 : 6,
          padding: "5px 8px 4px",
          border: isXpTheme
            ? "1px solid #7a9a2a"
            : "1px solid rgba(0,0,0,0.25)",
          boxShadow: isXpTheme
            ? "inset 0 1px 2px rgba(0,0,0,0.15)"
            : "inset 0 1px 3px rgba(0,0,0,0.2), 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <MarqueeText text={title} isXpTheme={isXpTheme} />
        {artist && (
          <div
            style={{
              fontSize: 9,
              fontFamily: "'SF Mono', 'Monaco', 'Consolas', monospace",
              color: isXpTheme ? "#4a6a10" : "#3a5a10",
              marginTop: 1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {artist}
          </div>
        )}
      </div>

      {/* Transport controls */}
      <div className="flex items-center justify-center" style={{ gap: 2, marginTop: 2 }}>
        <ControlButton onClick={previousTrack} title="Previous" hoverBg={btnHoverBg} isXpTheme={isXpTheme}>
          <SkipBack size={14} weight="fill" color={btnColor} />
        </ControlButton>

        <button
          type="button"
          onClick={togglePlay}
          title={isPlaying ? "Pause" : "Play"}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: isXpTheme
              ? "linear-gradient(180deg, #f0f0f0, #d8d8d8)"
              : "linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))",
            border: isXpTheme
              ? "1px solid #aaa"
              : "1px solid rgba(255,255,255,0.15)",
            boxShadow: isXpTheme
              ? "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 #fff"
              : "0 1px 3px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            cursor: "pointer",
          }}
        >
          {isPlaying ? (
            <Pause size={15} weight="fill" color={isXpTheme ? "#333" : "rgba(255,255,255,0.85)"} />
          ) : (
            <Play size={15} weight="fill" color={isXpTheme ? "#333" : "rgba(255,255,255,0.85)"} />
          )}
        </button>

        <ControlButton onClick={nextTrack} title="Next" hoverBg={btnHoverBg} isXpTheme={isXpTheme}>
          <SkipForward size={14} weight="fill" color={btnColor} />
        </ControlButton>
      </div>

      {/* Shuffle / Repeat row */}
      <div className="flex items-center justify-center" style={{ gap: 6 }}>
        <ToggleButton
          active={isShuffled}
          onClick={toggleShuffle}
          title="Shuffle"
          activeColor={btnActiveColor}
          inactiveColor={isXpTheme ? "#999" : "rgba(255,255,255,0.3)"}
        >
          <Shuffle size={11} weight="bold" />
        </ToggleButton>

        <ToggleButton
          active={repeatActive}
          onClick={handleToggleRepeat}
          title={loopCurrent ? "Repeat One" : "Repeat All"}
          activeColor={btnActiveColor}
          inactiveColor={isXpTheme ? "#999" : "rgba(255,255,255,0.3)"}
        >
          <RepeatIcon size={11} weight="bold" />
        </ToggleButton>
      </div>

      {/* Inline marquee keyframes */}
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

function ControlButton({
  onClick,
  title,
  hoverBg,
  isXpTheme,
  children,
}: {
  onClick: () => void;
  title: string;
  hoverBg: string;
  isXpTheme: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-center justify-center transition-colors"
      style={{
        width: 26,
        height: 26,
        borderRadius: isXpTheme ? 3 : 6,
        background: hovered ? hoverBg : "transparent",
        border: "none",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  active,
  onClick,
  title,
  activeColor,
  inactiveColor,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  activeColor: string;
  inactiveColor: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center justify-center transition-colors"
      style={{
        color: active ? activeColor : inactiveColor,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: 2,
      }}
    >
      {children}
    </button>
  );
}

export function IpodBackPanel({
  widgetId: _widgetId,
  onDone,
}: {
  widgetId: string;
  onDone?: () => void;
}) {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.8)";

  const handleOpenIpod = useCallback(() => {
    requestAppLaunch({ appId: "ipod" });
    onDone?.();
  }, [onDone]);

  return (
    <div className="flex flex-col items-center justify-center px-3 py-3" style={{ gap: 8 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: textColor }}>iPod</span>
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
        Open iPod App
      </button>
    </div>
  );
}
