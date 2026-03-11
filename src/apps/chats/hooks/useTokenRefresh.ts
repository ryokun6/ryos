/**
 * Token refresh is now handled server-side (cookie TTL is refreshed on
 * every authenticated request). This file is kept as a no-op stub so
 * existing imports don't break during the transition.
 */

export function useTokenRefresh() {
  // No-op: server manages token/cookie TTL automatically.
}

export function useTokenAge() {
  return { ageInDays: null };
}
