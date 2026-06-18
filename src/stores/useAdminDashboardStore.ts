import { create } from "zustand";

/**
 * Shared selection state for the Admin dashboard analytics range.
 *
 * Lives in a store (rather than local component state) so sibling chrome — the
 * admin status bar in particular — can reflect the currently selected range
 * (e.g. show the covered date / date range) without prop-drilling through the
 * scroll content. `rangeDays === 1` is the "Today" shortcut.
 */
interface AdminDashboardState {
  rangeDays: number;
  setRangeDays: (days: number) => void;
  /**
   * Number of Redis keys currently loaded in the Redis Browser scope, surfaced
   * here so the status bar can show the count without prop-drilling through the
   * main pane. `null` means the browser is inactive / hasn't loaded any keys.
   */
  redisKeyCount: number | null;
  setRedisKeyCount: (count: number | null) => void;
}

export const useAdminDashboardStore = create<AdminDashboardState>((set) => ({
  rangeDays: 1,
  setRangeDays: (days) => set({ rangeDays: days }),
  redisKeyCount: null,
  setRedisKeyCount: (count) => set({ redisKeyCount: count }),
}));
