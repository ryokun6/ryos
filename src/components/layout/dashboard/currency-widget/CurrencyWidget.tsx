import { useThemeFlags } from "@/hooks/useThemeFlags";
import { CurrencyWidgetGraphiteView } from "./CurrencyWidgetGraphiteView";
import { CurrencyWidgetXpView } from "./CurrencyWidgetXpView";
import type { CurrencyWidgetProps } from "./types";
import { useCurrencyWidget } from "./useCurrencyWidget";

export function CurrencyWidget({ widgetId }: CurrencyWidgetProps) {
  const { isWindowsTheme: isXpTheme } = useThemeFlags();
  const viewProps = useCurrencyWidget(widgetId);

  if (isXpTheme) {
    return (
      <CurrencyWidgetXpView
        t={viewProps.t}
        fromCurrency={viewProps.fromCurrency}
        toCurrency={viewProps.toCurrency}
        formattedAmount={viewProps.formattedAmount}
        outputStr={viewProps.outputStr}
        loading={viewProps.loading}
        error={viewProps.error}
        rateData={viewProps.rateData}
        usingCache={viewProps.usingCache}
        simplifiedRateLine={viewProps.simplifiedRateLine}
        updatedLabel={viewProps.updatedLabel}
        onAmountInput={viewProps.handleAmountInput}
        onFromChange={viewProps.handleFromChange}
        onToChange={viewProps.handleToChange}
        onSwap={viewProps.handleSwap}
      />
    );
  }

  return (
    <CurrencyWidgetGraphiteView
      t={viewProps.t}
      fromCurrency={viewProps.fromCurrency}
      toCurrency={viewProps.toCurrency}
      formattedAmount={viewProps.formattedAmount}
      outputStr={viewProps.outputStr}
      loading={viewProps.loading}
      error={viewProps.error}
      rateData={viewProps.rateData}
      usingCache={viewProps.usingCache}
      simplifiedRateLine={viewProps.simplifiedRateLine}
      updatedLabel={viewProps.updatedLabel}
      onAmountInput={viewProps.handleAmountInput}
      onFromChange={viewProps.handleFromChange}
      onToChange={viewProps.handleToChange}
      onSwap={viewProps.handleSwap}
    />
  );
}
