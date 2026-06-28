import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useAppStore } from "@/stores/useAppStore";
import { fetchCurrencyRateForWidget } from "@/lib/currency/frankfurter";
import {
  convertValue,
  DEFAULT_CONVERSION_CATEGORY,
  DEFAULT_CONVERSION_FROM_UNIT,
  DEFAULT_CONVERSION_TO_UNIT,
  formatSwappedConversionValue,
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
  openParenthesis,
  closeParenthesis,
  percentOf,
  toggleAngleMode,
  unaryFunctions,
  type CalcState,
  type Operator,
} from "../utils/calculatorEngine";
import { getCalculatorWindowSize } from "../utils/windowSizes";
import { formatCalculatorConversionResult } from "../utils/formatCalculatorDisplay";
import type { CalculatorTheme } from "../components/types";
import { helpItems } from "..";
import {
  DEFAULT_CALCULATOR_SPEECH,
  useCalculatorSpeech,
} from "./useCalculatorSpeech";

export type CalculatorMode = "basic" | "scientific" | "conversion";

type CalculatorPersistedState = {
  mode: CalculatorMode;
  angleMode: "deg" | "rad";
  conversionCategory: ConversionCategoryId;
  fromUnit: string;
  toUnit: string;
  conversionAmount: string;
  speechEnabled?: boolean;
  speakButtonPresses?: boolean;
  speakResults?: boolean;
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

function shouldSpeakCalculatorResult(prev: CalcState, next: CalcState): boolean {
  return next.display !== prev.display || (next.error && !prev.error);
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
    persisted.conversionCategory ?? DEFAULT_CONVERSION_CATEGORY
  );
  const [fromUnit, setFromUnit] = useStateWithDefault(
    persisted.fromUnit ?? DEFAULT_CONVERSION_FROM_UNIT
  );
  const [toUnit, setToUnit] = useStateWithDefault(
    persisted.toUnit ?? DEFAULT_CONVERSION_TO_UNIT
  );
  const [conversionCalcState, dispatchConversionCalc] = useReducer(
    calcReducer,
    {
      ...createInitialCalcState(),
      display: persisted.conversionAmount ?? "1",
    }
  );
  const conversionAmount = conversionCalcState.display;
  const calcStateRef = useRef(calcState);
  calcStateRef.current = calcState;
  const conversionCalcStateRef = useRef(conversionCalcState);
  conversionCalcStateRef.current = conversionCalcState;
  const [currencyRate, setCurrencyRate] = useState(1);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const currencyAbortRef = useRef<AbortController | null>(null);

  const helpAbout = useAppHelpAboutDialogs();

  const speech = useCalculatorSpeech({
    speechEnabled: persisted.speechEnabled ?? DEFAULT_CALCULATOR_SPEECH.speechEnabled,
    speakButtonPresses:
      persisted.speakButtonPresses ?? DEFAULT_CALCULATOR_SPEECH.speakButtonPresses,
    speakResults: persisted.speakResults ?? DEFAULT_CALCULATOR_SPEECH.speakResults,
  });

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
      speechEnabled: speech.speechEnabled,
      speakButtonPresses: speech.speakButtonPresses,
      speakResults: speech.speakResults,
    });
  }, [
    mode,
    calcState.angleMode,
    conversionCategory,
    fromUnit,
    toUnit,
    conversionAmount,
    speech.speechEnabled,
    speech.speakButtonPresses,
    speech.speakResults,
  ]);

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
    const locale = i18n.resolvedLanguage || i18n.language;
    return formatCalculatorConversionResult(
      conversionRawResult,
      locale,
      conversionCategory === "currency"
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

  const runCalc = useCallback(
    (
      reducer: (state: CalcState) => CalcState,
      options?: { speakResult?: boolean }
    ) => {
      const prev = calcStateRef.current;
      const next = reducer(prev);
      calcStateRef.current = next;
      dispatchCalc({ type: "set", payload: next });
      if (options?.speakResult && shouldSpeakCalculatorResult(prev, next)) {
        speech.speakResult(next.display);
      }
    },
    [speech]
  );
  const runConversionCalc = useCallback(
    (
      reducer: (state: CalcState) => CalcState,
      options?: { speakResult?: boolean }
    ) => {
      const prev = conversionCalcStateRef.current;
      const next = reducer(prev);
      conversionCalcStateRef.current = next;
      dispatchConversionCalc({ type: "set", payload: next });
      if (options?.speakResult && shouldSpeakCalculatorResult(prev, next)) {
        speech.speakResult(next.display);
      }
    },
    [speech]
  );

  const pressDigit = useCallback(
    (digit: string) => {
      runCalc((s) => inputDigit(s, digit));
      speech.speakKey(digit);
    },
    [runCalc, speech]
  );

  const pressOperator = useCallback(
    (op: Operator) => {
      speech.speakKey(op);
      runCalc((s) => inputOperator(s, op), { speakResult: true });
    },
    [runCalc, speech]
  );

  const pressEquals = useCallback(() => {
    speech.speakKey("=");
    runCalc(calculate, { speakResult: true });
  }, [runCalc, speech]);
  const pressClear = useCallback(() => {
    runCalc(clearAll);
    speech.speakKey("C");
  }, [runCalc, speech]);
  const pressClearEntry = useCallback(() => {
    runCalc(clearEntry);
    speech.speakKey("CE");
  }, [runCalc, speech]);
  const pressBackspace = useCallback(() => {
    runCalc(backspace);
    speech.speakKey("⌫");
  }, [runCalc, speech]);
  const pressDecimal = useCallback(() => {
    runCalc(inputDecimal);
    speech.speakKey(".");
  }, [runCalc, speech]);
  const pressNegate = useCallback(() => {
    speech.speakKey("±");
    runCalc(negate, { speakResult: true });
  }, [runCalc, speech]);
  const pressPercent = useCallback(() => {
    speech.speakKey("%");
    runCalc(percentOf, { speakResult: true });
  }, [runCalc, speech]);
  const pressConversionDigit = useCallback(
    (digit: string) => {
      runConversionCalc((state) => inputDigit(state, digit));
      speech.speakKey(digit);
    },
    [runConversionCalc, speech]
  );
  const pressConversionOperator = useCallback(
    (operator: Operator) => {
      speech.speakKey(operator);
      runConversionCalc((state) => inputOperator(state, operator), {
        speakResult: true,
      });
    },
    [runConversionCalc, speech]
  );
  const pressConversionEquals = useCallback(() => {
    speech.speakKey("=");
    runConversionCalc(calculate, { speakResult: true });
  }, [runConversionCalc, speech]);
  const pressConversionClear = useCallback(() => {
    runConversionCalc(clearAll);
    speech.speakKey("C");
  }, [runConversionCalc, speech]);
  const pressConversionBackspace = useCallback(() => {
    runConversionCalc(backspace);
    speech.speakKey("⌫");
  }, [runConversionCalc, speech]);
  const pressConversionDecimal = useCallback(() => {
    runConversionCalc(inputDecimal);
    speech.speakKey(".");
  }, [runConversionCalc, speech]);
  const pressConversionNegate = useCallback(() => {
    speech.speakKey("±");
    runConversionCalc(negate, { speakResult: true });
  }, [runConversionCalc, speech]);
  const pressConversionPercent = useCallback(
    () => {
      speech.speakKey("%");
      runConversionCalc((state) => {
        if (state.accumulator != null) return percentOf(state);
        return applyUnary(state, (value) => value / 100);
      }, { speakResult: true });
    },
    [runConversionCalc, speech]
  );

  const pressUnary = useCallback(
    (name: keyof typeof unaryFunctions) => {
      speech.speakKey(name);
      runCalc((s) => applyUnary(s, (v, mode) => unaryFunctions[name](v, mode)), {
        speakResult: true,
      });
    },
    [runCalc, speech]
  );

  const pressPi = useCallback(() => {
    speech.speakKey("π");
    runCalc((s) => insertConstant(s, Math.PI), { speakResult: true });
  }, [runCalc, speech]);
  const pressE = useCallback(() => {
    speech.speakKey("e");
    runCalc((s) => insertConstant(s, Math.E), { speakResult: true });
  }, [runCalc, speech]);
  const pressFactorial = useCallback(() => {
    speech.speakKey("!");
    runCalc(factorial, { speakResult: true });
  }, [runCalc, speech]);
  const pressToggleAngle = useCallback(() => {
    runCalc(toggleAngleMode);
    speech.speakKey(calcState.angleMode === "deg" ? "Rad" : "Deg");
  }, [runCalc, speech, calcState.angleMode]);
  const pressOpenParenthesis = useCallback(() => {
    runCalc(openParenthesis);
    speech.speakKey("(");
  }, [runCalc, speech]);
  const pressCloseParenthesis = useCallback(() => {
    speech.speakKey(")");
    runCalc(closeParenthesis, { speakResult: true });
  }, [runCalc, speech]);
  const pressRandom = useCallback(() => {
    speech.speakKey("Rand");
    runCalc((s) => insertConstant(s, Math.random()), { speakResult: true });
  }, [runCalc, speech]);

  const pressMemoryClear = useCallback(() => {
    runCalc(memoryClear);
    speech.speakKey("MC");
  }, [runCalc, speech]);
  const pressMemoryRecall = useCallback(() => {
    speech.speakKey("MR");
    runCalc(memoryRecall, { speakResult: true });
  }, [runCalc, speech]);
  const pressMemoryAdd = useCallback(() => {
    runCalc(memoryAdd);
    speech.speakKey("M+");
  }, [runCalc, speech]);
  const pressMemorySubtract = useCallback(() => {
    runCalc(memorySubtract);
    speech.speakKey("M−");
  }, [runCalc, speech]);
  const pressMemoryStore = useCallback(() => {
    runCalc(memoryStore);
    speech.speakKey("MS");
  }, [runCalc, speech]);

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
          display: formatSwappedConversionValue(
            conversionRawResult,
            conversionAmount
          ),
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
    conversionAmount,
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
    speechEnabled: speech.speechEnabled,
    setSpeechEnabled: speech.setSpeechEnabled,
    speakButtonPresses: speech.speakButtonPresses,
    setSpeakButtonPresses: speech.setSpeakButtonPresses,
    speakResults: speech.speakResults,
    setSpeakResults: speech.setSpeakResults,
  };
}

function useStateWithDefault<T>(initial: T): [T, (value: T) => void] {
  const [value, setValue] = useReducer((_: T, next: T) => next, initial);
  return [value, setValue];
}
