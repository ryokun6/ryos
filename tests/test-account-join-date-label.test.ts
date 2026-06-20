import { describe, expect, test } from "bun:test";
import {
  formatAccountJoinMonthYear,
  getAccountJoinStatusLabel,
} from "../src/apps/control-panels/components/control-panels-app/accountJoinDateLabel";

describe("accountJoinDateLabel", () => {
  test("formatAccountJoinMonthYear uses short month and year", () => {
    const formatted = formatAccountJoinMonthYear(
      Date.UTC(2025, 5, 15),
      "en-US"
    );
    expect(formatted).toBe("Jun 2025");
  });

  test("getAccountJoinStatusLabel interpolates localized join date", () => {
    const label = getAccountJoinStatusLabel(
      (key, opts) =>
        key === "apps.control-panels.accountJoined"
          ? `Joined ${opts?.date}`
          : "Logged in to ryOS",
      Date.UTC(2025, 5, 15),
      "en-US"
    );

    expect(label).toBe("Joined Jun 2025");
  });

  test("getAccountJoinStatusLabel falls back when join date is missing", () => {
    const label = getAccountJoinStatusLabel(
      (key) =>
        key === "apps.control-panels.loggedInToRyOS"
          ? "Logged in to ryOS"
          : "Joined",
      null,
      "en-US"
    );

    expect(label).toBe("Logged in to ryOS");
  });
});
