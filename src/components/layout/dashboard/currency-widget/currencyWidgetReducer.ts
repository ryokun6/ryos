import {
  getCurrencyMaxFractionDigits,
  normalizeAmountInput,
} from "@/lib/currency/frankfurter";
import type { CurrencyWidgetAction, CurrencyWidgetState } from "./types";

export function currencyWidgetReducer(
  state: CurrencyWidgetState,
  action: CurrencyWidgetAction
): CurrencyWidgetState {
  switch (action.type) {
    case "set":
      return { ...state, ...action.payload };
    case "swapCurrencies":
      return {
        ...state,
        fromCurrency: state.toCurrency,
        toCurrency: state.fromCurrency,
      };
    default:
      return state;
  }
}

export function createCurrencyWidgetInitialState(
  fromCurrency: string,
  toCurrency: string,
  lastAmount: string | undefined,
  language: string
): CurrencyWidgetState {
  return {
    fromCurrency,
    toCurrency,
    amountStr: normalizeAmountInput(
      lastAmount ?? "100",
      getCurrencyMaxFractionDigits(fromCurrency),
      language
    ),
    rateData: null,
    loading: false,
    error: null,
    usingCache: false,
  };
}
