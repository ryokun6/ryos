import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDashboardStore, type CurrencyWidgetConfig } from "@/stores/useDashboardStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { CURRENCY_WIDGET_FONT, MAIN_CURRENCIES } from "./constants";
import type { CurrencyBackPanelProps } from "./types";

export function CurrencyBackPanel({ widgetId, onDone }: CurrencyBackPanelProps) {
  const { t } = useTranslation();
  const { isWindowsTheme } = useThemeFlags();
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const config = widget?.config as CurrencyWidgetConfig | undefined;

  const [fromCurrency, setFromCurrency] = useState(config?.fromCurrency ?? "USD");
  const [toCurrency, setToCurrency] = useState(config?.toCurrency ?? "EUR");

  const textColor = isWindowsTheme ? "#000" : "rgba(255,255,255,0.85)";

  const handleSave = useCallback(() => {
    updateWidgetConfig(widgetId, {
      ...config,
      fromCurrency,
      toCurrency,
    });
    onDone?.();
  }, [widgetId, fromCurrency, toCurrency, config, updateWidgetConfig, onDone]);

  return (
    <div className="p-3 flex flex-col gap-3" style={{ fontFamily: CURRENCY_WIDGET_FONT }} onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: isWindowsTheme ? "#888" : "rgba(255,255,255,0.4)" }}
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
              background: isWindowsTheme ? "#FFF" : "rgba(255,255,255,0.1)",
              border: isWindowsTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.15)",
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
              background: isWindowsTheme ? "#FFF" : "rgba(255,255,255,0.1)",
              border: isWindowsTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.15)",
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
          color: isWindowsTheme ? "#0066CC" : "rgba(210,215,245,0.95)",
          cursor: "pointer",
          border: "none",
          background: "none",
          padding: "2px 0",
        }}
      >
        {t("apps.dashboard.translation.save", "Save")}
      </button>
      <p className="text-[10px] leading-snug" style={{ color: isWindowsTheme ? "#666" : "rgba(255,255,255,0.55)" }}>
        {t(
          "apps.dashboard.currency.about",
          "Rates from Frankfurter (ECB). For information only; not financial advice."
        )}
      </p>
    </div>
  );
}
