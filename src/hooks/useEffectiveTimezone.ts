import { useTimezoneStore } from "@/stores/useTimezoneStore";
import {
  getEffectiveTimezone,
  readPersistedTimezonePreference,
  resolveEffectiveTimezone,
} from "@/lib/timezoneConfig";

/**
 * Reactive IANA timezone used for clocks, calendar "today", and other local
 * date/time UI. Honors the International preference (`auto` → browser zone,
 * otherwise the saved IANA id).
 *
 * Before zustand `persist` rehydrates, the in-memory preference is still the
 * default even when localStorage has a saved zone. Read storage synchronously
 * in that window so first paint matches {@link getEffectiveTimezone} / API
 * headers (no effect, no flash). After hydration the store is authoritative.
 */
export function useEffectiveTimezone(): string {
  // Subscribe so we re-render when the user changes timezone or persist loads.
  const preference = useTimezoneStore((s) => s.timezone);
  const hasHydrated =
    typeof useTimezoneStore.persist?.hasHydrated === "function"
      ? useTimezoneStore.persist.hasHydrated()
      : true;

  const preferenceToResolve = hasHydrated
    ? preference
    : readPersistedTimezonePreference();

  return resolveEffectiveTimezone(preferenceToResolve);
}

/** Non-hook alias for imperative / non-React call sites. */
export { getEffectiveTimezone };
