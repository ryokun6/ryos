export const getTokenAgeMs = (
  lastRefreshTime: number,
  now: number = Date.now()
): number => now - lastRefreshTime;

export const getTokenAgeDays = (
  lastRefreshTime: number,
  now: number = Date.now()
): number => Math.floor(getTokenAgeMs(lastRefreshTime, now) / (24 * 60 * 60 * 1000));

export const isTokenRefreshDue = (
  lastRefreshTime: number,
  refreshThresholdMs: number,
  now: number = Date.now()
): boolean => getTokenAgeMs(lastRefreshTime, now) > refreshThresholdMs;

export const getDaysUntilTokenRefresh = (
  lastRefreshTime: number,
  refreshThresholdMs: number,
  now: number = Date.now()
): number => {
  const refreshDueAt = lastRefreshTime + refreshThresholdMs;
  const remainingMs = Math.max(0, refreshDueAt - now);
  return Math.floor(remainingMs / (24 * 60 * 60 * 1000));
};
