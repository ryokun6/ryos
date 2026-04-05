/**
 * When ryOS is embedded (e.g. Cursor), the host may expose `StartGrindPlanning`
 * on `window.parent` to open planning in the parent instead of streaming here.
 * Cross-origin parents will throw on property access; we catch and fall back.
 */
export type ParentGrindPlanningPayload = {
  text: string;
  model?: string | null;
  systemState?: unknown;
};

export function tryInvokeParentStartGrindPlanning(
  payload: ParentGrindPlanningPayload,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    const parentWin = window.parent;
    if (!parentWin || parentWin === window) {
      return false;
    }
    const fn = (parentWin as unknown as { StartGrindPlanning?: unknown })
      .StartGrindPlanning;
    if (typeof fn !== "function") {
      return false;
    }
    const result = (fn as (p: ParentGrindPlanningPayload) => unknown)(payload);
    void Promise.resolve(result);
    return true;
  } catch {
    return false;
  }
}
