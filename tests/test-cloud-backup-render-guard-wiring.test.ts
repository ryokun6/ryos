import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const readSource = (): string =>
  readFileSync(
    resolve(process.cwd(), "src/apps/control-panels/hooks/useControlPanelsLogic.ts"),
    "utf-8"
  );

describe("cloud backup render guard wiring", () => {
  test("dedupes identical cloud sync status payloads", () => {
    const source = readSource();

    expect(source.includes("function isSameCloudSyncStatus(")).toBe(true);
    expect(source.includes("setCloudSyncStatus((previous) =>")).toBe(true);
    expect(source.includes("isSameCloudSyncStatus(previous, data as CloudSyncStatusState)")).toBe(
      true
    );
  });

  test("prevents overlapping cloud sync status fetches", () => {
    const source = readSource();

    expect(source.includes("const isCloudStatusFetchInFlightRef = useRef(false);")).toBe(
      true
    );
    expect(source.includes("if (isCloudStatusFetchInFlightRef.current) return;")).toBe(true);
    expect(source.includes("isCloudStatusFetchInFlightRef.current = true;")).toBe(true);
    expect(source.includes("isCloudStatusFetchInFlightRef.current = false;")).toBe(true);
  });

  test("cleans up deferred cloud progress resets", () => {
    const source = readSource();

    expect(source.includes("const cloudProgressResetTimerRef = useRef")).toBe(true);
    expect(source.includes("clearTimeout(cloudProgressResetTimerRef.current);")).toBe(true);
    expect(source.includes("cloudProgressResetTimerRef.current = setTimeout(() => {")).toBe(
      true
    );
    expect(source.includes("setCloudProgress(null);")).toBe(true);
  });
});
