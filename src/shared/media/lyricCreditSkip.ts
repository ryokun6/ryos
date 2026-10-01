/**
 * Shared lyric credit / metadata skip rules.
 *
 * Used by the server LRC/KRC parser and by client translation pairing so
 * karaoke line counts stay aligned. Prefixes must stay in one place.
 */

/**
 * Prefixes to skip when parsing lyrics (credits, production info, etc.)
 */
export const LYRIC_CREDIT_SKIP_PREFIXES = [
  "作词", "作詞", "作曲", "编曲", "制作", "发行", "出品", "监制", "策划", "统筹",
  "录音", "混音", "母带", "和声", "合声", "合声编写", "版权", "吉他", "贝斯", "鼓", "键盘",
  "企划", "词：", "詞：", "词曲：", "詞曲：", "曲", "男：", "女：", "合：", "OP", "SP", "TME享有",
  "日文词",
  "【未经著作权人许可", "【未經著作權人許可",
  "Produced", "Composed", "Arranged", "Mixed", "Lyrics", "Keyboard",
  "Guitar", "Bass", "Drum", "Vocal", "Original Publisher", "Sub-publisher",
  "Electric Piano", "Synth by", "Recorded by", "Mixed by", "Mastered by",
  "Produced by", "Composed by", "Digital Editing by", "Mix Assisted by",
  "Mix by", "Mix Engineer", "Background vocals", "Background vocals by",
  "Chorus by", "Percussion by", "String by", "Harp by", "Piano by",
  "Piano Arranged by", "Written by", "Additional Production by",
  "Synthesizer", "Programming", "Rhythm Programming", "Background Vocals", "Recording Engineer",
  "Digital Editing", "Digital Edited", "Sessions", "Original publisher",
  "Original Lyrics", "Korean Lyrics", "All Instruments by", "Additional Drums",
  "Digital editing by",
] as const;

/** Treat full-width (：) and half-width (:) colons the same for prefix matching */
export function normalizeColonsForPrefixMatch(s: string): string {
  return s.replace(/\uFF1A/g, ":");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match a credit prefix, allowing optional whitespace around half/full-width colons.
 */
export function lineStartsWithCreditPrefix(line: string, prefix: string): boolean {
  const normLine = normalizeColonsForPrefixMatch(line);
  const normPrefix = normalizeColonsForPrefixMatch(prefix);
  // Multi-word English credits vary in casing (`Rhythm Programming` / `rhythm programming`).
  // Keep short labels like `OP` / `SP` case-sensitive to avoid matching "opening" / "spin".
  const ignoreCase = /\s/.test(normPrefix);
  const lineCmp = ignoreCase ? normLine.toLowerCase() : normLine;
  const prefixCmp = ignoreCase ? normPrefix.toLowerCase() : normPrefix;
  if (lineCmp.startsWith(prefixCmp)) {
    return true;
  }
  if (!normPrefix.endsWith(":")) {
    return false;
  }
  const label = prefixCmp.slice(0, -1);
  if (!label) {
    return false;
  }
  return new RegExp(`^${escapeRegExp(label)}\\s*:\\s*`, ignoreCase ? "i" : undefined).test(
    normLine
  );
}

/**
 * Credit / metadata lines that should not appear as karaoke cues.
 * Title/artist matching stays on the server parser.
 */
export function shouldSkipLyricCreditLine(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.includes("\uFF1A")) {
    return true;
  }

  if (trimmed.includes(" - ")) {
    return true;
  }

  if (
    LYRIC_CREDIT_SKIP_PREFIXES.some((prefix) =>
      lineStartsWithCreditPrefix(trimmed, prefix)
    )
  ) {
    return true;
  }

  if (
    (trimmed.startsWith("(") && trimmed.endsWith(")")) ||
    (trimmed.startsWith("（") && trimmed.endsWith("）"))
  ) {
    return true;
  }

  return false;
}
