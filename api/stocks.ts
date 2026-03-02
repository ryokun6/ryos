import { apiHandler } from "./_utils/api-handler.js";

export const runtime = "nodejs";
export const maxDuration = 30;

interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

interface ChartPoint {
  timestamp: number;
  close: number;
}

interface StocksApiResponse {
  quotes: StockQuote[];
  chart?: ChartPoint[];
}

function rangeToDate(range: string): { period1: Date; interval: string } {
  const now = new Date();
  const ms = now.getTime();
  const DAY = 86400_000;

  switch (range) {
    case "1d":
      return { period1: new Date(ms - 1 * DAY), interval: "5m" };
    case "5d":
      return { period1: new Date(ms - 5 * DAY), interval: "15m" };
    case "1mo":
      return { period1: new Date(ms - 30 * DAY), interval: "1d" };
    case "3mo":
      return { period1: new Date(ms - 90 * DAY), interval: "1d" };
    case "6mo":
      return { period1: new Date(ms - 180 * DAY), interval: "1d" };
    case "1y":
      return { period1: new Date(ms - 365 * DAY), interval: "1wk" };
    case "2y":
      return { period1: new Date(ms - 730 * DAY), interval: "1wk" };
    default:
      return { period1: new Date(ms - 180 * DAY), interval: "1d" };
  }
}

export default apiHandler(
  { methods: ["GET"] },
  async ({ req, res, logger, startTime }) => {
    const symbolsParam = req.query.symbols as string | undefined;
    const chartSymbol = req.query.chart as string | undefined;
    const range = (req.query.range as string) || "6mo";

    if (!symbolsParam) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Missing 'symbols' query parameter" });
      return;
    }

    const symbols = symbolsParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20);

    if (symbols.length === 0) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "No valid symbols provided" });
      return;
    }

    logger.info("Fetching stock data", { symbols, chartSymbol, range });

    try {
      const YahooFinance = (await import("yahoo-finance2")).default;
      const yahooFinance = new YahooFinance();

      const quoteResults = await Promise.allSettled(
        symbols.map((sym) =>
          yahooFinance.quote(sym).then(
            (q) => ({
              symbol: q.symbol ?? sym,
              price: q.regularMarketPrice ?? 0,
              change: q.regularMarketChange ?? 0,
              changePercent: q.regularMarketChangePercent ?? 0,
              name: q.shortName ?? q.longName ?? sym,
            })
          )
        )
      );

      const quotes: StockQuote[] = quoteResults
        .map((r, i) => {
          if (r.status === "fulfilled") return r.value;
          logger.error(`Quote failed for ${symbols[i]}`, r.reason);
          return null;
        })
        .filter((q): q is StockQuote => q !== null);

      const response: StocksApiResponse = { quotes };

      if (chartSymbol) {
        const { period1, interval } = rangeToDate(range);
        try {
          const chartResult = await yahooFinance.chart(chartSymbol.toUpperCase(), {
            period1,
            interval: interval as "1d" | "1wk" | "1mo" | "5m" | "15m",
          });

          if (chartResult?.quotes) {
            response.chart = chartResult.quotes
              .filter(
                (q: Record<string, unknown>) =>
                  q.date != null && q.close != null
              )
              .map((q: Record<string, unknown>) => ({
                timestamp: new Date(q.date as string | number | Date).getTime(),
                close: q.close as number,
              }));
          }
        } catch (chartErr) {
          logger.error(`Chart failed for ${chartSymbol}`, chartErr);
        }
      }

      logger.info("Stock data fetched", {
        quotesCount: quotes.length,
        chartPoints: response.chart?.length ?? 0,
      });
      logger.response(200, Date.now() - startTime);
      res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
      res.status(200).json(response);
    } catch (error) {
      logger.error("Failed to fetch stock data", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to fetch stock data" });
    }
  }
);
