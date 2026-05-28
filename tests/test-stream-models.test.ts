import { describe, expect, test } from "bun:test";
import {
  FURIGANA_STREAM_MODEL,
  SORAMIMI_STREAM_MODEL,
  TRANSLATE_STREAM_MODEL,
} from "../api/songs/_streamModels";

describe("lyrics stream model defaults", () => {
  test("soramimi and furigana default to gpt-5.4; translate stays on gpt-5.5", () => {
    expect(SORAMIMI_STREAM_MODEL).toBe("gpt-5.4");
    expect(FURIGANA_STREAM_MODEL).toBe("gpt-5.4");
    expect(TRANSLATE_STREAM_MODEL).toBe("gpt-5.5");
  });
});
