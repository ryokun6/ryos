import { describe, expect, test } from "bun:test";
import {
  DEFAULT_IRC_CHANNEL,
  DEFAULT_IRC_HOST,
  DEFAULT_IRC_PORT,
  DEFAULT_IRC_TLS,
  buildIrcServerKey,
  normalizeIrcChannel,
} from "../src/shared/contracts/irc";

describe("IRC shared contracts", () => {
  test("preserves default IRC constants", () => {
    expect(DEFAULT_IRC_HOST).toBe("irc.pieter.com");
    expect(DEFAULT_IRC_PORT).toBe(6667);
    expect(DEFAULT_IRC_TLS).toBe(false);
    expect(DEFAULT_IRC_CHANNEL).toBe("#pieter");
  });

  test("normalizes IRC channels", () => {
    expect(normalizeIrcChannel("pieter")).toBe("#pieter");
    expect(normalizeIrcChannel("#pieter")).toBe("#pieter");
    expect(normalizeIrcChannel("&ops")).toBe("&ops");
    expect(normalizeIrcChannel("")).toBe("");
  });

  test("builds stable IRC server keys", () => {
    expect(buildIrcServerKey("IRC.EXAMPLE.COM", 6667, false)).toBe(
      "irc://irc.example.com:6667"
    );
    expect(buildIrcServerKey("irc.example.com", 6697, true)).toBe(
      "ircs://irc.example.com:6697"
    );
  });
});
