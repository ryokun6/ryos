import { describe, expect, test } from "bun:test";
import {
  planIndividualBlobDomainApply,
  resolveIndividualBlobApplyMode,
} from "../src/utils/cloudSyncIndividualBlobApply";

describe("cloud sync individual blob apply planning", () => {
  test("uses replace mode for first download into an empty store", () => {
    expect(
      resolveIndividualBlobApplyMode({
        requestedMode: "auto",
        localItemCount: 0,
        hasSyncHistory: false,
      })
    ).toBe("replace");
  });

  test("uses incremental mode once local state or sync history exists", () => {
    expect(
      resolveIndividualBlobApplyMode({
        requestedMode: "auto",
        localItemCount: 2,
        hasSyncHistory: false,
      })
    ).toBe("incremental");

    expect(
      resolveIndividualBlobApplyMode({
        requestedMode: "auto",
        localItemCount: 0,
        hasSyncHistory: true,
      })
    ).toBe("incremental");
  });

  test("incremental apply keeps unrelated local items and deletes only explicit tombstones", () => {
    expect(
      planIndividualBlobDomainApply({
        mode: "incremental",
        existingKeys: ["wall-1", "wall-2", "local-only"],
        remoteKeys: ["wall-1", "wall-3"],
        changedItemKeys: ["wall-3"],
        deletedKeys: {
          "wall-2": "2026-03-13T22:55:00.000Z",
        },
      })
    ).toEqual({
      keysToDelete: ["wall-2"],
      keysToUpsert: ["wall-3"],
      finalKeys: ["wall-1", "local-only", "wall-3"],
    });
  });

  test("replace apply reconciles local state to the remote set", () => {
    expect(
      planIndividualBlobDomainApply({
        mode: "replace",
        existingKeys: ["wall-1", "wall-2", "local-only"],
        remoteKeys: ["wall-1", "wall-3"],
        changedItemKeys: ["wall-1", "wall-3"],
        deletedKeys: {},
      })
    ).toEqual({
      keysToDelete: ["wall-2", "local-only"],
      keysToUpsert: ["wall-1", "wall-3"],
      finalKeys: ["wall-1", "wall-3"],
    });
  });
});
