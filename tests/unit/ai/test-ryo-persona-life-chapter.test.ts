import { describe, expect, test } from "bun:test";
import {
  CHAT_ROOM_REPLY_INSTRUCTIONS,
  RYO_PERSONA_INSTRUCTIONS,
} from "../../../api/_utils/_aiPrompts.js";

describe("ryo persona life chapter", () => {
  test("main persona is former Cursor HoD in Taipei, not present-tense SF", () => {
    expect(RYO_PERSONA_INSTRUCTIONS).toContain("former head of design at Cursor");
    expect(RYO_PERSONA_INSTRUCTIONS).toContain("you live in Taipei with cat buba");
    expect(RYO_PERSONA_INSTRUCTIONS).toContain("august 4, 2026");
    expect(RYO_PERSONA_INSTRUCTIONS).toContain("september 4, 2026 (9/4)");
    expect(RYO_PERSONA_INSTRUCTIONS).toContain(
      "Cursor Feb 2025–Aug 4, 2026 (Head of Design)"
    );
    expect(RYO_PERSONA_INSTRUCTIONS).toContain(
      "you were Head of Design at Cursor from Feb 2025 through Aug 4, 2026"
    );
    expect(RYO_PERSONA_INSTRUCTIONS).toContain(
      "more full, grounded life"
    );
    expect(RYO_PERSONA_INSTRUCTIONS).not.toContain("live in San Francisco");
    expect(RYO_PERSONA_INSTRUCTIONS).not.toContain("Feb 2025-present");
    expect(RYO_PERSONA_INSTRUCTIONS).not.toContain(
      "head of design at Cursor, early designer at Notion. you live in San Francisco"
    );
  });

  test("main persona points at journal pieces for why / AI views", () => {
    expect(RYO_PERSONA_INSTRUCTIONS).toContain("https://ryo.lu/journal");
    expect(RYO_PERSONA_INSTRUCTIONS).toContain(
      "https://ryo.lu/journal/i-left-cursor"
    );
    expect(RYO_PERSONA_INSTRUCTIONS).toContain("https://ryo.lu/journal/leaving");
    expect(RYO_PERSONA_INSTRUCTIONS).toContain(
      "https://ryo.lu/journal/efficiency-productivity-speed"
    );
    expect(RYO_PERSONA_INSTRUCTIONS).toContain(
      "https://ryo.lu/journal/when-the-dream-becomes-the-job"
    );
  });

  test("room-reply persona stays in sync with the life chapter", () => {
    expect(CHAT_ROOM_REPLY_INSTRUCTIONS).toContain(
      "former head of design at Cursor"
    );
    expect(CHAT_ROOM_REPLY_INSTRUCTIONS).toContain(
      "you live in Taipei with cat buba"
    );
    expect(CHAT_ROOM_REPLY_INSTRUCTIONS).toContain("Aug 4, 2026");
    expect(CHAT_ROOM_REPLY_INSTRUCTIONS).toContain("9/4/2026");
    expect(CHAT_ROOM_REPLY_INSTRUCTIONS).not.toContain(
      "live in San Francisco"
    );
    expect(CHAT_ROOM_REPLY_INSTRUCTIONS).not.toContain(
      "you joined Cursor to be their Head of Design on Feb 2025"
    );
  });
});
