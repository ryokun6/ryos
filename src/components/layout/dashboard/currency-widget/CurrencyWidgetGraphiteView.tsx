import { ArrowsDownUp } from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { CURRENCY_WIDGET_FONT, MAIN_CURRENCIES } from "./constants";
import type { RateCacheEntry } from "./types";

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
  fontFamily: CURRENCY_WIDGET_FONT,
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

export interface CurrencyWidgetGraphiteViewProps {
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

export function CurrencyWidgetGraphiteView({
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
}: CurrencyWidgetGraphiteViewProps) {
  return (
    <div
      className="flex flex-col flex-1"
      style={{
        borderRadius: "inherit",
        overflow: "hidden",
        minHeight: "inherit",
        fontFamily: CURRENCY_WIDGET_FONT,
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
          value={formattedAmount}
          onChange={onAmountInput}
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
              onChange={(e) => onFromChange(e.target.value)}
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
            onClick={onSwap}
            onPointerDown={(e) => e.stopPropagation()}
            title={t("apps.dashboard.currency.swap", "Swap currencies")}
            style={graphiteBtnStyle}
          >
            <ArrowsDownUp size={14} weight="bold" style={{ transform: "rotate(90deg)" }} />
          </button>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <select
              value={toCurrency}
              onChange={(e) => onToChange(e.target.value)}
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
