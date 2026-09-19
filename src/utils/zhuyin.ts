/**
 * Convert Mandarin pinyin syllables to Zhuyin (Bopomofo / 注音).
 * Readings come from pinyin-pro with Traditional-character recognition enabled.
 */
import { pinyin } from "pinyin-pro";

const INITIAL_TO_ZHUYIN: Record<string, string> = {
  b: "\u3105",
  p: "\u3106",
  m: "\u3107",
  f: "\u3108",
  d: "\u3109",
  t: "\u310A",
  n: "\u310B",
  l: "\u310C",
  g: "\u310D",
  k: "\u310E",
  h: "\u310F",
  j: "\u3110",
  q: "\u3111",
  x: "\u3112",
  zh: "\u3113",
  ch: "\u3114",
  sh: "\u3115",
  r: "\u3116",
  z: "\u3117",
  c: "\u3118",
  s: "\u3119",
};

const FINAL_TO_ZHUYIN: Record<string, string> = {
  a: "\u311A",
  o: "\u311B",
  e: "\u311C",
  "\u00ea": "\u311D",
  ai: "\u311E",
  ei: "\u311F",
  ao: "\u3120",
  ou: "\u3121",
  an: "\u3122",
  en: "\u3123",
  ang: "\u3124",
  eng: "\u3125",
  er: "\u3126",
  i: "\u3127",
  ia: "\u3127\u311A",
  io: "\u3127\u311B",
  ie: "\u3127\u311D",
  iai: "\u3127\u311E",
  iao: "\u3127\u3120",
  iu: "\u3127\u3121",
  ian: "\u3127\u3122",
  in: "\u3127\u3123",
  iang: "\u3127\u3124",
  ing: "\u3127\u3125",
  u: "\u3128",
  ua: "\u3128\u311A",
  uo: "\u3128\u311B",
  uai: "\u3128\u311E",
  ui: "\u3128\u311F",
  uan: "\u3128\u3122",
  un: "\u3128\u3123",
  uang: "\u3128\u3124",
  ong: "\u3128\u3125",
  "\u00fc": "\u3129",
  "\u00fce": "\u3129\u311D",
  "\u00fcan": "\u3129\u3122",
  "\u00fcn": "\u3129\u3123",
  iong: "\u3129\u3125",
};

const Y_FINAL_TO_ZHUYIN: Record<string, string> = {
  i: "\u3127",
  a: "\u3127\u311A",
  o: "\u3127\u311B",
  e: "\u3127\u311D",
  ao: "\u3127\u3120",
  ou: "\u3127\u3121",
  an: "\u3127\u3122",
  in: "\u3127\u3123",
  ang: "\u3127\u3124",
  ing: "\u3127\u3125",
  u: "\u3129",
  "\u00fc": "\u3129",
  ue: "\u3129\u311D",
  "\u00fce": "\u3129\u311D",
  uan: "\u3129\u3122",
  un: "\u3129\u3123",
  ong: "\u3129\u3125",
};

const W_FINAL_TO_ZHUYIN: Record<string, string> = {
  u: "\u3128",
  a: "\u3128\u311A",
  o: "\u3128\u311B",
  ai: "\u3128\u311E",
  ei: "\u3128\u311F",
  an: "\u3128\u3122",
  en: "\u3128\u3123",
  ang: "\u3128\u3124",
  eng: "\u3128\u3125",
};

const EMPTY_RHYME_INITIALS = new Set(["zh", "ch", "sh", "r", "z", "c", "s"]);

const ZHUYIN_TONE_MARK = {
  2: "\u02CA",
  3: "\u02C7",
  4: "\u02CB",
} as const;

export type PinyinSyllableParts = {
  pinyin: string;
  initial: string;
  final: string;
  tone: number;
};

function normalizeFinal(final: string): string {
  return final.replaceAll("v", "\u00fc");
}

export function applyZhuyinTone(base: string, tone: number): string {
  if (!base) return "";
  if (tone === 5) return `\u02D9${base}`;
  if (tone === 2 || tone === 3 || tone === 4) {
    return `${base}${ZHUYIN_TONE_MARK[tone]}`;
  }
  return base;
}

/**
 * Map one toneless pinyin syllable (plus tone number) to Zhuyin.
 * `initial`/`final` should match pinyin-pro `type: "all"` + `toneType: "none"`.
 */
export function pinyinSyllableToZhuyin(parts: PinyinSyllableParts): string {
  const syllable = parts.pinyin.trim().toLowerCase().replaceAll("v", "\u00fc");
  const initial = parts.initial.toLowerCase();
  const final = normalizeFinal(parts.final);
  const tone = Number.isFinite(parts.tone) ? parts.tone : 0;

  if (!syllable && !initial && !final) return "";

  if (syllable === "ng" || (initial === "n" && final === "g")) {
    return applyZhuyinTone("\u3123", tone);
  }
  if (syllable === "m" || (initial === "m" && final === "")) {
    return applyZhuyinTone("\u3107", tone);
  }
  if (syllable === "n" && final === "") {
    return applyZhuyinTone("\u310B", tone);
  }
  if (syllable === "hm" || syllable === "hng") {
    return applyZhuyinTone("\u310F\u312F", tone);
  }

  if (initial === "y") {
    const mapped = Y_FINAL_TO_ZHUYIN[final] ?? Y_FINAL_TO_ZHUYIN[syllable.slice(1)];
    return applyZhuyinTone(mapped ?? "", tone);
  }

  if (initial === "w") {
    const mapped = W_FINAL_TO_ZHUYIN[final] ?? W_FINAL_TO_ZHUYIN[syllable.slice(1)];
    return applyZhuyinTone(mapped ?? "", tone);
  }

  if (EMPTY_RHYME_INITIALS.has(initial) && final === "i") {
    return applyZhuyinTone(INITIAL_TO_ZHUYIN[initial] ?? "", tone);
  }

  if (!initial) {
    return applyZhuyinTone(FINAL_TO_ZHUYIN[final] ?? FINAL_TO_ZHUYIN[syllable] ?? "", tone);
  }

  const zhuyinInitial = INITIAL_TO_ZHUYIN[initial] ?? "";
  const zhuyinFinal = FINAL_TO_ZHUYIN[final] ?? "";
  return applyZhuyinTone(`${zhuyinInitial}${zhuyinFinal}`, tone);
}

const PINYIN_ALL_OPTIONS = {
  type: "all" as const,
  toneType: "none" as const,
  traditional: true,
};

/**
 * Per-character Zhuyin readings. Non-Hanzi positions are empty strings.
 */
export function hanziToZhuyinReadings(text: string): string[] {
  const results = pinyin(text, PINYIN_ALL_OPTIONS);
  return results.map((item) => {
    if (!item.isZh) return "";
    return pinyinSyllableToZhuyin({
      pinyin: item.pinyin,
      initial: item.initial,
      final: item.final,
      tone: item.num,
    });
  });
}

/**
 * Concatenate Zhuyin for Chinese runs; leave non-Hanzi as authored.
 */
export function hanziToZhuyin(text: string): string {
  const results = pinyin(text, PINYIN_ALL_OPTIONS);
  let output = "";
  for (const item of results) {
    if (!item.isZh) {
      output += item.origin;
      continue;
    }
    output += pinyinSyllableToZhuyin({
      pinyin: item.pinyin,
      initial: item.initial,
      final: item.final,
      tone: item.num,
    });
  }
  return output || text;
}

/** Bopomofo letters (U+3105-U+312F). */
const ZHUYIN_LETTER_RE = /[\u3105-\u312F]/;

export function textContainsZhuyin(text: string): boolean {
  return ZHUYIN_LETTER_RE.test(text);
}
