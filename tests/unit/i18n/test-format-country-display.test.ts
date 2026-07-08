import { describe, expect, test } from "bun:test";
import { formatCountryDisplay } from "../../../src/utils/formatCountryDisplay";

describe("formatCountryDisplay", () => {
  test("localizes ISO alpha-2 country codes", () => {
    expect(formatCountryDisplay("JP", "en").name).toBe("Japan");
    expect(formatCountryDisplay("JP", "ja").name).toBe("日本");
  });

  test("passes through non-ISO country labels", () => {
    expect(formatCountryDisplay("Atlantis", "en")).toEqual({
      flag: "",
      name: "Atlantis",
    });
  });
});
