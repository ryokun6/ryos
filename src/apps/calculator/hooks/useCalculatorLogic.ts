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
  const { t } = useTranslation();
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
  const [conversionAmount, setConversionAmount] = useStateWithDefault(
    persisted.conversionAmount ?? "1"
  );
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

  const conversionResult = useMemo(() => {
    const amount = Number(conversionAmount.replace(/,/g, ""));
    if (!Number.isFinite(amount)) return "—";
    const result = convertValue(
      amount,
      conversionCategory,
      fromUnit,
      toUnit,
      currencyRate
    );
    if (!Number.isFinite(result)) return "—";
    if (conversionCategory === "currency") {
      return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: toUnit === "JPY" || toUnit === "KRW" ? 0 : 4,
      }).format(result);
    }
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 8 }).format(result);
  }, [conversionAmount, conversionCategory, fromUnit, toUnit, currencyRate]);

  const setMode = useCallback((next: CalculatorMode) => {
    setModeState(next);
  }, []);

  const runCalc = useCallback((reducer: (state: CalcState) => CalcState) => {
    dispatchCalc({ type: "dispatch", reducer });
  }, []);

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
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  }, [fromUnit, toUnit]);

  const pressDoubleZero = useCallback(() => {
    runCalc((s) => {
      if (s.error) return s;
      if (s.waitingForOperand || s.display === "0") {
        return { ...s, display: "00", waitingForOperand: false };
      }
      if (s.display.length + 2 > 16) return s;
      return { ...s, display: `${s.display}00` };
    });
  }, [runCalc]);

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
    pressUnary,
    pressPi,
    pressE,
    pressFactorial,
    pressToggleAngle,
    pressMemoryClear,
    pressMemoryRecall,
    pressMemoryAdd,
    pressMemorySubtract,
    pressMemoryStore,
    pressDoubleZero,
    conversionCategory,
    handleCategoryChange,
    fromUnit,
    setFromUnit,
    toUnit,
    setToUnit,
    conversionAmount,
    setConversionAmount,
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
