/**
 * open.er-api returns rates as "per 1 USD" when the series base is USD.
 */
export function crossRateFromUsdRates(
  rates: Record<string, number>,
  from: string,
  to: string
): number {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;

  if (f === "USD") {
    const r = rates[t];
    if (typeof r !== "number" || !Number.isFinite(r)) throw new Error("Missing target rate");
    return r;
  }
  if (t === "USD") {
    const r = rates[f];
    if (typeof r !== "number" || !Number.isFinite(r) || r === 0) throw new Error("Missing source rate");
    return 1 / r;
  }
  const rf = rates[f];
  const rt = rates[t];
  if (typeof rf !== "number" || typeof rt !== "number" || !Number.isFinite(rf) || !Number.isFinite(rt) || rf === 0) {
    throw new Error("Missing cross rate");
  }
  return rt / rf;
}
