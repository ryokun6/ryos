import { describe, expect, test } from "bun:test";
import {
  isValidParsedResult,
  parseYouTubeTitleSimple,
  sanitizeInput,
} from "../../../api/_utils/parse-youtube-title";

describe("parseYouTubeTitleSimple", () => {
  test("parses artist-title delimiter formats", () => {
    expect(parseYouTubeTitleSimple("Mariya Takeuchi - Plastic Love")).toEqual({
      artist: "Mariya Takeuchi",
      title: "Plastic Love",
    });
    expect(parseYouTubeTitleSimple("Artist | Song Title")).toEqual({
      artist: "Artist",
      title: "Song Title",
    });
  });

  test("parses title-by-artist format used by OG fallback", () => {
    expect(parseYouTubeTitleSimple("Plastic Love by Mariya Takeuchi")).toEqual({
      artist: "Mariya Takeuchi",
      title: "Plastic Love",
    });
  });

  test("removes common video markers", () => {
    expect(
      parseYouTubeTitleSimple("Artist - Song Title (Official Music Video)")
    ).toEqual({
      artist: "Artist",
      title: "Song Title",
    });
    expect(parseYouTubeTitleSimple("Artist - Song Title [MV]")).toEqual({
      artist: "Artist",
      title: "Song Title",
    });
  });

  test("parses quoted-title artist formats", () => {
    expect(
      parseYouTubeTitleSimple("NewJeans (뉴진스) 'How Sweet' Official MV")
    ).toEqual({
      artist: "NewJeans",
      title: "How Sweet",
    });
  });

  test("uses non-generic channel names as artist fallback", () => {
    expect(parseYouTubeTitleSimple("KICK BACK", "Kenshi Yonezu")).toEqual({
      artist: "Kenshi Yonezu",
      title: "KICK BACK",
    });
    expect(parseYouTubeTitleSimple("KICK BACK", "Kenshi Yonezu - Topic")).toEqual({
      artist: "",
      title: "KICK BACK",
    });
  });
});

describe("sanitizeInput", () => {
  test("removes zero-width characters", () => {
    expect(sanitizeInput("\u200BPlastic\u200C Love\uFEFF")).toBe("Plastic Love");
  });
});

describe("isValidParsedResult", () => {
  test("rejects JSON-shaped malformed output", () => {
    expect(
      isValidParsedResult(
        { title: '{"title":"Song"}', artist: "Artist" },
        "Artist - Song"
      )
    ).toBe(false);
  });

  test("rejects titles much longer than the source", () => {
    expect(
      isValidParsedResult(
        { title: "Song ".repeat(20), artist: "Artist" },
        "Artist - Song"
      )
    ).toBe(false);
  });

  test("accepts normal parsed output", () => {
    expect(
      isValidParsedResult(
        { title: "Song", artist: "Artist" },
        "Artist - Song"
      )
    ).toBe(true);
  });
});
