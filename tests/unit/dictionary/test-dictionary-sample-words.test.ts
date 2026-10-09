import { describe, expect, test } from "bun:test";
import {
  DICTIONARY_SAMPLE_WORDS,
  dictionarySampleLabel,
} from "../../../src/apps/dictionary/utils/sampleWords";

describe("dictionary welcome samples", () => {
  test("shows the Chinese example in the preferred script", () => {
    const chinese = DICTIONARY_SAMPLE_WORDS.find((sample) => sample.lang === "zh");
    expect(chinese).toBeDefined();
    expect(dictionarySampleLabel(chinese!, "simplified")).toBe("学习");
    expect(dictionarySampleLabel(chinese!, "traditional")).toBe("學習");
  });

  test("leaves the other language examples unchanged", () => {
    for (const sample of DICTIONARY_SAMPLE_WORDS) {
      if (sample.lang === "zh") continue;
      expect(dictionarySampleLabel(sample, "simplified")).toBe(sample.word);
      expect(dictionarySampleLabel(sample, "traditional")).toBe(sample.word);
    }
  });
});
