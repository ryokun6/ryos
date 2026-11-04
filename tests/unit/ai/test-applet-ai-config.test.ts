import { describe, expect, test } from "bun:test";
import {
  APPLET_IMAGE_MODEL_ID,
  APPLET_IMAGE_PROVIDER_OPTIONS,
  omitTrailingAssistantMessages,
} from "../../../api/applet-ai.js";

describe("applet ai Gemini image config", () => {
  test("caps generated applet images at 1K on Nano Banana 2.1", () => {
    expect(APPLET_IMAGE_MODEL_ID).toBe("gemini-nano-banana-2.1");
    expect(APPLET_IMAGE_PROVIDER_OPTIONS).toEqual({
      google: {
        responseModalities: ["IMAGE", "TEXT"],
        imageConfig: {
          imageSize: "1K",
        },
      },
    });
  });
});

describe("applet text prefill", () => {
  test("drops a trailing assistant turn so Flash-Lite is not prefilled", () => {
    expect(
      omitTrailingAssistantMessages([
        { role: "user", content: "draw a cat" },
        { role: "assistant", content: "ok" },
      ])
    ).toEqual([{ role: "user", content: "draw a cat" }]);
    expect(
      omitTrailingAssistantMessages([{ role: "assistant", content: "ok" }])
    ).toEqual([]);
    expect(
      omitTrailingAssistantMessages([{ role: "user", content: "hi" }])
    ).toEqual([{ role: "user", content: "hi" }]);
  });
});
