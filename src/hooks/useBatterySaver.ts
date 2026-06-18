import { useEffect, useState } from "react";

/** Treat the device as power-saving below this battery level while discharging. */
const LOW_BATTERY_THRESHOLD = 0.2;

/**
 * Minimal shape of the (non-standard, still widely shipped in Chromium/Android)
 * BatteryManager returned by `navigator.getBattery()`. It was removed from
 * `lib.dom.d.ts`, so we type just what we use.
 */
interface BatteryManagerLike extends EventTarget {
  level: number;
  charging: boolean;
}

type NavigatorWithBattery = Navigator & {
  getBattery?: () => Promise<BatteryManagerLike>;
};

/**
 * True when the device appears to be conserving power — currently approximated
 * as "low battery and not charging" via the Battery Status API.
 *
 * There is no web API for the OS "Low Power Mode" toggle (iOS/macOS), and the
 * Battery Status API is unavailable on Safari/Firefox, so this returns `false`
 * there and is a best-effort signal rather than a guarantee. Reacts to battery
 * level / charging changes.
 */
export function useBatterySaver(): boolean {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const nav = navigator as NavigatorWithBattery;
    if (typeof nav.getBattery !== "function") return;

    let battery: BatteryManagerLike | null = null;
    let cancelled = false;

    const update = () => {
      if (!battery) return;
      setSaving(!battery.charging && battery.level <= LOW_BATTERY_THRESHOLD);
    };

    nav
      .getBattery()
      .then((b) => {
        if (cancelled) return;
        battery = b;
        b.addEventListener("levelchange", update);
        b.addEventListener("chargingchange", update);
        update();
      })
      .catch(() => {
        // Battery API unavailable / blocked — leave power-saving off.
      });

    return () => {
      cancelled = true;
      if (battery) {
        battery.removeEventListener("levelchange", update);
        battery.removeEventListener("chargingchange", update);
      }
    };
  }, []);

  return saving;
}
