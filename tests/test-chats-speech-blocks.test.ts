/**
 * Locks the paragraph-based block splitter used for Chats TTS + highlighting.
 *
 * Block boundaries == DOM boundaries. A regression here would silently
 * break the live "currently spoken" highlight because the auto-stream
 * TTS would queue blocks that no rendered DOM element corresponds to.
 */

import { describe, expect, test } from "bun:test";
import type { UIMessage } from "@ai-sdk/react";
import {
  splitTextIntoBlocks,
  computeSpeechBlocks,
  buildSpeechBlockId,
} from "../src/apps/chats/utils/speechBlocks";

const msg = (
  id: string,
  parts: Array<{ type: string; text?: string }>
): UIMessage =>
  ({
    id,
    role: "assistant",
    parts,
  }) as unknown as UIMessage;

describe("splitTextIntoBlocks", () => {
  test("returns empty array for empty input", () => {
    expect(splitTextIntoBlocks("")).toEqual([]);
  });

  test("single paragraph → one open (unterminated) block", () => {
    expect(splitTextIntoBlocks("hello world")).toEqual([
      { text: "hello world", isTerminated: false },
    ]);
  });

  test("two paragraphs → first terminated, second open", () => {
    expect(splitTextIntoBlocks("para one.\n\npara two.")).toEqual([
      { text: "para one.", isTerminated: true },
      { text: "para two.", isTerminated: false },
    ]);
  });

  test("trailing blank line marks the final block as terminated", () => {
    expect(splitTextIntoBlocks("done.\n\n")).toEqual([
      { text: "done.", isTerminated: true },
    ]);
  });

  test("runs of 3+ newlines still count as a single paragraph break", () => {
    expect(splitTextIntoBlocks("a\n\n\n\nb")).toEqual([
      { text: "a", isTerminated: true },
      { text: "b", isTerminated: false },
    ]);
  });

  test("strips the `!!!!` urgent-message prefix", () => {
    expect(splitTextIntoBlocks("!!!! urgent thing")).toEqual([
      { text: "urgent thing", isTerminated: false },
    ]);
  });

  test("preserves single newlines within a block (markdown list)", () => {
    expect(splitTextIntoBlocks("- one\n- two\n- three")).toEqual([
      { text: "- one\n- two\n- three", isTerminated: false },
    ]);
  });

  test("trims trailing whitespace per block but keeps inner spaces", () => {
    expect(splitTextIntoBlocks("foo   \n\nbar baz")).toEqual([
      { text: "foo", isTerminated: true },
      { text: "bar baz", isTerminated: false },
    ]);
  });

  test("drops fully empty intermediate blocks", () => {
    expect(splitTextIntoBlocks("a\n\n   \n\nb")).toEqual([
      { text: "a", isTerminated: true },
      { text: "b", isTerminated: false },
    ]);
  });
});

describe("computeSpeechBlocks", () => {
  test("ignores tool-call parts but keeps their position in IDs", () => {
    const message = msg("m1", [
      { type: "text", text: "intro." },
      { type: "tool-launchApp" },
      { type: "text", text: "after the tool." },
    ]);
    const blocks = computeSpeechBlocks(message);
    expect(blocks).toEqual([
      { blockId: "m1:p0:b0", text: "intro.", isTerminated: false },
      { blockId: "m1:p2:b0", text: "after the tool.", isTerminated: false },
    ]);
  });

  test("ids stay stable as new parts get appended later", () => {
    const initial = msg("m2", [
      { type: "text", text: "first.\n\nsecond." },
    ]);
    const grown = msg("m2", [
      { type: "text", text: "first.\n\nsecond." },
      { type: "tool-foo" },
      { type: "text", text: "third." },
    ]);
    const before = computeSpeechBlocks(initial).map((b) => b.blockId);
    const after = computeSpeechBlocks(grown).map((b) => b.blockId);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toEqual(["m2:p0:b0", "m2:p0:b1", "m2:p2:b0"]);
  });

  test("returns empty array when message has no text parts", () => {
    const message = msg("m3", [{ type: "tool-foo" }]);
    expect(computeSpeechBlocks(message)).toEqual([]);
  });

  test("multi-paragraph text part produces sequential block indices", () => {
    const message = msg("m4", [
      { type: "text", text: "alpha.\n\nbeta.\n\ngamma." },
    ]);
    const blocks = computeSpeechBlocks(message);
    expect(blocks.map((b) => b.blockId)).toEqual([
      "m4:p0:b0",
      "m4:p0:b1",
      "m4:p0:b2",
    ]);
    expect(blocks[0].isTerminated).toBe(true);
    expect(blocks[1].isTerminated).toBe(true);
    expect(blocks[2].isTerminated).toBe(false);
  });
});

describe("buildSpeechBlockId", () => {
  test("matches the format produced by computeSpeechBlocks", () => {
    const message = msg("xyz", [
      { type: "text", text: "one.\n\ntwo." },
    ]);
    const [b0, b1] = computeSpeechBlocks(message);
    expect(b0.blockId).toBe(buildSpeechBlockId("xyz", 0, 0));
    expect(b1.blockId).toBe(buildSpeechBlockId("xyz", 0, 1));
  });
});
