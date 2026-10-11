import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  entryToDictionaryFallbackText,
  parseDictionaryAiFallback,
} from "../../../src/shared/dictionaryAiFallback";
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

describe("dictionary AI fallback stream", () => {
  test("shows the headword as it arrives and holds an unfinished reading", () => {
    const partial = parseDictionaryAiFallback("<<<ENTRY>>>\nflib\n/fl", "flibberty", "en");
    expect(partial.status).toBe("entry");
    expect(partial.entry?.id).toBe("ai:en:flibberty");
    expect(partial.entry?.headword).toBe("flib");
    expect(partial.entry?.ipa).toBeUndefined();
    const readingDone = parseDictionaryAiFallback("<<<ENTRY>>>\nflib\n/flɪb/\n", "flibberty", "en");
    expect(readingDone.entry?.ipa).toBe("/flɪb/");
  });

  test("streams the open gloss and hides a marker the model has only started", () => {
    const partial = parseDictionaryAiFallback(
      "<<<ENTRY>>>\nflib\n/flɪb/\n<<<SENSE>>>\nnoun | a made-up<<<EXAM",
      "flib",
      "en"
    );
    expect(partial.entry?.senses[0]).toEqual({
      partOfSpeech: "noun",
      glosses: ["a made-up"],
    });
    expect(partial.streamingSenseIndex).toBe(0);
    expect(partial.entry?.senses[0]?.examples).toBeUndefined();
  });

  test("keeps an unfinished example and synonym off the entry until the line closes", () => {
    const partialExample = parseDictionaryAiFallback(
      [
        "<<<ENTRY>>>",
        "flib",
        "/flɪb/",
        "<<<SENSE>>>",
        "noun | a made-up word",
        "<<<EXAMPLE>>>",
        "It was flib. || C'était flib.",
        "Still ty",
      ].join("\n"),
      "flib",
      "en"
    );
    expect(partialExample.streamingSenseIndex).toBeNull();
    expect(partialExample.entry?.senses[0]?.examples).toEqual([
      { text: "It was flib.", translation: "C'était flib." },
    ]);
    const partialSynonyms = parseDictionaryAiFallback(
      [
        "<<<ENTRY>>>",
        "flib",
        "/flɪb/",
        "<<<SENSE>>>",
        "noun | a made-up word",
        "<<<SYNONYMS>>>",
        "nonsense",
        "gib",
      ].join("\n"),
      "flib",
      "en"
    );
    expect(partialSynonyms.entry?.synonyms).toEqual(["nonsense"]);
    const done = parseDictionaryAiFallback(
      [
        "<<<ENTRY>>>",
        "flib",
        "/flɪb/",
        "<<<SENSE>>>",
        "noun | a made-up word",
        "<<<EXAMPLE>>>",
        "It was flib. || C'était flib.",
        "<<<SYNONYMS>>>",
        "nonsense",
        "gibberish",
      ].join("\n"),
      "flib",
      "en",
      { complete: true }
    );
    expect(done.entry?.synonyms).toEqual(["nonsense", "gibberish"]);
    expect(done.streamingSenseIndex).toBeNull();
  });

  test("parses a finished Japanese example with furigana", () => {
    const parsed = parseDictionaryAiFallback(
      "<<<ENTRY>>>\n学校\nがっこう\n<<<SENSE>>>\nnoun | school\n<<<EXAMPLE>>>\n学校(がっこう)に行く || go to school\n",
      "学校",
      "ja",
      { complete: true }
    );
    expect(parsed.entry?.reading).toBe("がっこう");
    expect(parsed.entry?.senses[0]?.examples?.[0]?.text).toBe("学校に行く");
    expect(parsed.entry?.senses[0]?.examples?.[0]?.furigana?.[0]).toEqual({
      text: "学校",
      reading: "がっこう",
    });
  });

  test("treats a not-found marker as no entry", () => {
    const parsed = parseDictionaryAiFallback("<<<NOT_FOUND>>>", "zzzznotaword", "en", {
      complete: true,
    });
    expect(parsed.status).toBe("not_found");
    expect(parsed.entry).toBeNull();
  });

  test("rebuilds a legacy cached entry into text the parser can render", () => {
    const notes = entryToDictionaryFallbackText({
      id: "ai:en:old",
      lang: "en",
      headword: "ephemeral",
      ipa: "/ɪˈfɛm.ər.əl/",
      senses: [
        {
          partOfSpeech: "adjective",
          glosses: ["lasting briefly"],
          examples: [{ text: "ephemeral joy", translation: "joie éphémère" }],
        },
      ],
      synonyms: ["fleeting"],
      source: "ai",
    });
    const parsed = parseDictionaryAiFallback(notes, "ephemeral", "en", { complete: true });
    expect(parsed.entry?.headword).toBe("ephemeral");
    expect(parsed.entry?.ipa).toBe("/ɪˈfɛm.ər.əl/");
    expect(parsed.entry?.senses[0]?.glosses).toEqual(["lasting briefly"]);
    expect(parsed.entry?.senses[0]?.examples?.[0]?.translation).toBe("joie éphémère");
    expect(parsed.entry?.synonyms).toEqual(["fleeting"]);
  });

  test("fallback and extras share one stream helper and cache only finished text", () => {
    const route = readFileSync(new URL("../../../api/dictionary/ai.ts", import.meta.url), "utf8");
    const prompt = readFileSync(
      new URL("../../../api/dictionary/_helpers/_ai.ts", import.meta.url),
      "utf8"
    );
    const client = readFileSync(
      new URL("../../../src/apps/dictionary/utils/dictionaryApi.ts", import.meta.url),
      "utf8"
    );
    const hook = readFileSync(
      new URL("../../../src/apps/dictionary/hooks/useDictionaryLogic.ts", import.meta.url),
      "utf8"
    );
    expect(route).not.toContain("generateText");
    expect(route).not.toContain("Output.object");
    expect(route).not.toContain("partialOutputStream");
    expect(route.match(/pipeUIMessageStreamToResponse/g)?.length).toBe(1);
    expect(route.match(/redis\.set\(/g)?.length).toBe(1);
    const onEnd = route.slice(route.indexOf("onEnd"));
    expect(onEnd.indexOf("isAborted")).toBeGreaterThan(-1);
    expect(onEnd.indexOf("isAborted")).toBeLessThan(onEnd.indexOf("redis.set"));
    expect(prompt).toContain("<<<ENTRY>>>");
    expect(prompt).toContain("<<<NOT_FOUND>>>");
    expect(client.match(/export async function streamDictionaryAi\(/g)?.length).toBe(1);
    expect(client.match(/getReader\(/g)?.length).toBe(1);
    expect(client).not.toContain("askDictionaryAi");
    expect(hook).toContain("streamDictionaryAi(");
    expect(hook).toContain("parseDictionaryAiFallback");
    expect(hook).toContain("fallbackEntryIdRef");
    expect(hook).not.toContain("askDictionaryAi");
  });
});
