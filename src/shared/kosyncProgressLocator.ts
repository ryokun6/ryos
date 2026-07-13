/**
 * KOSync `progress` string classification and formatting shared by the Books
 * reader (browser) and the kosync API bridge (server).
 *
 * CrossPoint / KOReader use KO-style XPath:
 *   /body/DocFragment[N]/body/div[1]/p[2]/text()[1].96
 */

const KO_STYLE_XPATH_RE = /^\/body\/DocFragment\[\d+\]/i;
const EPUB_CFI_RE = /^epubcfi\(/i;

export function isKoStyleXPath(progress: string): boolean {
  return KO_STYLE_XPATH_RE.test(progress.trim());
}

export function isEpubCfi(progress: string): boolean {
  return EPUB_CFI_RE.test(progress.trim());
}

/** Non-XPath placeholder CrossPoint uses with byte-weighted `percentage`. */
export function kosyncPercentagePlaceholder(percentage: number): string {
  const clamped = Math.min(1, Math.max(0, percentage));
  return String(Math.round(clamped * 10000));
}

export interface ParsedKoXPath {
  /** 1-based DocFragment index from the XPath string. */
  docFragmentIndex: number;
  steps: ReadonlyArray<{ tag: string; index: number }>;
  /** 1-based; defaults to 1 when the XPath omits text()[N]. */
  textNodeIndex: number;
  /** Unicode codepoint offset within the text node; 0 when absent. */
  charOffset: number;
}

export function parseKoXPath(xpath: string): ParsedKoXPath | null {
  const trimmed = xpath.trim();
  if (!isKoStyleXPath(trimmed)) return null;

  const fragMatch = /^\/body\/DocFragment\[(\d+)\]/i.exec(trimmed);
  if (!fragMatch) return null;
  const docFragmentIndex = Number(fragMatch[1]);
  if (!Number.isFinite(docFragmentIndex) || docFragmentIndex < 1) return null;

  const bodyPrefix = `/body/DocFragment[${fragMatch[1]}]/body`;
  if (!trimmed.startsWith(bodyPrefix)) return null;

  let rest = trimmed.slice(bodyPrefix.length);
  let textNodeIndex = 1;
  let charOffset = 0;

  const textMatch = /\/text\(\)\[(\d+)\]\.(\d+)$/.exec(rest);
  if (textMatch) {
    rest = rest.slice(0, textMatch.index);
    textNodeIndex = Number(textMatch[1]);
    charOffset = Number(textMatch[2]);
    if (
      !Number.isFinite(textNodeIndex) ||
      textNodeIndex < 1 ||
      !Number.isFinite(charOffset) ||
      charOffset < 0
    ) {
      return null;
    }
  } else {
    const dotOnly = /\.(\d+)$/.exec(rest);
    if (dotOnly) {
      rest = rest.slice(0, dotOnly.index);
      charOffset = Number(dotOnly[1]);
      if (!Number.isFinite(charOffset) || charOffset < 0) return null;
    }
  }

  const steps: { tag: string; index: number }[] = [];
  if (rest.length > 0) {
    if (!rest.startsWith("/")) return null;
    const segments = rest.split("/").filter(Boolean);
    for (const segment of segments) {
      const bracket = segment.indexOf("[");
      const tag =
        bracket >= 0 ? segment.slice(0, bracket) : segment;
      if (!tag) return null;
      let index = 1;
      if (bracket >= 0) {
        const close = segment.indexOf("]", bracket + 1);
        if (close < 0) return null;
        index = Number(segment.slice(bracket + 1, close));
        if (!Number.isFinite(index) || index < 1) return null;
      }
      steps.push({ tag: tag.toLowerCase(), index });
    }
  }

  return { docFragmentIndex, steps, textNodeIndex, charOffset };
}
