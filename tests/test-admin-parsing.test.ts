import { describe, expect, test } from "bun:test";
import {
  clampAdminInteger,
  parseAdminStoredMessage,
} from "../api/_utils/admin-parsing";

describe("admin stored message parsing", () => {
  const validMessage = {
    id: "message-1",
    username: "alice",
    content: "hello",
    timestamp: 1_750_000_000_000,
  };

  test("accepts object and serialized messages", () => {
    expect(parseAdminStoredMessage(validMessage)).toEqual(validMessage);
    expect(parseAdminStoredMessage(JSON.stringify(validMessage))).toEqual(
      validMessage
    );
  });

  test("rejects corrupt JSON and malformed records", () => {
    expect(parseAdminStoredMessage("{not-json")).toBeNull();
    expect(parseAdminStoredMessage(null)).toBeNull();
    expect(
      parseAdminStoredMessage({ ...validMessage, username: 123 })
    ).toBeNull();
    expect(
      parseAdminStoredMessage({ ...validMessage, timestamp: Number.NaN })
    ).toBeNull();
  });
});

describe("admin integer query parsing", () => {
  test("uses the fallback for NaN, decimals, and partial numbers", () => {
    expect(clampAdminInteger("NaN", 50, 1, 500)).toBe(50);
    expect(clampAdminInteger("12.5", 50, 1, 500)).toBe(50);
    expect(clampAdminInteger("12oops", 50, 1, 500)).toBe(50);
    expect(clampAdminInteger(undefined, 50, 1, 500)).toBe(50);
  });

  test("clamps safe integers to endpoint bounds", () => {
    expect(clampAdminInteger("0", 50, 1, 500)).toBe(1);
    expect(clampAdminInteger("42", 50, 1, 500)).toBe(42);
    expect(clampAdminInteger("501", 50, 1, 500)).toBe(500);
  });
});
