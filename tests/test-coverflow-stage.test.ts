import { describe, expect, test } from "bun:test";
import {
  COVERFLOW_SHARED_STAGE_CLASS,
  coverFlowArtistTextClass,
  coverFlowLabelFontClass,
  coverFlowSharedStageRootClass,
  coverFlowTitleTextClass,
  isCoverFlowSharedStage,
} from "../src/apps/ipod/coverflowStage";

describe("coverflowStage", () => {
  test("shared stage is used for karaoke and classic iPod, not modern inline", () => {
    expect(isCoverFlowSharedStage(false)).toBe(true);
    expect(isCoverFlowSharedStage(true)).toBe(false);
  });

  test("shared stage root uses coverflow-shared-stage + karaoke-force-font", () => {
    expect(coverFlowSharedStageRootClass(false, false)).toContain(
      COVERFLOW_SHARED_STAGE_CLASS
    );
    expect(coverFlowSharedStageRootClass(false, false)).toContain(
      "karaoke-force-font"
    );
    expect(coverFlowSharedStageRootClass(true, true)).toContain(
      "ipod-force-font"
    );
  });

  test("shared stage labels use font-os-ui (Lucida on macOS)", () => {
    expect(coverFlowLabelFontClass(false)).toBe("font-os-ui");
    expect(coverFlowLabelFontClass(true)).toBe("font-ipod-modern-ui");
  });

  test("shared stage title/artist use light-on-black colors", () => {
    expect(coverFlowTitleTextClass(false, true)).toContain("text-white");
    expect(coverFlowArtistTextClass(false, false)).toContain("text-white/60");
  });
});
