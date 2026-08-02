import { describe, expect, test } from "bun:test";
import {
  bumpStuffCoversRevision,
  getStuffCoversRevision,
  subscribeStuffCoversRevision,
} from "../../../src/apps/stuff/utils/stuffCoverBlobs";

describe("stuff cover revision notify", () => {
  test("does not notify listeners subscribed during the same bump", () => {
    const seen: string[] = [];
    let unsubLate: (() => void) | undefined;

    const unsubEarly = subscribeStuffCoversRevision(() => {
      seen.push("early");
      // Remount-style subscribe while notifying — must not run in this bump.
      unsubLate = subscribeStuffCoversRevision(() => {
        seen.push("late");
      });
    });

    bumpStuffCoversRevision();
    unsubEarly();
    unsubLate?.();

    expect(seen).toEqual(["early"]);
    expect(getStuffCoversRevision()).toBeGreaterThan(0);
  });
});
