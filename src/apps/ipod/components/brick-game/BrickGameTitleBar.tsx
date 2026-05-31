import { cn } from "@/lib/utils";
import { BatteryIndicator } from "../screen/BatteryIndicator";
import { IpodModernPlayPauseIcon } from "../screen/IpodModernPlayPauseIcon";
import { IPOD_MODERN_TITLEBAR_HEIGHT_PX } from "../../constants";
import { STARTING_LIVES } from "./constants";
import type { Phase } from "./types";

interface BrickGameTitleBarProps {
  isModernUi: boolean;
  phase: Phase;
  lives: number;
  score: number;
  backlightOn: boolean;
}

export function BrickGameTitleBar({
  isModernUi,
  phase,
  lives,
  score,
  backlightOn,
}: BrickGameTitleBarProps) {
  return (
    <div
      className={cn(
        "shrink-0 flex items-center z-10 py-0 px-2 tabular-nums gap-1.5",
        isModernUi
          ? "ipod-modern-titlebar font-ipod-modern-ui text-[12px] font-semibold text-black pl-1.5 pr-1.5"
          : "border-b border-[#0a3667] font-chicago text-[16px] text-[#0a3667] [text-shadow:1px_1px_0_rgba(0,0,0,0.15)]"
      )}
      style={
        isModernUi
          ? { height: IPOD_MODERN_TITLEBAR_HEIGHT_PX, minHeight: IPOD_MODERN_TITLEBAR_HEIGHT_PX }
          : undefined
      }
    >
      {isModernUi ? (
        <div className={cn("flex shrink-0 items-center justify-center w-[14px] h-[14px] [transform:translateY(-0.5px)]", "[filter:drop-shadow(0_1px_0_rgba(255,255,255,0.9))]")}>
          <IpodModernPlayPauseIcon playing={phase === "playing"} size={14} />
        </div>
      ) : (
        <div className={cn("flex items-center justify-center w-4 h-4 mt-0.5 font-chicago", phase === "playing" ? "text-xs" : "text-[18px]")}>
          {phase === "playing" ? "▶" : "⏸︎"}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-[3px]" aria-label={`${lives} lives remaining`}>
        {Array.from({ length: STARTING_LIVES }, (_, i) => i + 1).map((slot) => {
          const filled = slot <= lives;
          return isModernUi ? (
            <span key={slot} className="block size-[6px] rounded-full" style={filled ? { background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.95) 0%, #6e6e72 45%, #101012 100%)" } : { backgroundColor: "rgba(0,0,0,0.15)" }} />
          ) : (
            <span key={slot} className={cn("block size-[5px] rounded-full", filled ? "bg-[#0a3667]" : "bg-transparent border border-[#0a3667]/50")} />
          );
        })}
      </div>
      <div className="flex-1" aria-hidden />
      <div className={cn("flex shrink-0 items-center gap-1", isModernUi ? "text-[12px] font-semibold text-black" : "text-xs")}>
        <span className={cn("tabular-nums leading-none", isModernUi && "[text-shadow:0_1px_0_rgba(255,255,255,0.9)]")}>{score}</span>
        <BatteryIndicator backlightOn={backlightOn} variant={isModernUi ? "modern" : "classic"} />
      </div>
    </div>
  );
}
