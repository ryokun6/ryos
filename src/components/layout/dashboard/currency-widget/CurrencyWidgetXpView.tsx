import { ArrowsLeftRight } from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { CURRENCY_WIDGET_FONT, MAIN_CURRENCIES } from "./constants";
import type { RateCacheEntry } from "./types";

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

export interface CurrencyWidgetXpViewProps {
  t: TFunction;
  fromCurrency: string;
  toCurrency: string;
  formattedAmount: string;
  outputStr: string;
  loading: boolean;
  error: string | null;
  rateData: RateCacheEntry | null;
  usingCache: boolean;
  simplifiedRateLine: string | null;
  updatedLabel: string | null;
  onAmountInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFromChange: (code: string) => void;
  onToChange: (code: string) => void;
  onSwap: () => void;
}

export function CurrencyWidgetXpView({
  t,
  fromCurrency,
  toCurrency,
  formattedAmount,
  outputStr,
  loading,
  error,
  rateData,
  usingCache,
  simplifiedRateLine,
  updatedLabel,
  onAmountInput,
  onFromChange,
  onToChange,
  onSwap,
}: CurrencyWidgetXpViewProps) {
  return (
    <div className="flex flex-col flex-1" style={{ fontFamily: CURRENCY_WIDGET_FONT, padding: "7px 8px 5px", gap: 5, minHeight: "inherit" }}>
      <input
        type="text"
        inputMode="decimal"
        value={formattedAmount}
        onChange={onAmountInput}
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
          onChange={(e) => onFromChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          style={selectStyleXp}
        >
          {MAIN_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="button" onClick={onSwap} onPointerDown={(e) => e.stopPropagation()} style={swapBtnXp} title={t("apps.dashboard.currency.swap", "Swap currencies")}>
          <ArrowsLeftRight size={12} weight="bold" style={{ transform: "rotate(90deg)" }} />
        </button>
        <select
          value={toCurrency}
          onChange={(e) => onToChange(e.target.value)}
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
