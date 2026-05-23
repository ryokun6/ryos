/**
 * Block-based segmentation for assistant message TTS.
 *
 * Splits an assistant `UIMessage` into "speech blocks" — paragraph-sized
 * chunks that can be:
 *   - queued individually into `useTtsQueue` (so playback streams smoothly),
 *   - identified by a stable `blockId` (`{messageId}:p{partIndex}:b{blockIndex}`),
 *   - matched 1:1 against rendered DOM blocks in `ChatMessageItem`
 *     for live "currently spoken" highlighting.
 *
 * Why paragraph boundaries:
 *   Markdown renders paragraphs (`\n\n`-separated text) as discrete DOM
 *   elements. Character offsets into raw markdown text don't survive the
 *   render — links/code/lists rewrite the DOM — so we can't highlight by
 *   range. Paragraph blocks always render to a contiguous DOM subtree,
 *   so a `data-tts-block-id` on the wrapper is enough for the highlight
 *   class to land on the right element.
 *
 * Single-paragraph messages produce one block. Tool-call parts and other
 * non-text parts are ignored; their position in the parts array still
 * shifts subsequent blocks' `partIndex` so IDs stay stable as the
 * message grows.
 */

import type { UIMessage } from "@ai-sdk/react";

export interface SpeechBlock {
  /** Stable identifier, e.g. `msg_abc:p0:b2`. */
  blockId: string;
  /** Raw markdown text of this block (no paragraph terminator). */
  text: string;
  /**
   * True iff the source had a `\n\n` (or end-of-message) terminator after
   * this block. While a message is still streaming, the final block is
   * typically `isTerminated: false` until the next paragraph arrives or
   * `onFinish` fires.
   */
  isTerminated: boolean;
}

type MessagePart = { type: string; text?: string };

const PARAGRAPH_SPLIT_RE = /\n{2,}/g;
const URGENT_PREFIX_RE = /^!!!!\s*/;

/**
 * Split a single text part into ordered speech blocks.
 *
 * Behavior:
 *  - Splits on runs of 2+ newlines (markdown paragraph breaks).
 *  - Trims trailing whitespace from each block; empty blocks are dropped.
 *  - Strips the leading `!!!!` urgent-message prefix the way the renderer does.
 *  - The final block is marked `isTerminated: true` only if the source
 *    text ended with a paragraph break (i.e. there is "nothing after"
 *    the last `\n\n`). This lets the caller decide when it's safe to
 *    queue a streaming-final block to TTS.
 */
export function splitTextIntoBlocks(text: string): {
  text: string;
  isTerminated: boolean;
}[] {
  const stripped = text.replace(URGENT_PREFIX_RE, "");
  if (!stripped) return [];

  const blocks: { text: string; isTerminated: boolean }[] = [];
  PARAGRAPH_SPLIT_RE.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = PARAGRAPH_SPLIT_RE.exec(stripped)) !== null) {
    const piece = stripped.slice(last, match.index).trimEnd();
    if (piece) {
      blocks.push({ text: piece, isTerminated: true });
    }
    last = PARAGRAPH_SPLIT_RE.lastIndex;
  }

  if (last < stripped.length) {
    const tail = stripped.slice(last).trimEnd();
    if (tail) {
      // No `\n\n` after the tail → still streaming or single-paragraph.
      blocks.push({ text: tail, isTerminated: false });
    }
  }

  return blocks;
}

/**
 * Compute all speech blocks for an assistant message across every text
 * part. Block IDs include the originating part index so they stay
 * stable as new text parts and tool-call parts are appended.
 */
export function computeSpeechBlocks(message: UIMessage): SpeechBlock[] {
  if (!message.parts) return [];

  const blocks: SpeechBlock[] = [];

  message.parts.forEach((rawPart, partIndex) => {
    const part = rawPart as MessagePart;
    if (part.type !== "text" || !part.text) return;

    const partBlocks = splitTextIntoBlocks(part.text);
    partBlocks.forEach((block, blockIndex) => {
      blocks.push({
        blockId: `${message.id}:p${partIndex}:b${blockIndex}`,
        text: block.text,
        isTerminated: block.isTerminated,
      });
    });
  });

  return blocks;
}

/**
 * Build the same `blockId` used by `computeSpeechBlocks`, for renderers
 * that already know the message id, part index, and block index.
 */
export function buildSpeechBlockId(
  messageId: string,
  partIndex: number,
  blockIndex: number
): string {
  return `${messageId}:p${partIndex}:b${blockIndex}`;
}
