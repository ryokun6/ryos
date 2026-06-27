import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useAppStore } from "@/stores/useAppStore";
import { fetchCurrencyRateForWidget } from "@/lib/currency/frankfurter";
import {
  convertValue,
  getCategoryById,
  type ConversionCategoryId,
} from "../utils/conversionData";
import {
  applyUnary,
  backspace,
  calculate,
  clearAll,
  clearEntry,
  createInitialCalcState,
  factorial,
  formatNumber,
  inputDecimal,
  inputDigit,
  inputOperator,
  insertConstant,
  memoryAdd,
  memoryClear,
  memoryRecall,
  memoryStore,
  memorySubtract,
  negate,
  openParenthesis,
  closeParenthesis,
  percentOf,
  toggleAngleMode,
  unaryFunctions,
  type CalcState,
  type Operator,
} from "../utils/calculatorEngine";
import { getCalculatorWindowSize } from "../utils/windowSizes";
import type { CalculatorTheme } from "../components/types";
import { helpItems } from "..";

export type CalculatorMode = "basic" | "scientific" | "conversion";

type CalculatorPersistedState = {
  mode: CalculatorMode;
  angleMode: "deg" | "rad";
  conversionCategory: ConversionCategoryId;
  fromUnit: string;
  toUnit: string;
  conversionAmount: string;
};

const STORAGE_KEY = "calculator-app-state-v1";

function loadPersistedState(): Partial<CalculatorPersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<CalculatorPersistedState>;
  } catch {
    return {};
  }
}

function savePersistedState(state: CalculatorPersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

type CalcAction =
  | { type: "set"; payload: CalcState }
  | { type: "dispatch"; reducer: (state: CalcState) => CalcState };

function calcReducer(state: CalcState, action: CalcAction): CalcState {
  if (action.type === "set") return action.payload;
  return action.reducer(state);
}

export function useCalculatorLogic({
  instanceId,
}: {
  instanceId: string;
  isWindowOpen?: boolean;
  isForeground?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("calculator", helpItems);
  const {
    isWindowsTheme,
    isMacOSTheme,
    isSystem7Theme,
    isWinXp,
    isWin98,
    isMacTheme,
  } = useThemeFlags();
  const updateInstanceWindowState = useAppStore((s) => s.updateInstanceWindowState);
  const instance = useAppStore((s) =>
    instanceId ? s.instances[instanceId] : undefined
  );

  const persisted = useMemo(() => loadPersistedState(), []);
  const [mode, setModeState] = useReducer(
    (_: CalculatorMode, next: CalculatorMode) => next,
    persisted.mode ?? "basic"
  );
  const [calcState, dispatchCalc] = useReducer(
    calcReducer,
    createInitialCalcState()
  );
  const [conversionCategory, setConversionCategory] = useStateWithDefault<ConversionCategoryId>(
    persisted.conversionCategory ?? "length"
  );
  const [fromUnit, setFromUnit] = useStateWithDefault(persisted.fromUnit ?? "m");
  const [toUnit, setToUnit] = useStateWithDefault(persisted.toUnit ?? "ft");
  const [conversionCalcState, dispatchConversionCalc] = useReducer(
    calcReducer,
    {
      ...createInitialCalcState(),
      display: persisted.conversionAmount ?? "1",
    }
  );
  const conversionAmount = conversionCalcState.display;
  const [currencyRate, setCurrencyRate] = useState(1);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const currencyAbortRef = useRef<AbortController | null>(null);

  const helpAbout = useAppHelpAboutDialogs();

  const calculatorTheme: CalculatorTheme = isSystem7Theme
    ? "system7"
    : isMacOSTheme
      ? "aqua"
      : isWinXp
        ? "xp"
        : isWin98
          ? "win98"
          : "win98";

  useEffect(() => {
    dispatchCalc({
      type: "dispatch",
      reducer: (s) => ({ ...s, angleMode: persisted.angleMode ?? "deg" }),
    });
  }, [persisted.angleMode]);

  useEffect(() => {
    savePersistedState({
      mode,
      angleMode: calcState.angleMode,
      conversionCategory,
      fromUnit,
      toUnit,
      conversionAmount,
    });
  }, [mode, calcState.angleMode, conversionCategory, fromUnit, toUnit, conversionAmount]);

  useEffect(() => {
    const size = getCalculatorWindowSize(mode, calculatorTheme);
    if (!instanceId || !instance) return;
    const position = instance.position ?? { x: 120, y: 120 };
    updateInstanceWindowState(instanceId, position, size);
  }, [mode, calculatorTheme, instanceId, instance, updateInstanceWindowState]);

  useEffect(() => {
    if (conversionCategory !== "currency") return;
    if (fromUnit.toUpperCase() === toUnit.toUpperCase()) {
      setCurrencyRate(1);
      setCurrencyError(null);
      return;
    }

    currencyAbortRef.current?.abort();
    const controller = new AbortController();
    currencyAbortRef.current = controller;
    setCurrencyLoading(true);
    setCurrencyError(null);

    void fetchCurrencyRateForWidget(fromUnit, toUnit, controller.signal)
      .then(({ rate }) => {
        if (!controller.signal.aborted) {
          setCurrencyRate(rate);
          setCurrencyLoading(false);
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setCurrencyError(
            t("apps.calculator.conversion.currencyError")
          );
          setCurrencyLoading(false);
        }
      });

    return () => controller.abort();
  }, [conversionCategory, fromUnit, toUnit, t]);

  const category = getCategoryById(conversionCategory);

  useEffect(() => {
    if (!category.units.some((u) => u.id === fromUnit)) {
      setFromUnit(category.units[0]?.id ?? fromUnit);
    }
    if (!category.units.some((u) => u.id === toUnit)) {
      setToUnit(category.units[1]?.id ?? category.units[0]?.id ?? toUnit);
    }
  }, [category, fromUnit, toUnit]);

  const conversionRawResult = useMemo(() => {
    const amount = Number(conversionAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount)) return NaN;
    return convertValue(
      amount,
      conversionCategory,
      fromUnit,
      toUnit,
      currencyRate
    );
  }, [
    conversionAmount,
    conversionCategory,
    fromUnit,
    toUnit,
    currencyRate,
  ]);

  const conversionResult = useMemo(() => {
    if (!Number.isFinite(conversionRawResult)) return "—";
    const locale = i18n.resolvedLanguage || i18n.language;
    if (conversionCategory === "currency") {
      return new Intl.NumberFormat(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(conversionRawResult);
    }
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }).format(
      conversionRawResult
    );
  }, [
    conversionRawResult,
    conversionCategory,
    i18n.resolvedLanguage,
    i18n.language,
  ]);

  const setMode = useCallback(
    (next: CalculatorMode) => {
      if (next === mode) return;
      if (next === "conversion") {
        dispatchConversionCalc({
          type: "set",
          payload: {
            ...createInitialCalcState(),
            display: calcState.error ? "0" : calcState.display,
          },
        });
      } else if (mode === "conversion") {
        dispatchCalc({
          type: "set",
          payload: {
            ...calcState,
            display: conversionCalcState.error
              ? "0"
              : conversionCalcState.display,
            accumulator: null,
            pendingOperator: null,
            waitingForOperand: true,
            error: false,
            parentheses: [],
          },
        });
      }
      setModeState(next);
    },
    [mode, calcState, conversionCalcState]
  );

  const runCalc = useCallback((reducer: (state: CalcState) => CalcState) => {
    dispatchCalc({ type: "dispatch", reducer });
  }, []);
  const runConversionCalc = useCallback(
    (reducer: (state: CalcState) => CalcState) => {
      dispatchConversionCalc({ type: "dispatch", reducer });
    },
    []
  );

  const pressDigit = useCallback(
    (digit: string) => runCalc((s) => inputDigit(s, digit)),
    [runCalc]
  );

  const pressOperator = useCallback(
    (op: Operator) => runCalc((s) => inputOperator(s, op)),
    [runCalc]
  );

  const pressEquals = useCallback(() => runCalc(calculate), [runCalc]);
  const pressClear = useCallback(() => runCalc(clearAll), [runCalc]);
  const pressClearEntry = useCallback(() => runCalc(clearEntry), [runCalc]);
  const pressBackspace = useCallback(() => runCalc(backspace), [runCalc]);
  const pressDecimal = useCallback(() => runCalc(inputDecimal), [runCalc]);
  const pressNegate = useCallback(() => runCalc(negate), [runCalc]);
  const pressPercent = useCallback(() => runCalc(percentOf), [runCalc]);
  const pressConversionDigit = useCallback(
    (digit: string) => runConversionCalc((state) => inputDigit(state, digit)),
    [runConversionCalc]
  );
  const pressConversionOperator = useCallback(
    (operator: Operator) =>
      runConversionCalc((state) => inputOperator(state, operator)),
    [runConversionCalc]
  );
  const pressConversionEquals = useCallback(
    () => runConversionCalc(calculate),
    [runConversionCalc]
  );
  const pressConversionClear = useCallback(
    () => runConversionCalc(clearAll),
    [runConversionCalc]
  );
  const pressConversionBackspace = useCallback(
    () => runConversionCalc(backspace),
    [runConversionCalc]
  );
  const pressConversionDecimal = useCallback(
    () => runConversionCalc(inputDecimal),
    [runConversionCalc]
  );
  const pressConversionNegate = useCallback(
    () => runConversionCalc(negate),
    [runConversionCalc]
  );
  const pressConversionPercent = useCallback(
    () =>
      runConversionCalc((state) => {
        if (state.accumulator != null) return percentOf(state);
        return applyUnary(state, (value) => value / 100);
      }),
    [runConversionCalc]
  );

  const pressUnary = useCallback(
    (name: keyof typeof unaryFunctions) =>
      runCalc((s) => applyUnary(s, (v, mode) => unaryFunctions[name](v, mode))),
    [runCalc]
  );

  const pressPi = useCallback(
    () => runCalc((s) => insertConstant(s, Math.PI)),
    [runCalc]
  );
  const pressE = useCallback(
    () => runCalc((s) => insertConstant(s, Math.E)),
    [runCalc]
  );
  const pressFactorial = useCallback(() => runCalc(factorial), [runCalc]);
  const pressToggleAngle = useCallback(() => runCalc(toggleAngleMode), [runCalc]);
  const pressOpenParenthesis = useCallback(
    () => runCalc(openParenthesis),
    [runCalc]
  );
  const pressCloseParenthesis = useCallback(
    () => runCalc(closeParenthesis),
    [runCalc]
  );
  const pressRandom = useCallback(
    () => runCalc((s) => insertConstant(s, Math.random())),
    [runCalc]
  );

  const pressMemoryClear = useCallback(() => runCalc(memoryClear), [runCalc]);
  const pressMemoryRecall = useCallback(() => runCalc(memoryRecall), [runCalc]);
  const pressMemoryAdd = useCallback(() => runCalc(memoryAdd), [runCalc]);
  const pressMemorySubtract = useCallback(() => runCalc(memorySubtract), [runCalc]);
  const pressMemoryStore = useCallback(() => runCalc(memoryStore), [runCalc]);

  const handleCategoryChange = useCallback((id: ConversionCategoryId) => {
    setConversionCategory(id);
    const nextCategory = getCategoryById(id);
    setFromUnit(nextCategory.units[0]?.id ?? "m");
    setToUnit(nextCategory.units[1]?.id ?? nextCategory.units[0]?.id ?? "ft");
  }, []);

  const swapConversionUnits = useCallback(() => {
    if (Number.isFinite(conversionRawResult)) {
      dispatchConversionCalc({
        type: "set",
        payload: {
          ...createInitialCalcState(),
          display: formatNumber(conversionRawResult),
        },
      });
    }
    if (conversionCategory === "currency" && currencyRate !== 0) {
      setCurrencyRate(1 / currencyRate);
    }
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  }, [
    conversionRawResult,
    conversionCategory,
    currencyRate,
    fromUnit,
    toUnit,
  ]);

  return {
    t,
    translatedHelpItems,
    ...helpAbout,
    isWindowsTheme,
    isMacTheme,
    isMacOSTheme,
    isSystem7Theme,
    calculatorTheme,
    mode,
    setMode,
    calcState,
    pressDigit,
    pressOperator,
    pressEquals,
    pressClear,
    pressClearEntry,
    pressBackspace,
    pressDecimal,
    pressNegate,
    pressPercent,
    pressConversionDigit,
    pressConversionOperator,
    pressConversionEquals,
    pressConversionClear,
    pressConversionBackspace,
    pressConversionDecimal,
    pressConversionNegate,
    pressConversionPercent,
    pressUnary,
    pressPi,
    pressE,
    pressFactorial,
    pressToggleAngle,
    pressOpenParenthesis,
    pressCloseParenthesis,
    pressRandom,
    pressMemoryClear,
    pressMemoryRecall,
    pressMemoryAdd,
    pressMemorySubtract,
    pressMemoryStore,
    conversionCategory,
    handleCategoryChange,
    fromUnit,
    setFromUnit,
    toUnit,
    setToUnit,
    conversionAmount,
    conversionResult,
    category,
    swapConversionUnits,
    currencyLoading,
    currencyError,
  };
}

function useStateWithDefault<T>(initial: T): [T, (value: T) => void] {
  const [value, setValue] = useReducer((_: T, next: T) => next, initial);
  return [value, setValue];
}
