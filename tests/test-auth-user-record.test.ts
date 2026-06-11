import { describe, expect, test } from "bun:test";
import {
  isUserBanned,
  parseStoredUser,
} from "../api/_utils/auth/_user-record";

describe("stored user record helpers", () => {
  test("parses JSON-string and object records", () => {
    expect(parseStoredUser('{"username":"ryo","banned":true}')).toEqual({
      username: "ryo",
      banned: true,
    });
    expect(parseStoredUser({ username: "ryo", banned: false })).toEqual({
      username: "ryo",
      banned: false,
    });
  });

  test("returns null for missing/malformed records", () => {
    expect(parseStoredUser(null)).toBeNull();
    expect(parseStoredUser(undefined)).toBeNull();
    expect(parseStoredUser("not json")).toBeNull();
  });

  test("isUserBanned only true when banned === true", () => {
    expect(isUserBanned('{"username":"u","banned":true}')).toBe(true);
    expect(isUserBanned({ username: "u", banned: true })).toBe(true);
    expect(isUserBanned({ username: "u", banned: false })).toBe(false);
    expect(isUserBanned({ username: "u" })).toBe(false);
    expect(isUserBanned(null)).toBe(false);
    expect(isUserBanned("garbage")).toBe(false);
  });
});
