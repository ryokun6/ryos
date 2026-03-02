import { describe, expect, test } from "bun:test";
import { shouldApplyLiveDesktopSyncPayload } from "../src/utils/liveDesktop/syncGuard";
import { createLiveDesktopInstanceMapping } from "../src/utils/liveDesktop/instanceMapping";

describe("Live Desktop store wiring", () => {
  describe("Loop guard behavior", () => {
    test("ignores payload when current user is host", () => {
      const shouldApply = shouldApplyLiveDesktopSyncPayload({
        hasSession: true,
        isHost: true,
        username: "host",
        syncedBy: "guest",
        operationId: "op-1",
        lastAppliedOperationId: null,
      });
      expect(shouldApply).toBe(false);
    });

    test("ignores payload from current user", () => {
      const shouldApply = shouldApplyLiveDesktopSyncPayload({
        hasSession: true,
        isHost: false,
        username: "alice",
        syncedBy: "alice",
        operationId: "op-2",
        lastAppliedOperationId: null,
      });
      expect(shouldApply).toBe(false);
    });

    test("ignores duplicate operation id", () => {
      const shouldApply = shouldApplyLiveDesktopSyncPayload({
        hasSession: true,
        isHost: false,
        username: "bob",
        syncedBy: "host",
        operationId: "op-3",
        lastAppliedOperationId: "op-3",
      });
      expect(shouldApply).toBe(false);
    });

    test("accepts new remote operation for guest", () => {
      const shouldApply = shouldApplyLiveDesktopSyncPayload({
        hasSession: true,
        isHost: false,
        username: "guest",
        syncedBy: "host",
        operationId: "op-4",
        lastAppliedOperationId: "op-1",
      });
      expect(shouldApply).toBe(true);
    });
  });

  describe("Instance mapping lifecycle", () => {
    test("maps host instance IDs to guest instance IDs", () => {
      const mapping = createLiveDesktopInstanceMapping();
      mapping.setMapping("host-1", "guest-11");
      expect(mapping.getLocalInstanceId("host-1")).toBe("guest-11");
    });

    test("removes and clears mappings", () => {
      const mapping = createLiveDesktopInstanceMapping();
      mapping.setMapping("host-1", "guest-11");
      mapping.setMapping("host-2", "guest-22");

      mapping.removeMapping("host-1");
      expect(mapping.getLocalInstanceId("host-1")).toBeUndefined();
      expect(mapping.getHostInstanceIds()).toEqual(["host-2"]);

      mapping.clear();
      expect(mapping.getHostInstanceIds()).toEqual([]);
    });
  });
});
