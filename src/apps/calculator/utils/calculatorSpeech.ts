import {
  pickSpeechVoiceForLanguage,
  ryOSLocaleToSpeechLanguage,
} from "./calculatorSpeechLocale";

const KEY_TRANSLATION_KEYS: Record<string, string> = {
  "+": "apps.calculator.speech.keys.plus",
  "-": "apps.calculator.speech.keys.minus",
  "−": "apps.calculator.speech.keys.minus",
  "*": "apps.calculator.speech.keys.times",
  "×": "apps.calculator.speech.keys.times",
  "/": "apps.calculator.speech.keys.divide",
  "÷": "apps.calculator.speech.keys.divide",
  ".": "apps.calculator.speech.keys.point",
  "=": "apps.calculator.speech.keys.equals",
  "⌫": "apps.calculator.speech.keys.backspace",
  Backspace: "apps.calculator.speech.keys.backspace",
  "±": "apps.calculator.speech.keys.negate",
  "%": "apps.calculator.speech.keys.percent",
  CE: "apps.calculator.speech.keys.clearEntry",
  C: "apps.calculator.speech.keys.clear",
  MC: "apps.calculator.speech.keys.memoryClear",
  MR: "apps.calculator.speech.keys.memoryRecall",
  "M+": "apps.calculator.speech.keys.memoryPlus",
  "M−": "apps.calculator.speech.keys.memoryMinus",
  MS: "apps.calculator.speech.keys.memoryStore",
  "(": "apps.calculator.speech.keys.openParenthesis",
  ")": "apps.calculator.speech.keys.closeParenthesis",
  π: "apps.calculator.speech.keys.pi",
  e: "apps.calculator.speech.keys.e",
  xʸ: "apps.calculator.speech.keys.power",
  "ʸ√x": "apps.calculator.speech.keys.root",
  "!": "apps.calculator.speech.keys.factorial",
  Rand: "apps.calculator.speech.keys.random",
  Deg: "apps.calculator.speech.keys.degrees",
  Rad: "apps.calculator.speech.keys.radians",
};

export type CalculatorSpeechTranslator = (
  key: string,
  options?: Record<string, string>
) => string;

export const CALCULATOR_SPEECH_QUEUE_MAX = 20;
export const CALCULATOR_SPEECH_UTTERANCE_TIMEOUT_MS = 10_000;
export const DEFAULT_CALCULATOR_SPEECH_LANGUAGE = "en-US";

export type CalculatorSpeechQueueItem = {
  text: string;
  lang: string;
};

export type CalculatorSpeechQueue = {
  items: CalculatorSpeechQueueItem[];
  processing: boolean;
};

export function createCalculatorSpeechQueue(): CalculatorSpeechQueue {
  return { items: [], processing: false };
}

export function enqueueCalculatorSpeech(
  queue: CalculatorSpeechQueue,
  item: CalculatorSpeechQueueItem,
  options?: { maxLength?: number; dedupeConsecutive?: boolean }
): CalculatorSpeechQueue {
  const text = item.text.trim();
  if (!text) return queue;
  const lang = item.lang.trim() || DEFAULT_CALCULATOR_SPEECH_LANGUAGE;
  const maxLength = options?.maxLength ?? CALCULATOR_SPEECH_QUEUE_MAX;
  const last = queue.items.at(-1);
  if (
    options?.dedupeConsecutive &&
    last &&
    last.text === text &&
    last.lang === lang
  ) {
    return queue;
  }
  const items = [...queue.items, { text, lang }];
  while (items.length > maxLength) {
    items.shift();
  }
  return { ...queue, items };
}

export function beginCalculatorSpeechItem(
  queue: CalculatorSpeechQueue
): { queue: CalculatorSpeechQueue; item: CalculatorSpeechQueueItem | null } {
  if (queue.items.length === 0) {
    return { queue: { ...queue, processing: false }, item: null };
  }
  const [item, ...rest] = queue.items;
  return {
    queue: { items: rest, processing: true },
    item,
  };
}

export function finishCalculatorSpeechItem(
  queue: CalculatorSpeechQueue
): CalculatorSpeechQueue {
  return { ...queue, processing: false };
}

export function resetCalculatorSpeechQueue(): CalculatorSpeechQueue {
  return createCalculatorSpeechQueue();
}

export function formatKeyLabel(
  label: string,
  t: CalculatorSpeechTranslator
): string {
  const translationKey = KEY_TRANSLATION_KEYS[label];
  if (translationKey) return t(translationKey);
  if (/^\d$/.test(label)) return label;

  const functionKey = `apps.calculator.speech.keys.${label.toLowerCase()}`;
  const translated = t(functionKey);
  if (translated !== functionKey) return translated;

  return label.replace(/\s+/g, " ").trim();
}

export function formatDisplayForSpeech(
  display: string,
  t: CalculatorSpeechTranslator
): string {
  if (display === "Error") {
    return t("apps.calculator.speech.error");
  }

  const cleaned = display.replace(/,/g, "");
  if (cleaned.startsWith("-")) {
    return t("apps.calculator.speech.negative", { value: cleaned.slice(1) });
  }

  const parts = cleaned.toLowerCase().split("e");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return t("apps.calculator.speech.scientific", {
      mantissa: parts[0],
      exponent: parts[1],
    });
  }

  return cleaned;
}

export type CalculatorSpeechSpeakOptions = {
  locale?: string;
  rate?: number;
  /** Skip enqueue when identical to the previous queued utterance. */
  dedupeConsecutive?: boolean;
};

type SpeechSynthAdapter = {
  getVoices: () => SpeechSynthesisVoice[];
  resume: () => void;
  speak: (utterance: SpeechSynthesisUtterance) => void;
  cancel: () => void;
  addVoicesChangedListener: (listener: () => void) => void;
  removeVoicesChangedListener: (listener: () => void) => void;
};

let queueState = createCalculatorSpeechQueue();
let defaultRate = 1;
let voicesListenerAttached = false;

function getSynth(): SpeechSynthesis | null {
  if (typeof window === "undefined") return null;
  return window.speechSynthesis ?? null;
}

function getAdapter(): SpeechSynthAdapter | null {
  const synth = getSynth();
  if (!synth) return null;
  return {
    getVoices: () => synth.getVoices(),
    resume: () => synth.resume(),
    speak: (utterance) => synth.speak(utterance),
    cancel: () => synth.cancel(),
    addVoicesChangedListener: (listener) =>
      synth.addEventListener("voiceschanged", listener),
    removeVoicesChangedListener: (listener) =>
      synth.removeEventListener("voiceschanged", listener),
  };
}

function ensureVoicesListener(adapter: SpeechSynthAdapter) {
  if (voicesListenerAttached) return;
  voicesListenerAttached = true;
  // Warm the voice list so utterances can pick a language-matched voice as
  // soon as the browser has loaded them. We never block on this — see below.
  const onVoicesChanged = () => adapter.getVoices();
  adapter.addVoicesChangedListener(onVoicesChanged);
  adapter.getVoices();
}

function drainSpeechQueue(adapter: SpeechSynthAdapter) {
  if (queueState.processing) return;

  const started = beginCalculatorSpeechItem(queueState);
  queueState = started.queue;
  if (!started.item) return;

  const { text, lang } = started.item;
  const rate = defaultRate;

  // iOS Safari only honors speechSynthesis.speak() when it is invoked
  // synchronously inside the user gesture (button tap / key press) that
  // triggered it. Deferring via Promise.then or setTimeout makes Safari treat
  // the call as non-user-initiated and silently drop the utterance. Calculator
  // speech always originates from a gesture, so we speak synchronously here.
  // We intentionally do NOT wait for `voiceschanged`; the utterance `lang`
  // already lets the engine select an appropriate voice, and the first
  // in-gesture utterance "unlocks" synthesis for the rest of the session
  // (subsequent queued items drain from onend handlers).
  adapter.resume();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  utterance.rate = rate;

  const voice = pickSpeechVoiceForLanguage(adapter.getVoices(), lang);
  if (voice) {
    utterance.voice = voice;
  }

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeoutId);
    queueState = finishCalculatorSpeechItem(queueState);
    drainSpeechQueue(adapter);
  };

  utterance.onend = finish;
  utterance.onerror = finish;
  const timeoutId = window.setTimeout(
    finish,
    CALCULATOR_SPEECH_UTTERANCE_TIMEOUT_MS
  );

  adapter.speak(utterance);
}

export function speakCalculatorText(
  text: string,
  options?: CalculatorSpeechSpeakOptions
): void {
  const adapter = getAdapter();
  if (!adapter || !text.trim()) return;

  defaultRate = options?.rate ?? 1;
  ensureVoicesListener(adapter);
  queueState = enqueueCalculatorSpeech(
    queueState,
    {
      text,
      lang: ryOSLocaleToSpeechLanguage(options?.locale),
    },
    { dedupeConsecutive: options?.dedupeConsecutive }
  );
  drainSpeechQueue(adapter);
}

export function stopCalculatorSpeech(): void {
  const adapter = getAdapter();
  queueState = resetCalculatorSpeechQueue();
  adapter?.cancel();
}

/** Test helper to inspect or reset module queue state. */
export function __getCalculatorSpeechQueueStateForTests(): CalculatorSpeechQueue {
  return queueState;
}

export function __resetCalculatorSpeechStateForTests(): void {
  queueState = resetCalculatorSpeechQueue();
  defaultRate = 1;
  voicesListenerAttached = false;
}

export function __drainCalculatorSpeechQueueForTests(
  adapter: SpeechSynthAdapter
): void {
  drainSpeechQueue(adapter);
}
