import { describe, expect, test } from "bun:test";
import { buildHourlyMetrics } from "../api/_utils/_analytics.js";

describe("buildHourlyMetrics", () => {
  test("fills 24 hours with zeros when raw is null", () => {
    const rows = buildHourlyMetrics(null, []);
    expect(rows).toHaveLength(24);
    expect(rows[0]).toEqual({
      hour: 0,
      calls: 0,
      ai: 0,
      errors: 0,
      uniqueVisitors: 0,
      avgLatencyMs: 0,
    });
    expect(rows[23].hour).toBe(23);
  });

  test("parses padded hour fields and UV counts", () => {
    const raw = {
      "09_calls": "10",
      "09_ai": "2",
      "09_errors": "1",
      "09_latsum": "100",
      "09_latcnt": "10",
    };
    const uv = Array.from({ length: 24 }, () => 0);
    uv[9] = 5;
    const rows = buildHourlyMetrics(raw, uv);
    expect(rows[9]).toEqual({
      hour: 9,
      calls: 10,
      ai: 2,
      errors: 1,
      uniqueVisitors: 5,
      avgLatencyMs: 10,
    });
    expect(rows[8].calls).toBe(0);
  });
});
