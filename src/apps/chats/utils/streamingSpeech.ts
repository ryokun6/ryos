/**
 * Incremental assistant speech: split streamed markdown-ish text into
 * finalized paragraphs without waiting for the full assistant message.
 *
 * A paragraph boundary is a blank line (`\r?\n\r?\n`). Additional blank lines after
 * that are folded into the same gap so multiple empty lines behave like Markdown.
 */

export type StreamingSpeechParagraph = {
  /** Inclusive UTF-16 index where this paragraph starts in raw streamed text */
  rawStart: number;
  /** Exclusive UTF-16 index of the paragraph text (boundary starts at `\r?\n`) */
  rawEnd: number;
};

function findParagraphBreakStart(content: string, absStart: number): number {
  if (absStart >= content.length) return -1;
  const sliced = absStart === 0 ? content : content.slice(absStart);
  const m = /\r?\n\r?\n/.exec(sliced);
  if (!m || m.index === undefined) return -1;
  return absStart + m.index;
}

/** Fold extra `\r` / `\n` characters after crossing a `\n\n` separator. */
function skipAdditionalBlankLines(content: string, from: number): number {
  let i = from;
  while (i < content.length) {
    let advanced = false;
    if (content.startsWith("\r\n", i)) {
      i += 2;
      advanced = true;
    } else if (content[i] === "\r" || content[i] === "\n") {
      i += 1;
      advanced = true;
    }
    if (!advanced) break;
  }
  return i;
}

/**
 * Consume zero or more complete paragraphs beginning at `fromIndex`.
 *
 * Each paragraph ends strictly before `\r?\n\r?\n`. Trailing bytes that belong to
 * a paragraph still being streamed are not returned — callers finalize those on
 * `onFinish`, or discard them when the stream aborts mid-paragraph.
 */
export function extractCompletedParagraphRanges(
  content: string,
  fromIndex: number,
): { paragraphs: StreamingSpeechParagraph[]; nextIndex: number } {
  const paragraphs: StreamingSpeechParagraph[] = [];
  let i = Math.max(0, fromIndex);

  while (i < content.length) {
    const breakStart = findParagraphBreakStart(content, i);
    if (breakStart === -1) break;

    const rawStart = i;
    const rawEnd = breakStart;
    const rawParagraph = content.slice(rawStart, rawEnd);
    if (rawParagraph.trimEnd().length === 0) {
      const gapMatch = /\r?\n\r?\n/.exec(content.slice(breakStart));
      const skipped = gapMatch ? gapMatch[0].length : 2;
      i = skipAdditionalBlankLines(content, breakStart + skipped);
      continue;
    }

    paragraphs.push({ rawStart, rawEnd });
    const gapMatch = /\r?\n\r?\n/.exec(content.slice(breakStart));
    const skipped = gapMatch ? gapMatch[0].length : 2;
    i = skipAdditionalBlankLines(content, breakStart + skipped);
  }

  return { paragraphs, nextIndex: i };
}
