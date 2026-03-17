import { describe, expect, test } from "bun:test";
import { mergePersistedCloudSyncDomainStatus } from "@/stores/useCloudSyncStore";

describe("mergePersistedCloudSyncDomainStatus", () => {
  test("preserves all CloudSync domains when persisted snapshot omits newer keys", () => {
    const partial = {
      settings: {
        lastUploadedAt: "2025-01-01T00:00:00.000Z",
        lastFetchedAt: null,
        lastAppliedRemoteAt: null,
        lastKnownServerVersion: 1,
        isUploading: false,
        isDownloading: false,
      },
      "files-metadata": {
        lastUploadedAt: null,
        lastFetchedAt: null,
        lastAppliedRemoteAt: null,
        lastKnownServerVersion: null,
        isUploading: false,
        isDownloading: false,
      },
    } as const;

    const merged = mergePersistedCloudSyncDomainStatus(partial);

    expect(merged["custom-wallpapers"]).toBeDefined();
    expect(merged["custom-wallpapers"].lastUploadedAt).toBeNull();
    expect(merged.settings.lastUploadedAt).toBe("2025-01-01T00:00:00.000Z");
  });

  test("returns full defaults for empty partial", () => {
    const merged = mergePersistedCloudSyncDomainStatus(undefined);
    expect(merged["custom-wallpapers"]).toBeDefined();
    expect(merged.contacts).toBeDefined();
  });
});
