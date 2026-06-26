import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  AUTO_TIMEZONE,
  TIMEZONE_STORAGE_KEY,
  type TimezonePreference,
  isValidTimezone,
} from "@/lib/timezoneConfig";
import { SETTINGS_ANALYTICS, track } from "@/utils/analytics";

interface TimezoneState {
  /** Either {@link AUTO_TIMEZONE} or an IANA timezone id. */
  timezone: TimezonePreference;
  /** Update the timezone preference (invalid ids fall back to automatic). */
  setTimezone: (timezone: TimezonePreference) => void;
}

export const useTimezoneStore = create<TimezoneState>()(
  persist(
    (set, get) => ({
      timezone: AUTO_TIMEZONE,
      setTimezone: (timezone) => {
        const previous = get().timezone;
        const next =
          timezone === AUTO_TIMEZONE || isValidTimezone(timezone)
            ? timezone
            : AUTO_TIMEZONE;
        if (next === previous) return;
        set({ timezone: next });
        track(SETTINGS_ANALYTICS.TIMEZONE_CHANGE, {
          timezone: next,
          previousTimezone: previous,
        });
      },
    }),
    {
      name: TIMEZONE_STORAGE_KEY,
      version: 1,
    }
  )
);
