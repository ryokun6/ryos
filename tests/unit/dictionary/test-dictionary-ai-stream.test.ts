import { describe, expect, test } from "bun:test";
import { extrasFromPartial } from "../../../api/dictionary/_helpers/_ai";
import {
  normalizeDictionaryAiExtras,
  parseDictionaryAiStreamLine,
  takeDictionaryAiStreamLines,
} from "../../../src/apps/dictionary/utils/dictionaryAiStream";

describe("dictionary AI extras stream", () => {
  test("keeps a partial NDJSON tail until the newline arrives", () => {
    const first = takeDictionaryAiStreamLines('{"extras":{"usageNotes":"The"}}\n{"extras":');
    expect(first.lines).toEqual(['{"extras":{"usageNotes":"The"}}']);
    expect(first.rest).toBe('{"extras":');
    const second = takeDictionaryAiStreamLines(`${first.rest}"usageNotes":"The word"}}\n`);
    expect(second.lines).toEqual(['{"extras":"usageNotes":"The word"}}']);
    expect(second.rest).toBe("");
  });

  test("parses an extras event", () => {
    const message = parseDictionaryAiStreamLine(
      JSON.stringify({
        extras: { usageNotes: "Used formally.", synonyms: ["term"], examples: [] },
      })
    );
    expect(message.extras?.usageNotes).toBe("Used formally.");
    expect(message.done).toBeUndefined();
  });

  test("fills missing arrays on a partial extras payload", () => {
    const extras = normalizeDictionaryAiExtras({
      usageNotes: "lasting briefly",
    } as never);
    expect(extras.synonyms).toEqual([]);
    expect(extras.examples).toEqual([]);
    expect(extras.usageNotes).toBe("lasting briefly");
  });

  test("renders a partial extras object before every field is present", () => {
    const extras = extrasFromPartial(
      {
        usageNotes: "  school ",
        examples: [{ text: "学校(がっこう)に行く", translation: null }, { text: "" }, "nope"],
      },
      "ja"
    );
    expect(extras.usageNotes).toBe("school");
    expect(extras.synonyms).toEqual([]);
    expect(extras.examples).toHaveLength(1);
    expect(extras.examples[0]?.text).toBe("学校に行く");
    expect(extras.nuance).toBeUndefined();
  });
});
