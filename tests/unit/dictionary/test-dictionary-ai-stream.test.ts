import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DICTIONARY_AI_STREAM_HEADERS,
  extrasToDictionaryNotes,
  parseDictionaryAiNotes,
  reduceDictionaryAiUiChunk,
  takeDictionaryAiSseEvents,
} from "../../../src/shared/dictionaryAiNotes";

describe("dictionary AI extras stream", () => {
  test("keeps a partial SSE frame until the blank line arrives", () => {
    const first = takeDictionaryAiSseEvents(
      'data: {"type":"text-delta","delta":"The"}\n\ndata: {"type":"text-del'
    );
    expect(first.events).toEqual(['{"type":"text-delta","delta":"The"}']);
    expect(first.rest).toBe('data: {"type":"text-del');
    const second = takeDictionaryAiSseEvents(`${first.rest}ta","delta":" word"}\n\n`);
    expect(second.events).toEqual(['{"type":"text-delta","delta":" word"}']);
    expect(second.rest).toBe("");
  });

  test("ignores the SSE done sentinel and appends text deltas", () => {
    const { events } = takeDictionaryAiSseEvents(
      'data: {"type":"text-start","id":"1"}\n\ndata: {"type":"text-delta","id":"1","delta":"Used "}\n\ndata: [DONE]\n\n'
    );
    let notes = "";
    for (const event of events) {
      notes = reduceDictionaryAiUiChunk(notes, JSON.parse(event)).notes;
    }
    expect(notes).toBe("Used ");
  });

  test("surfaces a stream error chunk", () => {
    const next = reduceDictionaryAiUiChunk("partial", {
      type: "error",
      errorText: "ai_unavailable",
    });
    expect(next.notes).toBe("partial");
    expect(next.error).toBe("ai_unavailable");
  });

  test("shows usage prose as it arrives and hides an unfinished synonym", () => {
    const partial = parseDictionaryAiNotes(
      "Used formally.<<<NUANCE>>>\nMore polite than big.\n<<<SYNONYMS>>>\nlarge\nbi",
      "en"
    );
    expect(partial.usageNotes).toBe("Used formally.");
    expect(partial.nuance).toBe("More polite than big.");
    expect(partial.synonyms).toEqual(["large"]);
    const done = parseDictionaryAiNotes(
      "Used formally.\n<<<NUANCE>>>\nMore polite than big.\n<<<SYNONYMS>>>\nlarge\nbig\n<<<EXAMPLES>>>\nIt is large. || C'est grand.",
      "en",
      { complete: true }
    );
    expect(done.synonyms).toEqual(["large", "big"]);
    expect(done.examples[0]).toEqual({ text: "It is large.", translation: "C'est grand." });
  });

  test("hides a marker the model has only started to write", () => {
    const extras = parseDictionaryAiNotes("Used formally.<<<NUA", "en");
    expect(extras.usageNotes).toBe("Used formally.");
    expect(extras.nuance).toBeUndefined();
  });

  test("parses Japanese example furigana once the line is complete", () => {
    const extras = parseDictionaryAiNotes(
      "学校で使う。\n<<<EXAMPLES>>>\n学校(がっこう)に行く || go to school\n",
      "ja",
      { complete: true }
    );
    expect(extras.examples[0]?.text).toBe("学校に行く");
    expect(extras.examples[0]?.furigana?.[0]).toEqual({ text: "学校", reading: "がっこう" });
    expect(extras.examples[0]?.translation).toBe("go to school");
  });

  test("rebuilds legacy cached extras into notes the parser can render immediately", () => {
    const notes = extrasToDictionaryNotes({
      usageNotes: "lasting briefly",
      nuance: "shorter than brief",
      synonyms: ["fleeting"],
      examples: [{ text: "a ephemeral joy", translation: "une joie" }],
    });
    const extras = parseDictionaryAiNotes(notes, "en", { complete: true });
    expect(extras.usageNotes).toBe("lasting briefly");
    expect(extras.nuance).toBe("shorter than brief");
    expect(extras.synonyms).toEqual(["fleeting"]);
    expect(extras.examples[0]?.translation).toBe("une joie");
  });

  test("streams notes with the same anti-buffer headers Chats uses", () => {
    expect(DICTIONARY_AI_STREAM_HEADERS["Cache-Control"]).toContain("no-cache");
    expect(DICTIONARY_AI_STREAM_HEADERS["Cache-Control"]).toContain("no-transform");
    expect(DICTIONARY_AI_STREAM_HEADERS["X-Accel-Buffering"]).toBe("no");
    expect(DICTIONARY_AI_STREAM_HEADERS["Content-Encoding"]).toBe("identity");
    const route = readFileSync(new URL("../../../api/dictionary/ai.ts", import.meta.url), "utf8");
    expect(route).toContain("pipeUIMessageStreamToResponse");
    expect(route).toContain("DICTIONARY_AI_STREAM_HEADERS");
    expect(route).toContain("smoothStream");
    expect(route).not.toContain("partialOutputStream");
  });
});
