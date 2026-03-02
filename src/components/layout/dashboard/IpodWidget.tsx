import { useCallback } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { Play, Pause, SkipBack, SkipForward } from "@phosphor-icons/react";

export function IpodWidget() {
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const currentTrack = useIpodStore((s) => s.getCurrentTrack());
  const isPlaying = useIpodStore((s) => s.isPlaying);
  const togglePlay = useIpodStore((s) => s.togglePlay);
  const nextTrack = useIpodStore((s) => s.nextTrack);
  const previousTrack = useIpodStore((s) => s.previousTrack);

  const handleToggle = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      togglePlay();
    },
    [togglePlay]
  );

  const handlePrev = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      previousTrack();
    },
    [previousTrack]
  );

  const handleNext = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      nextTrack();
    },
    [nextTrack]
  );

  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  if (isXpTheme) {
    return (
      <div className="flex flex-col items-center p-3 gap-2" style={{ fontFamily: font }}>
        {/* Track display */}
        <div
          className="w-full rounded px-2 py-1.5 text-center"
          style={{
            background: "#C8D882",
            border: "1px solid #A0B060",
            minHeight: 32,
          }}
        >
          <div
            className="text-[10px] font-bold truncate"
            style={{ color: "#333" }}
          >
            {currentTrack?.title || "No Track"}
          </div>
          {currentTrack?.artist && (
            <div className="text-[9px] truncate" style={{ color: "#555" }}>
              {currentTrack.artist}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onPointerDown={handlePrev}
            className="hover:opacity-70 transition-opacity"
            style={{ cursor: "pointer", background: "none", border: "none", color: "#444" }}
          >
            <SkipBack size={16} weight="fill" />
          </button>
          <button
            type="button"
            onPointerDown={handleToggle}
            className="flex items-center justify-center hover:opacity-70 transition-opacity"
            style={{
              cursor: "pointer",
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "#E0E0E0",
              border: "1px solid #BBB",
              color: "#333",
            }}
          >
            {isPlaying ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>
          <button
            type="button"
            onPointerDown={handleNext}
            className="hover:opacity-70 transition-opacity"
            style={{ cursor: "pointer", background: "none", border: "none", color: "#444" }}
          >
            <SkipForward size={16} weight="fill" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center p-3 gap-2"
      style={{
        fontFamily: font,
        borderRadius: "inherit",
        overflow: "hidden",
        minHeight: "inherit",
        background: "linear-gradient(180deg, rgba(80,80,80,0.3) 0%, rgba(40,40,40,0.4) 100%)",
      }}
    >
      {/* LCD-style display */}
      <div
        className="w-full rounded-lg px-2 py-1.5 text-center"
        style={{
          background: "linear-gradient(180deg, #9BBD4A 0%, #8AAD3A 100%)",
          border: "1px solid rgba(0,0,0,0.3)",
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.2)",
          minHeight: 32,
        }}
      >
        <div
          className="text-[10px] font-bold truncate"
          style={{ color: "#2A3A10" }}
        >
          {currentTrack?.title || "No Track"}
        </div>
        {currentTrack?.artist && (
          <div
            className="text-[9px] truncate"
            style={{ color: "#3A4A20" }}
          >
            {currentTrack.artist}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onPointerDown={handlePrev}
          className="hover:opacity-70 transition-opacity"
          style={{
            cursor: "pointer",
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.7)",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
          }}
        >
          <SkipBack size={16} weight="fill" />
        </button>
        <button
          type="button"
          onPointerDown={handleToggle}
          className="flex items-center justify-center hover:opacity-70 transition-opacity"
          style={{
            cursor: "pointer",
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 100%)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "rgba(255,255,255,0.85)",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          {isPlaying ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
        </button>
        <button
          type="button"
          onPointerDown={handleNext}
          className="hover:opacity-70 transition-opacity"
          style={{
            cursor: "pointer",
            background: "none",
            border: "none",
            color: "rgba(255,255,255,0.7)",
            filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.3))",
          }}
        >
          <SkipForward size={16} weight="fill" />
        </button>
      </div>
    </div>
  );
}
