import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useReducer,
  type ChangeEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useDashboardStore, type CurrencyWidgetConfig } from "@/stores/useDashboardStore";
import {
  countDigitsBeforePos,
  fetchCurrencyRateForWidget,
  formatCurrencyAmountDisplay,
  getCurrencyMaxFractionDigits,
  normalizeAmountInput,
  parseAmountInput,
  positionAfterNthDigit,
} from "@/lib/currency/frankfurter";
import { RATE_STALE_MS } from "./constants";
import {
  createCurrencyWidgetInitialState,
  currencyWidgetReducer,
} from "./currencyWidgetReducer";
import { cacheKey, rateMemoryCache } from "./rateCache";
import type { CurrencyWidgetState, RateCacheEntry } from "./types";

export function useCurrencyWidget(widgetId?: string) {
  const { t, i18n } = useTranslation();

  const widget = useDashboardStore((s) =>
    widgetId ? s.widgets.find((w) => w.id === widgetId) : undefined
  );
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as CurrencyWidgetConfig | undefined;

  const [state, dispatch] = useReducer(
    currencyWidgetReducer,
    createCurrencyWidgetInitialState(
      config?.fromCurrency ?? "USD",
      config?.toCurrency ?? "EUR",
      config?.lastAmount,
      i18n.language
    )
  );
  const {
    fromCurrency,
    toCurrency,
    amountStr,
    rateData,
    loading,
    error,
    usingCache,
  } = state;

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const nextState: Partial<CurrencyWidgetState> = {};
    if (config?.fromCurrency && config.fromCurrency !== fromCurrency) {
      nextState.fromCurrency = config.fromCurrency;
    }
    if (config?.toCurrency && config.toCurrency !== toCurrency) {
      nextState.toCurrency = config.toCurrency;
    }
    if (config?.lastAmount != null) {
      const normalized = normalizeAmountInput(
        config.lastAmount,
        getCurrencyMaxFractionDigits(config.fromCurrency ?? fromCurrency),
        i18n.language
      );
      if (normalized !== amountStr) nextState.amountStr = normalized;
    }
    if (Object.keys(nextState).length > 0) {
      dispatch({ type: "set", payload: nextState });
    }
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
        dispatch({
          type: "set",
          payload: {
            rateData: self,
            error: null,
            usingCache: false,
            loading: false,
          },
        });
        return;
      }

      const mem = rateMemoryCache.get(key);
      const now = Date.now();
      if (mem && now - mem.fetchedAt < RATE_STALE_MS) {
        dispatch({
          type: "set",
          payload: {
            rateData: mem,
            usingCache: false,
            error: null,
            loading: false,
          },
        });
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({
        type: "set",
        payload: { loading: true, error: null, usingCache: false },
      });

      try {
        const { rate, rateDate } = await fetchCurrencyRateForWidget(from, to, controller.signal);
        if (controller.signal.aborted) return;
        const entry: RateCacheEntry = { rate, rateDate, fetchedAt: Date.now() };
        rateMemoryCache.set(key, entry);
        dispatch({
          type: "set",
          payload: { rateData: entry, loading: false },
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const cached = rateMemoryCache.get(key);
        if (!controller.signal.aborted) {
          if (cached) {
            dispatch({
              type: "set",
              payload: { rateData: cached, usingCache: true, error: null },
            });
          } else {
            dispatch({
              type: "set",
              payload: {
                error: t(
                  "apps.dashboard.currency.error",
                  "Could not load exchange rate"
                ),
              },
            });
          }
          dispatch({ type: "set", payload: { loading: false } });
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
    const renormalized = normalizeAmountInput(
      amountStr,
      getCurrencyMaxFractionDigits(code),
      i18n.language
    );
    dispatch({
      type: "set",
      payload: {
        fromCurrency: code,
        amountStr: renormalized,
      },
    });
    persistFields({ fromCurrency: code, toCurrency, lastAmount: renormalized });
  };

  const handleToChange = (code: string) => {
    dispatch({ type: "set", payload: { toCurrency: code } });
    persistFields({ fromCurrency, toCurrency: code, lastAmount: amountStr });
  };

  const maxFractionDigits = getCurrencyMaxFractionDigits(fromCurrency);
  const formattedAmount = useMemo(
    () => formatCurrencyAmountDisplay(amountStr, fromCurrency, i18n.language),
    [amountStr, fromCurrency, i18n.language]
  );

  const handleAmountInput = (e: ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const rawValue = inputEl.value;
    const selStart = inputEl.selectionStart ?? rawValue.length;

    const digitsBeforeCaret = countDigitsBeforePos(rawValue, selStart);

    const normalized = normalizeAmountInput(
      rawValue,
      maxFractionDigits,
      i18n.language
    );
    const nextDisplay = formatCurrencyAmountDisplay(
      normalized,
      fromCurrency,
      i18n.language
    );

    dispatch({ type: "set", payload: { amountStr: normalized } });
    persistFields({ fromCurrency, toCurrency, lastAmount: normalized });

    requestAnimationFrame(() => {
      if (!inputEl || document.activeElement !== inputEl) return;
      const target = positionAfterNthDigit(nextDisplay, digitsBeforeCaret);
      try {
        inputEl.setSelectionRange(target, target);
      } catch {
        // Some browsers throw on certain input types; safe to ignore.
      }
    });
  };

  const handleSwap = () => {
    const nf = toCurrency;
    const nt = fromCurrency;
    dispatch({ type: "swapCurrencies" });
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

  return {
    t,
    fromCurrency,
    toCurrency,
    amountStr,
    rateData,
    loading,
    error,
    usingCache,
    formattedAmount,
    simplifiedRateLine,
    updatedLabel,
    outputStr,
    handleFromChange,
    handleToChange,
    handleAmountInput,
    handleSwap,
  };
}
