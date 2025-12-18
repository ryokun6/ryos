import { useState, useEffect } from "react";
import type { BatteryManager } from "../../types";

interface BatteryIndicatorProps {
  backlightOn: boolean;
}

export function BatteryIndicator({ backlightOn }: BatteryIndicatorProps) {
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [animationFrame, setAnimationFrame] = useState<number>(1);

  useEffect(() => {
    const getBattery = async () => {
      try {
        if ("getBattery" in navigator) {
          const battery = await (
            navigator as unknown as { getBattery: () => Promise<BatteryManager> }
          ).getBattery();
          setBatteryLevel(battery.level);
          setIsCharging(battery.charging);

          const updateLevel = () => setBatteryLevel(battery.level);
          const updateCharging = () => setIsCharging(battery.charging);

          battery.addEventListener("levelchange", updateLevel);
          battery.addEventListener("chargingchange", updateCharging);

          return () => {
            battery.removeEventListener("levelchange", updateLevel);
            battery.removeEventListener("chargingchange", updateCharging);
          };
        }
      } catch {
        // Fallback to a default level
        setBatteryLevel(1.0);
        setIsCharging(false);
      }
    };

    getBattery();
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
