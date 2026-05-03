import { apiHandler } from "./_utils/api-handler.js";
import { crossRateFromUsdRates } from "./_utils/currency-cross-rate.js";

export const runtime = "nodejs";
export const maxDuration = 10;

const FRANKFURTER = "https://api.frankfurter.app/latest";

interface FrankfurterLatestResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface OpenErApiResponse {
  result: string;
  base_code: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
}

function normalizeCurrency(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const c = code.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(c) ? c : null;
}

function erApiRateDate(data: OpenErApiResponse): string {
  const raw = data.time_last_update_utc;
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

async function fetchFrankfurterPair(
  from: string,
  to: string,
  signal: AbortSignal
): Promise<{ rate: number; rateDate: string }> {
  const url = `${FRANKFURTER}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  const res = await fetch(url, {
    redirect: "follow",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
  const data = (await res.json()) as FrankfurterLatestResponse;
  const rate = data.rates[to];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error("Frankfurter: missing rate");
  }
  return { rate, rateDate: data.date };
}

async function fetchOpenErApiPair(
  from: string,
  to: string,
  signal: AbortSignal
): Promise<{ rate: number; rateDate: string }> {
  const url = "https://open.er-api.com/v6/latest/USD";
  const res = await fetch(url, {
    redirect: "follow",
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`open.er-api HTTP ${res.status}`);
  const data = (await res.json()) as OpenErApiResponse;
  if (data.result !== "success" || !data.rates) {
    throw new Error("open.er-api: bad payload");
  }
  const rate = crossRateFromUsdRates(data.rates, from, to);
  return { rate, rateDate: erApiRateDate(data) };
}

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, logger, startTime }) => {
    const from = normalizeCurrency(req.query.from);
    const to = normalizeCurrency(req.query.to);

    if (!from || !to) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Query params 'from' and 'to' must be 3-letter currency codes" });
      return;
    }

    if (from === to) {
      logger.response(200, Date.now() - startTime);
      res.status(200).json({
        rate: 1,
        rateDate: new Date().toISOString().slice(0, 10),
        source: "identity",
      });
      return;
    }

    const signalPrimary = AbortSignal.timeout(10_000);

    try {
      const primary = await fetchFrankfurterPair(from, to, signalPrimary);
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ ...primary, source: "frankfurter" });
      return;
    } catch (primaryErr) {
      logger.info("Frankfurter currency fetch failed, trying fallback", {
        from,
        to,
        error: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
      });
    }

    try {
      const signalFallback = AbortSignal.timeout(10_000);
      const fallback = await fetchOpenErApiPair(from, to, signalFallback);
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ ...fallback, source: "open.er-api" });
      return;
    } catch (fallbackErr) {
      logger.error("Currency rate fetch failed (both sources)", fallbackErr);
      logger.response(502, Date.now() - startTime);
      res.status(502).json({ error: "Could not load exchange rate" });
    }
  }
);
