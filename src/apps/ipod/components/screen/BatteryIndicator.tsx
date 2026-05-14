import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { BatteryManager } from "../../types";

interface BatteryIndicatorProps {
  backlightOn: boolean;
  /** Classic = monochrome blue 4-bar; modern = continuous green fill. */
  variant?: "classic" | "modern";
}

export function BatteryIndicator({
  backlightOn,
  variant = "classic",
}: BatteryIndicatorProps) {
  const isModern = variant === "modern";
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [animationFrame, setAnimationFrame] = useState<number>(1);

  useEffect(() => {
    let batteryRef: BatteryManager | null = null;
    let isDisposed = false;

    const updateLevel = () => {
      if (batteryRef) {
        setBatteryLevel(batteryRef.level);
      }
    };

    const updateCharging = () => {
      if (batteryRef) {
        setIsCharging(batteryRef.charging);
      }
    };

    const getBattery = async () => {
      try {
        if ("getBattery" in navigator) {
          batteryRef = await (
            navigator as unknown as { getBattery: () => Promise<BatteryManager> }
          ).getBattery();
          if (isDisposed) return;
          setBatteryLevel(batteryRef.level);
          setIsCharging(batteryRef.charging);

          batteryRef.addEventListener("levelchange", updateLevel);
          batteryRef.addEventListener("chargingchange", updateCharging);
        }
      } catch {
        if (isDisposed) return;
        // Fallback to a default level
        setBatteryLevel(1.0);
        setIsCharging(false);
      }
    };

    void getBattery();

    return () => {
      isDisposed = true;
      if (batteryRef) {
        batteryRef.removeEventListener("levelchange", updateLevel);
        batteryRef.removeEventListener("chargingchange", updateCharging);
      }
    };
  }, []);

  // Animation effect for charging
  useEffect(() => {
    if (!isCharging) return;

    const interval = setInterval(() => {
      setAnimationFrame((prev) => (prev % 4) + 1);
    }, 500);

    return () => clearInterval(interval);
  }, [isCharging]);

  // Use fallback if no battery level detected
  const level = batteryLevel ?? 1.0;
  const filledBars = isCharging ? animationFrame : Math.ceil(level * 4);

  if (isModern) {
    // Compact iPod nano 6G/7G battery: smaller pill (14×7) sized for the
    // slim 17px titlebar, with a "half-glossy" highlight that brightens
    // the top half only and fades to transparent at the midline. The
    // green fill carries the same half-gloss so charge level reads as
    // a single glossy lozenge rather than a flat bar.
    //
    // Sharp 90° corners (no border-radius) on both the body and the cap
    // — the iPod classic 6G/7G silver header in the reference photo
    // uses a flat rectangular battery, not the rounded pill the iOS 6
    // status-bar battery has.
    const fillPercent = Math.max(0, Math.min(1, level)) * 100;
    const isLow = !isCharging && level <= 0.2;
    return (
      <div className="flex items-center">
        <div className="relative h-[9px] w-[14px] shrink-0 overflow-hidden ipod-modern-battery-container">
          <div
            className={cn(
              "absolute inset-y-0 left-0 ipod-modern-battery-fill transition-[width] duration-300",
              isLow && "ipod-modern-battery-fill--low"
            )}
            style={{ width: `${fillPercent}%` }}
          />
        </div>
        <div className="-ml-[1px] h-[5px] w-[2px] shrink-0 ipod-modern-battery-cap" />
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {/* Battery outline */}
      <div className="relative w-[19px] h-[10px] border border-[#0a3667] bg-transparent">
        {/* Battery bars */}
        <div className="absolute inset-[1px] flex gap-[1px]">
          {[1, 2, 3, 4].map((bar) => (
            <div
              key={bar}
              className={`flex-1 h-full transition-colors duration-200 ${
                bar <= filledBars ? "bg-[#0a3667]" : "bg-transparent"
              }`}
            />
          ))}
        </div>
      </div>
      {/* Battery tip */}
      <div className="w-[2px] h-[4px] bg-[#0a3667] relative">
        <div
          className={`w-[2px] h-[2px] absolute top-[1px] left-[-2px] right-[0px] mx-auto ${
            backlightOn ? "bg-[#c5e0f5]" : "bg-[#8a9da9]"
          }`}
        />
      </div>
    </div>
  );
}
