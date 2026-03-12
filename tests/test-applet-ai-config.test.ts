import { describe, expect, test } from "bun:test";
import { APPLET_IMAGE_PROVIDER_OPTIONS } from "../api/applet-ai.js";

describe("applet ai Gemini image config", () => {
  test("caps generated applet images at 1K", () => {
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
