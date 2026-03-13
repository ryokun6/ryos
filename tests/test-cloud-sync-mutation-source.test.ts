import { afterEach, describe, expect, test } from "bun:test";
import {
  __resetCloudSyncMutationSourcesForTests,
  describeActiveCloudSyncMutationSources,
  getActiveCloudSyncMutationSources,
  hasActiveCloudSyncMutationSource,
  runWithCloudSyncMutationSource,
  shouldSkipAutoCloudSyncUpload,
} from "../src/utils/cloudSyncMutationSource";

describe("cloud sync mutation source tracking", () => {
  afterEach(() => {
    __resetCloudSyncMutationSourcesForTests();
  });

  test("treats remote-sync mutations as non-user uploads", async () => {
    expect(shouldSkipAutoCloudSyncUpload()).toBe(false);

    await runWithCloudSyncMutationSource(
      "remote-sync",
      async () => {
        expect(shouldSkipAutoCloudSyncUpload()).toBe(true);
        expect(hasActiveCloudSyncMutationSource("remote-sync")).toBe(true);
        expect(getActiveCloudSyncMutationSources()).toEqual(["remote-sync"]);
        expect(describeActiveCloudSyncMutationSources()).toBe(
          "remote-sync:files-metadata"
        );
      },
      "files-metadata"
    );

    expect(shouldSkipAutoCloudSyncUpload()).toBe(false);
    expect(getActiveCloudSyncMutationSources()).toEqual([]);
  });

  test("keeps uploads blocked until nested bootstrap scopes complete", async () => {
    await runWithCloudSyncMutationSource(
      "remote-sync",
      async () => {
        await runWithCloudSyncMutationSource(
          "system-bootstrap",
          async () => {
            expect(shouldSkipAutoCloudSyncUpload()).toBe(true);
            expect(getActiveCloudSyncMutationSources()).toEqual([
              "remote-sync",
              "system-bootstrap",
            ]);
          },
          "files-store:initializeLibrary"
        );

        expect(shouldSkipAutoCloudSyncUpload()).toBe(true);
        expect(getActiveCloudSyncMutationSources()).toEqual(["remote-sync"]);
      },
      "settings"
    );

    expect(shouldSkipAutoCloudSyncUpload()).toBe(false);
  });

  test("cleans up mutation state after failures", async () => {
    await expect(
      runWithCloudSyncMutationSource(
        "system-bootstrap",
        async () => {
          throw new Error("boom");
        },
        "ipod-store:initializeLibrary"
      )
    ).rejects.toThrow("boom");

    expect(shouldSkipAutoCloudSyncUpload()).toBe(false);
    expect(describeActiveCloudSyncMutationSources()).toBe("none");
  });
});
