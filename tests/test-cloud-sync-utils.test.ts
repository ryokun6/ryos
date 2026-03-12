import { describe, expect, test } from "bun:test";
import {
  CLOUD_SYNC_DOMAINS,
  CLOUD_SYNC_REMOTE_APPLY_DOMAINS,
  createEmptyCloudSyncMetadataMap,
  getCloudSyncCategory,
  getCloudSyncRemoteApplyDomains,
  getLatestCloudSyncTimestamp,
  hasUnsyncedLocalChanges,
  isCloudSyncDomain,
  isRedisSyncDomain,
  isBlobSyncDomain,
  isIndividualBlobSyncDomain,
  normalizeCloudSyncMetadataMap,
  shouldApplyRemoteUpdate,
} from "../src/utils/cloudSyncShared";
import {
  filterDeletedFilePaths,
  filterDeletedIds,
  mergeDeletionMarkerMaps,
} from "../src/utils/cloudSyncDeletionMarkers";

describe("cloud sync shared helpers", () => {
  test("validates supported sync domains", () => {
    expect(isCloudSyncDomain("settings")).toBe(true);
    expect(isCloudSyncDomain("files-metadata")).toBe(true);
    expect(isCloudSyncDomain("files-images")).toBe(true);
    expect(isCloudSyncDomain("files-trash")).toBe(true);
    expect(isCloudSyncDomain("files-applets")).toBe(true);
    expect(isCloudSyncDomain("songs")).toBe(true);
    expect(isCloudSyncDomain("calendar")).toBe(true);
    expect(isCloudSyncDomain("custom-wallpapers")).toBe(true);
    expect(isCloudSyncDomain("files")).toBe(false);
    expect(isCloudSyncDomain("widgets")).toBe(false);
    expect(isCloudSyncDomain(null)).toBe(false);
  });

  test("categorizes Redis vs Blob sync domains", () => {
    const invalidRedisDomain =
      "files-images" as unknown as Parameters<typeof isRedisSyncDomain>[0];
    const invalidBlobDomain =
      "settings" as unknown as Parameters<typeof isBlobSyncDomain>[0];
    const invalidWallpaperDomain =
      "custom-wallpapers" as unknown as Parameters<typeof isRedisSyncDomain>[0];
    const invalidCalendarDomain =
      "calendar" as unknown as Parameters<typeof isBlobSyncDomain>[0];

    expect(isRedisSyncDomain("settings")).toBe(true);
    expect(isRedisSyncDomain("calendar")).toBe(true);
    expect(isRedisSyncDomain("stickies")).toBe(true);
    expect(isRedisSyncDomain("songs")).toBe(true);
    expect(isRedisSyncDomain("videos")).toBe(true);
    expect(isRedisSyncDomain("files-metadata")).toBe(true);
    expect(isRedisSyncDomain(invalidRedisDomain)).toBe(false);
    expect(isRedisSyncDomain(invalidWallpaperDomain)).toBe(false);

    expect(isBlobSyncDomain("files-images")).toBe(true);
    expect(isBlobSyncDomain("custom-wallpapers")).toBe(true);
    expect(isBlobSyncDomain(invalidBlobDomain)).toBe(false);
    expect(isBlobSyncDomain(invalidCalendarDomain)).toBe(false);

    expect(isIndividualBlobSyncDomain("files-images")).toBe(true);
    expect(isIndividualBlobSyncDomain("custom-wallpapers")).toBe(true);
    expect(isIndividualBlobSyncDomain("files-trash")).toBe(false);
    expect(isIndividualBlobSyncDomain("settings" as never)).toBe(false);
  });

  test("creates an empty metadata map", () => {
    const map = createEmptyCloudSyncMetadataMap();
    expect(map.settings).toBeNull();
    expect(map["files-metadata"]).toBeNull();
    expect(map["files-images"]).toBeNull();
    expect(map["files-trash"]).toBeNull();
    expect(map["files-applets"]).toBeNull();
    expect(map.songs).toBeNull();
    expect(map.videos).toBeNull();
    expect(map.stickies).toBeNull();
    expect(map.calendar).toBeNull();
    expect(map["custom-wallpapers"]).toBeNull();
  });

  test("normalizes partial metadata safely", () => {
    const normalized = normalizeCloudSyncMetadataMap({
      "files-images": {
        updatedAt: "2026-03-04T12:00:00.000Z",
        createdAt: "2026-03-04T12:00:05.000Z",
        totalSize: 2048,
        version: 3,
      },
      songs: {
        updatedAt: 123,
      },
    });

    expect(normalized["files-images"]?.updatedAt).toBe(
      "2026-03-04T12:00:00.000Z"
    );
    expect(normalized["files-images"]?.totalSize).toBe(2048);
    expect(normalized["files-images"]?.version).toBe(3);
    expect(normalized.settings).toBeNull();
    expect(normalized["files-metadata"]).toBeNull();
    expect(normalized.songs).toBeNull();
    expect(normalized.calendar).toBeNull();
  });

  test("maps internal sync domains to user-facing categories", () => {
    expect(getCloudSyncCategory("files-metadata")).toBe("files");
    expect(getCloudSyncCategory("files-images")).toBe("files");
    expect(getCloudSyncCategory("settings")).toBe("settings");
    expect(getCloudSyncCategory("custom-wallpapers")).toBe("settings");
    expect(getCloudSyncCategory("songs")).toBe("songs");
    expect(getCloudSyncCategory("calendar")).toBe("calendar");
  });

  test("prioritizes custom wallpapers before settings during remote apply", () => {
    const orderedDomains = getCloudSyncRemoteApplyDomains();

    expect(orderedDomains).toEqual(CLOUD_SYNC_REMOTE_APPLY_DOMAINS);
    expect(orderedDomains).toHaveLength(CLOUD_SYNC_DOMAINS.length);
    expect(new Set(orderedDomains)).toEqual(new Set(CLOUD_SYNC_DOMAINS));
    expect(orderedDomains.indexOf("custom-wallpapers")).toBeLessThan(
      orderedDomains.indexOf("settings")
    );
    expect(
      orderedDomains.filter((domain) => domain === "custom-wallpapers")
    ).toHaveLength(1);
    expect(orderedDomains.filter((domain) => domain === "settings")).toHaveLength(1);
  });

  test("detects unsynced local changes", () => {
    expect(
      hasUnsyncedLocalChanges(
        "2026-03-04T12:01:00.000Z",
        "2026-03-04T12:00:00.000Z"
      )
    ).toBe(true);
    expect(
      hasUnsyncedLocalChanges(
        "2026-03-04T12:00:00.000Z",
        "2026-03-04T12:01:00.000Z"
      )
    ).toBe(false);
    expect(
      hasUnsyncedLocalChanges(
        "2026-03-04T12:00:00.000Z",
        "2026-03-04T12:00:00.000Z",
        true
      )
    ).toBe(true);
  });

  test("applies newer remote data only when local state is clean", () => {
    expect(
      shouldApplyRemoteUpdate({
        remoteUpdatedAt: "2026-03-04T12:05:00.000Z",
        lastAppliedRemoteAt: "2026-03-04T12:00:00.000Z",
        lastUploadedAt: "2026-03-04T12:02:00.000Z",
        lastLocalChangeAt: "2026-03-04T12:02:00.000Z",
        hasPendingUpload: false,
      })
    ).toBe(true);

    expect(
      shouldApplyRemoteUpdate({
        remoteUpdatedAt: "2026-03-04T12:05:00.000Z",
        lastAppliedRemoteAt: "2026-03-04T12:00:00.000Z",
        lastUploadedAt: "2026-03-04T12:02:00.000Z",
        lastLocalChangeAt: "2026-03-04T12:03:00.000Z",
        hasPendingUpload: false,
      })
    ).toBe(false);

    expect(
      shouldApplyRemoteUpdate({
        remoteUpdatedAt: "2026-03-04T12:05:00.000Z",
        lastAppliedRemoteAt: "2026-03-04T12:00:00.000Z",
        lastUploadedAt: "2026-03-04T12:02:00.000Z",
        lastLocalChangeAt: "2026-03-04T12:02:00.000Z",
        hasPendingUpload: true,
      })
    ).toBe(false);

    expect(
      shouldApplyRemoteUpdate({
        remoteUpdatedAt: "2026-03-04T12:01:00.000Z",
        lastAppliedRemoteAt: "2026-03-04T12:04:00.000Z",
        lastUploadedAt: "2026-03-04T12:02:00.000Z",
        lastLocalChangeAt: "2026-03-04T12:02:00.000Z",
        hasPendingUpload: false,
      })
    ).toBe(false);
  });

  test("returns the newest timestamp in a group", () => {
    expect(
      getLatestCloudSyncTimestamp([
        "2026-03-04T12:01:00.000Z",
        "2026-03-04T12:03:00.000Z",
        "2026-03-04T12:02:00.000Z",
      ])
    ).toBe("2026-03-04T12:03:00.000Z");

    expect(getLatestCloudSyncTimestamp([null, undefined])).toBeNull();
  });

  test("merges deletion markers by newest timestamp", () => {
    expect(
      mergeDeletionMarkerMaps(
        { "todo-1": "2026-03-04T12:00:00.000Z" },
        { "todo-1": "2026-03-04T12:05:00.000Z", "todo-2": "2026-03-04T12:03:00.000Z" }
      )
    ).toEqual({
      "todo-1": "2026-03-04T12:05:00.000Z",
      "todo-2": "2026-03-04T12:03:00.000Z",
    });
  });

  test("filters deleted ids from synced collections", () => {
    expect(
      filterDeletedIds(
        [
          { id: "todo-1", title: "Keep" },
          { id: "todo-2", title: "Delete" },
        ],
        { "todo-2": "2026-03-04T12:05:00.000Z" },
        (item) => item.id
      )
    ).toEqual([{ id: "todo-1", title: "Keep" }]);
  });

  test("filters deleted file paths and descendants", () => {
    expect(
      filterDeletedFilePaths(
        {
          "/Photos": { type: "directory" },
          "/Photos/cat.png": { type: "image" },
          "/Notes/todo.txt": { type: "text" },
        },
        { "/Photos": "2026-03-04T12:05:00.000Z" }
      )
    ).toEqual({
      "/Notes/todo.txt": { type: "text" },
    });
  });
});
