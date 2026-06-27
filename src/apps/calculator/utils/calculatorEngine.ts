export type AngleMode = "deg" | "rad";
export type Operator = "+" | "-" | "*" | "/" | "%" | "^" | "root";

interface ParenthesisFrame {
  accumulator: number | null;
  pendingOperator: Operator | null;
}

export interface CalcState {
  display: string;
  accumulator: number | null;
  pendingOperator: Operator | null;
  waitingForOperand: boolean;
  memory: number;
  angleMode: AngleMode;
  error: boolean;
  parentheses: ParenthesisFrame[];
}

const MAX_DISPLAY_CHARS = 16;

export function createInitialCalcState(): CalcState {
  return {
    display: "0",
    accumulator: null,
    pendingOperator: null,
    waitingForOperand: false,
    memory: 0,
    angleMode: "deg",
    error: false,
    parentheses: [],
  };
}

function toRadians(value: number, mode: AngleMode): number {
  return mode === "deg" ? (value * Math.PI) / 180 : value;
}

function fromRadians(value: number, mode: AngleMode): number {
  return mode === "deg" ? (value * 180) / Math.PI : value;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  if (Math.abs(value) >= 1e16 || (Math.abs(value) > 0 && Math.abs(value) < 1e-10)) {
    return value.toExponential(10).replace(/\.?0+e/, "e");
  }
  const rounded = parseFloat(value.toPrecision(12));
  let str = String(rounded);
  if (str.length > MAX_DISPLAY_CHARS) {
    str = value.toExponential(8);
  }
  return str;
}

function parseDisplay(display: string): number {
  if (display === "Error") return NaN;
  const n = Number(display);
  return Number.isFinite(n) ? n : NaN;
}

function withError(state: CalcState): CalcState {
  return { ...state, display: "Error", error: true, waitingForOperand: true };
}

function applyPending(state: CalcState, nextValue: number): number {
  const { accumulator, pendingOperator } = state;
  if (accumulator == null || pendingOperator == null) return nextValue;

  switch (pendingOperator) {
    case "+":
      return accumulator + nextValue;
    case "-":
      return accumulator - nextValue;
    case "*":
      return accumulator * nextValue;
    case "/":
      return nextValue === 0 ? NaN : accumulator / nextValue;
    case "%":
      return accumulator % nextValue;
    case "^":
      return Math.pow(accumulator, nextValue);
    case "root":
      return accumulator === 0 ? NaN : Math.pow(nextValue, 1 / accumulator);
    default:
      return nextValue;
  }
}

export function inputDigit(state: CalcState, digit: string): CalcState {
  if (state.error) return state;
  if (state.waitingForOperand) {
    return { ...state, display: digit, waitingForOperand: false };
  }
  if (state.display === "0") {
    return { ...state, display: digit };
  }
  if (state.display.length >= MAX_DISPLAY_CHARS) return state;
  return { ...state, display: state.display + digit };
}

export function inputDecimal(state: CalcState): CalcState {
  if (state.error) return state;
  if (state.waitingForOperand) {
    return { ...state, display: "0.", waitingForOperand: false };
  }
  if (state.display.includes(".")) return state;
  return { ...state, display: `${state.display}.` };
}

export function inputOperator(state: CalcState, operator: Operator): CalcState {
  if (state.error) return state;
  const current = parseDisplay(state.display);
  if (!Number.isFinite(current)) return withError(state);

  if (state.accumulator != null && state.pendingOperator && !state.waitingForOperand) {
    const result = applyPending(state, current);
    if (!Number.isFinite(result)) return withError(state);
    return {
      ...state,
      display: formatNumber(result),
      accumulator: result,
      pendingOperator: operator,
      waitingForOperand: true,
    };
  }

  return {
    ...state,
    accumulator: current,
    pendingOperator: operator,
    waitingForOperand: true,
  };
}

export function calculate(state: CalcState): CalcState {
  if (state.error) return state;
  const current = parseDisplay(state.display);
  if (!Number.isFinite(current)) return withError(state);
  if (state.accumulator == null || state.pendingOperator == null) return state;

  const result = applyPending(state, current);
  if (!Number.isFinite(result)) return withError(state);

  return {
    ...state,
    display: formatNumber(result),
    accumulator: null,
    pendingOperator: null,
    waitingForOperand: true,
  };
}

export function openParenthesis(state: CalcState): CalcState {
  if (state.error) return state;
  return {
    ...state,
    display: "0",
    accumulator: null,
    pendingOperator: null,
    waitingForOperand: true,
    parentheses: [
      ...state.parentheses,
      {
        accumulator: state.accumulator,
        pendingOperator: state.pendingOperator,
      },
    ],
  };
}

export function closeParenthesis(state: CalcState): CalcState {
  if (state.error || state.parentheses.length === 0) return state;
  const current = parseDisplay(state.display);
  if (!Number.isFinite(current)) return withError(state);
  const innerValue =
    state.accumulator != null && state.pendingOperator
      ? applyPending(state, current)
      : current;
  if (!Number.isFinite(innerValue)) return withError(state);

  const frame = state.parentheses[state.parentheses.length - 1];
  const outerState = {
    ...state,
    accumulator: frame.accumulator,
    pendingOperator: frame.pendingOperator,
  };
  const result =
    frame.accumulator != null && frame.pendingOperator
      ? applyPending(outerState, innerValue)
      : innerValue;
  if (!Number.isFinite(result)) return withError(state);

  return {
    ...state,
    display: formatNumber(result),
    accumulator: null,
    pendingOperator: null,
    waitingForOperand: true,
    parentheses: state.parentheses.slice(0, -1),
  };
}

export function clearAll(_state: CalcState): CalcState {
  return createInitialCalcState();
}

export function clearEntry(state: CalcState): CalcState {
  if (state.error) return createInitialCalcState();
  return { ...state, display: "0", waitingForOperand: false };
}

export function backspace(state: CalcState): CalcState {
  if (state.error || state.waitingForOperand) return state;
  if (state.display.length <= 1 || (state.display.length === 2 && state.display.startsWith("-"))) {
    return { ...state, display: "0" };
  }
  const next = state.display.slice(0, -1);
  return { ...state, display: next || "0" };
}

export function negate(state: CalcState): CalcState {
  if (state.error) return state;
  const current = parseDisplay(state.display);
  if (!Number.isFinite(current)) return withError(state);
  return { ...state, display: formatNumber(-current) };
}

export function insertConstant(state: CalcState, value: number): CalcState {
  if (state.error) return state;
  return {
    ...state,
    display: formatNumber(value),
    waitingForOperand: true,
  };
}

export function applyUnary(
  state: CalcState,
  fn: (value: number, angleMode: AngleMode) => number
): CalcState {
  if (state.error) return state;
  const current = parseDisplay(state.display);
  if (!Number.isFinite(current)) return withError(state);
  const result = fn(current, state.angleMode);
  if (!Number.isFinite(result)) return withError(state);
  return { ...state, display: formatNumber(result), waitingForOperand: true };
}

export function factorial(state: CalcState): CalcState {
  return applyUnary(state, (value) => {
    if (value < 0 || !Number.isInteger(value) || value > 170) return NaN;
    let result = 1;
    for (let i = 2; i <= value; i += 1) result *= i;
    return result;
  });
}

export const unaryFunctions = {
  sin: (v: number, mode: AngleMode) => Math.sin(toRadians(v, mode)),
  cos: (v: number, mode: AngleMode) => Math.cos(toRadians(v, mode)),
  tan: (v: number, mode: AngleMode) => Math.tan(toRadians(v, mode)),
  asin: (v: number, mode: AngleMode) => fromRadians(Math.asin(v), mode),
  acos: (v: number, mode: AngleMode) => fromRadians(Math.acos(v), mode),
  atan: (v: number, mode: AngleMode) => fromRadians(Math.atan(v), mode),
  ln: (v: number) => Math.log(v),
  log: (v: number) => Math.log10(v),
  sqrt: (v: number) => Math.sqrt(v),
  square: (v: number) => v * v,
  cube: (v: number) => v * v * v,
  reciprocal: (v: number) => 1 / v,
  exp: (v: number) => Math.exp(v),
  exp2: (v: number) => Math.pow(2, v),
  exp10: (v: number) => Math.pow(10, v),
  sinh: (v: number) => Math.sinh(v),
  cosh: (v: number) => Math.cosh(v),
  tanh: (v: number) => Math.tanh(v),
};

export function memoryClear(state: CalcState): CalcState {
  return { ...state, memory: 0 };
}

export function memoryRecall(state: CalcState): CalcState {
  if (state.error) return state;
  return {
    ...state,
    display: formatNumber(state.memory),
    waitingForOperand: true,
  };
}

export function memoryAdd(state: CalcState): CalcState {
  if (state.error) return state;
  const current = parseDisplay(state.display);
  if (!Number.isFinite(current)) return withError(state);
  return { ...state, memory: state.memory + current };
}

export function memorySubtract(state: CalcState): CalcState {
  if (state.error) return state;
  const current = parseDisplay(state.display);
  if (!Number.isFinite(current)) return withError(state);
  return { ...state, memory: state.memory - current };
}

export function memoryStore(state: CalcState): CalcState {
  if (state.error) return state;
  const current = parseDisplay(state.display);
  if (!Number.isFinite(current)) return withError(state);
  return { ...state, memory: current };
}

export function toggleAngleMode(state: CalcState): CalcState {
  return {
    ...state,
    angleMode: state.angleMode === "deg" ? "rad" : "deg",
  };
}

export function percentOf(state: CalcState): CalcState {
  if (state.error || state.accumulator == null) return state;
  const current = parseDisplay(state.display);
  if (!Number.isFinite(current)) return withError(state);
  const result = (state.accumulator * current) / 100;
  return {
    ...state,
    display: formatNumber(result),
    waitingForOperand: true,
  };
}
