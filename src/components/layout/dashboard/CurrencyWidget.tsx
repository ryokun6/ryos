import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type CurrencyWidgetConfig } from "@/stores/useDashboardStore";
import { useTranslation } from "react-i18next";
import { ArrowsDownUp, ArrowsLeftRight } from "@phosphor-icons/react";
import { fetchCurrencyRateForWidget, parseAmountInput } from "@/lib/currency/frankfurter";

const MAIN_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CHF",
  "CAD",
  "AUD",
  "NZD",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "BRL",
  "MXN",
  "CNY",
  "INR",
  "KRW",
  "SGD",
  "HKD",
  "TRY",
  "ZAR",
  "ILS",
] as const;

const RATE_STALE_MS = 24 * 60 * 60 * 1000;

type RateCacheEntry = { rate: number; rateDate: string; fetchedAt: number };

const rateMemoryCache = new Map<string, RateCacheEntry>();

function cacheKey(from: string, to: string) {
  return `${from.toUpperCase()}>${to.toUpperCase()}`;
}

interface CurrencyWidgetProps {
  widgetId?: string;
}

export function CurrencyWidget({ widgetId }: CurrencyWidgetProps) {
  const { t, i18n } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const widget = useDashboardStore((s) =>
    widgetId ? s.widgets.find((w) => w.id === widgetId) : undefined
  );
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as CurrencyWidgetConfig | undefined;

  const [fromCurrency, setFromCurrency] = useState(config?.fromCurrency ?? "USD");
  const [toCurrency, setToCurrency] = useState(config?.toCurrency ?? "EUR");
  const [amountStr, setAmountStr] = useState(config?.lastAmount ?? "100");
  const [rateData, setRateData] = useState<RateCacheEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usingCache, setUsingCache] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (config?.fromCurrency && config.fromCurrency !== fromCurrency) setFromCurrency(config.fromCurrency);
    if (config?.toCurrency && config.toCurrency !== toCurrency) setToCurrency(config.toCurrency);
    if (config?.lastAmount != null && config.lastAmount !== amountStr) setAmountStr(config.lastAmount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.fromCurrency, config?.toCurrency, config?.lastAmount]);

  const persistFields = useCallback(
    (next: { fromCurrency: string; toCurrency: string; lastAmount: string }) => {
      if (!widgetId) return;
      updateWidgetConfig(widgetId, next);
    },
    [widgetId, updateWidgetConfig]
  );

  const refreshRate = useCallback(
    async (from: string, to: string) => {
      const key = cacheKey(from, to);
      if (from.toUpperCase() === to.toUpperCase()) {
        const self: RateCacheEntry = {
          rate: 1,
          rateDate: new Date().toISOString().slice(0, 10),
          fetchedAt: Date.now(),
        };
        setRateData(self);
        setError(null);
        setUsingCache(false);
        setLoading(false);
        return;
      }

      const mem = rateMemoryCache.get(key);
      const now = Date.now();
      if (mem && now - mem.fetchedAt < RATE_STALE_MS) {
        setRateData(mem);
        setUsingCache(false);
        setError(null);
        setLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);
      setUsingCache(false);

      try {
        const { rate, rateDate } = await fetchCurrencyRateForWidget(from, to, controller.signal);
        if (controller.signal.aborted) return;
        const entry: RateCacheEntry = { rate, rateDate, fetchedAt: Date.now() };
        rateMemoryCache.set(key, entry);
        setRateData(entry);
        setLoading(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const cached = rateMemoryCache.get(key);
        if (!controller.signal.aborted) {
          if (cached) {
            setRateData(cached);
            setUsingCache(true);
            setError(null);
          } else {
            setError(t("apps.dashboard.currency.error", "Could not load exchange rate"));
          }
          setLoading(false);
        }
      }
    },
    [t]
  );

  useEffect(() => {
    void refreshRate(fromCurrency, toCurrency);
    return () => {
      abortRef.current?.abort();
    };
  }, [fromCurrency, toCurrency, refreshRate]);

  const amount = useMemo(() => parseAmountInput(amountStr), [amountStr]);

  const converted = rateData ? amount * rateData.rate : null;

  const simplifiedRateLine = useMemo(() => {
    if (!rateData || loading) return null;
    const oneUnit = rateData.rate;
    return `1 ${fromCurrency} = ${oneUnit.toFixed(toCurrency === "JPY" ? 2 : 4)} ${toCurrency}`;
  }, [rateData, loading, fromCurrency, toCurrency]);

  const updatedLabel = useMemo(() => {
    if (!rateData) return null;
    const stale = Date.now() - rateData.fetchedAt > RATE_STALE_MS;
    const timeStr = new Date(rateData.fetchedAt).toLocaleString(i18n.language, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
    if (stale || usingCache) {
      return t("apps.dashboard.currency.staleRates", "Using cached rates · {{time}}", { time: timeStr });
    }
    return t("apps.dashboard.currency.updated", "Updated {{time}}", { time: timeStr });
  }, [rateData, usingCache, i18n.language, t]);

  const handleFromChange = (code: string) => {
    setFromCurrency(code);
    persistFields({ fromCurrency: code, toCurrency, lastAmount: amountStr });
  };

  const handleToChange = (code: string) => {
    setToCurrency(code);
    persistFields({ fromCurrency, toCurrency: code, lastAmount: amountStr });
  };

  const handleAmountChange = (v: string) => {
    setAmountStr(v);
    persistFields({ fromCurrency, toCurrency, lastAmount: v });
  };

  const handleSwap = () => {
    const nf = toCurrency;
    const nt = fromCurrency;
    setFromCurrency(nf);
    setToCurrency(nt);
    persistFields({ fromCurrency: nf, toCurrency: nt, lastAmount: amountStr });
  };

  const outputStr =
    converted != null
      ? new Intl.NumberFormat(i18n.language, {
          style: "currency",
          currency: toCurrency,
          maximumFractionDigits: toCurrency === "JPY" ? 0 : 2,
        }).format(converted)
      : "—";

  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  const selectStyleXp = {
    fontSize: 11,
    padding: "2px 4px",
    border: "1px solid #ACA899",
    borderRadius: 2,
    background: "#FFF",
    color: "#000",
    cursor: "pointer" as const,
    minWidth: 0,
    flex: 1,
  };

  const swapBtnXp = {
    padding: "2px 6px",
    border: "1px solid #ACA899",
    borderRadius: 2,
    background: "#ECE9D8",
    cursor: "pointer" as const,
    fontSize: 11,
    lineHeight: 1,
    display: "flex" as const,
    alignItems: "center" as const,
    flexShrink: 0,
  };

  if (isXpTheme) {
    return (
      <div className="flex flex-col flex-1" style={{ fontFamily: font, padding: "7px 8px 5px", gap: 5, minHeight: "inherit" }}>
        <input
          type="text"
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => handleAmountChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("apps.dashboard.currency.amountPlaceholder", "Amount")}
          style={{
            fontSize: 12,
            padding: "4px 6px",
            border: "1px solid #ACA899",
            borderRadius: 2,
            background: "#FFF",
            color: "#000",
            width: "100%",
            outline: "none",
          }}
        />
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <select
            value={fromCurrency}
            onChange={(e) => handleFromChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            style={selectStyleXp}
          >
            {MAIN_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleSwap} onPointerDown={(e) => e.stopPropagation()} style={swapBtnXp} title={t("apps.dashboard.currency.swap", "Swap currencies")}>
            <ArrowsLeftRight size={12} weight="bold" />
          </button>
          <select
            value={toCurrency}
            onChange={(e) => handleToChange(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            style={selectStyleXp}
          >
            {MAIN_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            padding: "5px 8px",
            border: "1px solid #ACA899",
            borderRadius: 2,
            background: "#F5F5F0",
            color: loading ? "#888" : "#000",
          }}
        >
          {loading ? t("apps.dashboard.currency.loading", "Loading rate…") : error && !rateData ? error : outputStr}
        </div>
        {(simplifiedRateLine || updatedLabel) && !loading && (
          <div style={{ fontSize: 10, color: "#444", lineHeight: 1.3 }}>
            {simplifiedRateLine && <div style={{ fontWeight: 600 }}>{simplifiedRateLine}</div>}
            {rateData && (
              <div style={{ color: usingCache ? "#996600" : "#666" }}>
                {t("apps.dashboard.currency.asOfDate", "As of {{date}}", { date: rateData.rateDate })} · {updatedLabel}
              </div>
            )}
            {usingCache && (
              <div style={{ color: "#996600", marginTop: 1 }}>
                {t("apps.dashboard.currency.cachedHint", "Using cached rate (refresh by changing pair).")}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  /** Graphite-style glossy controls (Translation widget shape, neutral gray). */
  const graphiteSelectStyle = {
    fontSize: 12,
    fontWeight: 600 as const,
    padding: "3px 8px",
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.35)",
    background:
      "linear-gradient(180deg, #c4c8d0 0%, #9ba1ad 38%, #6f7682 72%, #5a616c 100%)",
    color: "#FFF",
    cursor: "pointer" as const,
    boxShadow: "0 1px 3px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.45)",
    fontFamily: font,
    appearance: "none" as const,
    WebkitAppearance: "none" as const,
    outline: "none" as const,
    textShadow: "0 -1px 1px rgba(0,0,0,0.35)",
    minWidth: 0,
    flex: 1,
  };

  const graphiteBtnStyle = {
    padding: "4px 6px",
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.35)",
    background:
      "linear-gradient(180deg, #c4c8d0 0%, #9ba1ad 38%, #6f7682 72%, #5a616c 100%)",
    cursor: "pointer" as const,
    color: "#FFF",
    flexShrink: 0,
    boxShadow: "0 1px 3px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.45)",
  };

  return (
    <div
      className="flex flex-col flex-1"
      style={{
        borderRadius: "inherit",
        overflow: "hidden",
        minHeight: "inherit",
        fontFamily: font,
        position: "relative",
        background:
          "linear-gradient(180deg, rgba(118,122,132,0.9) 0%, rgba(82,86,94,0.93) 45%, rgba(58,61,68,0.95) 100%)",
      }}
    >
      <div
        className="relative flex flex-col"
        style={{
          padding: "7px 10px 5px",
          gap: 6,
          zIndex: 1,
        }}
      >
        <input
          type="text"
          inputMode="decimal"
          value={amountStr}
          onChange={(e) => handleAmountChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder={t("apps.dashboard.currency.amountPlaceholder", "Amount")}
          style={{
            width: "100%",
            fontSize: 13,
            fontWeight: 600,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.18)",
            background: "rgba(255,255,255,0.94)",
            color: "#1a1a1a",
            outline: "none",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.07), 0 1px 0 rgba(255,255,255,0.12)",
          }}
        />

        <div className="flex items-center gap-2">
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <select
              value={fromCurrency}
              onChange={(e) => handleFromChange(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ ...graphiteSelectStyle, width: "100%", paddingRight: 20 }}
            >
              {MAIN_CURRENCIES.map((c) => (
                <option key={c} value={c} style={{ color: "#000", background: "#FFF" }}>
                  {c}
                </option>
              ))}
            </select>
            <div
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "rgba(255,255,255,0.88)",
                fontSize: 8,
                lineHeight: 1,
                textShadow: "0 -1px 1px rgba(0,0,0,0.35)",
              }}
            >
              ▼
            </div>
          </div>
          <button
            type="button"
            onClick={handleSwap}
            onPointerDown={(e) => e.stopPropagation()}
            title={t("apps.dashboard.currency.swap", "Swap currencies")}
            style={graphiteBtnStyle}
          >
            <ArrowsDownUp size={14} weight="bold" />
          </button>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <select
              value={toCurrency}
              onChange={(e) => handleToChange(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{ ...graphiteSelectStyle, width: "100%", paddingRight: 20 }}
            >
              {MAIN_CURRENCIES.map((c) => (
                <option key={c} value={c} style={{ color: "#000", background: "#FFF" }}>
                  {c}
                </option>
              ))}
            </select>
            <div
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                color: "rgba(255,255,255,0.88)",
                fontSize: 8,
                lineHeight: 1,
                textShadow: "0 -1px 1px rgba(0,0,0,0.35)",
              }}
            >
              ▼
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "linear-gradient(180deg, rgba(255,255,255,0.97) 0%, rgba(245,246,248,0.95) 100%)",
            color: loading ? "rgba(0,0,0,0.38)" : error && !rateData ? "#b33" : "#1a1d22",
            textAlign: "center" as const,
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.06), 0 1px 0 rgba(255,255,255,0.2)",
          }}
        >
          {loading
            ? t("apps.dashboard.currency.loading", "Loading rate…")
            : error && !rateData
              ? error
              : outputStr}
        </div>

        {!loading && rateData && (
          <div
            style={{
              fontSize: 10,
              color: "rgba(255,255,255,0.82)",
              lineHeight: 1.28,
              textAlign: "center",
              paddingBottom: 0,
              marginBottom: 0,
            }}
          >
            {simplifiedRateLine && (
              <div style={{ fontWeight: 600, textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}>{simplifiedRateLine}</div>
            )}
            <div
              style={{
                opacity: usingCache ? 1 : 0.88,
                color: usingCache ? "#f5e6a8" : "rgba(240,242,245,0.78)",
                textShadow: "0 1px 2px rgba(0,0,0,0.2)",
              }}
            >
              {t("apps.dashboard.currency.asOfDate", "As of {{date}}", { date: rateData.rateDate })} · {updatedLabel}
            </div>
            {usingCache && (
              <div style={{ color: "#f0e0a0", marginTop: 1, fontSize: 9.5 }}>
                {t("apps.dashboard.currency.cachedHint", "Using cached rate (refresh by changing pair).")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CurrencyBackPanel({
  widgetId,
  onDone,
}: {
  widgetId: string;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const config = widget?.config as CurrencyWidgetConfig | undefined;

  const [fromCurrency, setFromCurrency] = useState(config?.fromCurrency ?? "USD");
  const [toCurrency, setToCurrency] = useState(config?.toCurrency ?? "EUR");

  const textColor = isXpTheme ? "#000" : "rgba(255,255,255,0.85)";
  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  const handleSave = useCallback(() => {
    updateWidgetConfig(widgetId, {
      ...config,
      fromCurrency,
      toCurrency,
    });
    onDone?.();
  }, [widgetId, fromCurrency, toCurrency, config, updateWidgetConfig, onDone]);

  return (
    <div className="p-3 flex flex-col gap-3" style={{ fontFamily: font }} onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: isXpTheme ? "#888" : "rgba(255,255,255,0.4)" }}
      >
        {t("apps.dashboard.currency.defaultPair", "Default currency pair")}
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] w-12" style={{ color: textColor }}>
            {t("apps.dashboard.currency.from", "From")}
          </span>
          <select
            value={fromCurrency}
            onChange={(e) => setFromCurrency(e.target.value)}
            className="flex-1 text-[11px] rounded px-1.5 py-0.5 outline-none"
            style={{
              background: isXpTheme ? "#FFF" : "rgba(255,255,255,0.1)",
              border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.15)",
              color: textColor,
              cursor: "pointer",
            }}
          >
            {MAIN_CURRENCIES.map((c) => (
              <option key={c} value={c} style={{ color: "#000" }}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] w-12" style={{ color: textColor }}>
            {t("apps.dashboard.currency.to", "To")}
          </span>
          <select
            value={toCurrency}
            onChange={(e) => setToCurrency(e.target.value)}
            className="flex-1 text-[11px] rounded px-1.5 py-0.5 outline-none"
            style={{
              background: isXpTheme ? "#FFF" : "rgba(255,255,255,0.1)",
              border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.15)",
              color: textColor,
              cursor: "pointer",
            }}
          >
            {MAIN_CURRENCIES.map((c) => (
              <option key={c} value={c} style={{ color: "#000" }}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSave}
        className="text-[11px] font-medium hover:opacity-80 transition-opacity self-end"
        style={{
          color: isXpTheme ? "#0066CC" : "rgba(210,215,245,0.95)",
          cursor: "pointer",
          border: "none",
          background: "none",
          padding: "2px 0",
        }}
      >
        {t("apps.dashboard.translation.save", "Save")}
      </button>
      <p className="text-[10px] leading-snug" style={{ color: isXpTheme ? "#666" : "rgba(255,255,255,0.55)" }}>
        {t(
          "apps.dashboard.currency.about",
          "Rates from Frankfurter (ECB). For information only; not financial advice."
        )}
      </p>
    </div>
  );
}
