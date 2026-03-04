import { describe, expect, test } from "bun:test";
import {
  createEmptyCloudSyncMetadataMap,
  hasUnsyncedLocalChanges,
  isCloudSyncDomain,
  normalizeCloudSyncMetadataMap,
  shouldApplyRemoteUpdate,
} from "../src/utils/cloudSyncShared";

describe("cloud sync shared helpers", () => {
  test("validates supported sync domains", () => {
    expect(isCloudSyncDomain("files")).toBe(true);
    expect(isCloudSyncDomain("settings")).toBe(true);
    expect(isCloudSyncDomain("songs")).toBe(true);
    expect(isCloudSyncDomain("calendar")).toBe(true);
    expect(isCloudSyncDomain("widgets")).toBe(false);
    expect(isCloudSyncDomain(null)).toBe(false);
  });

  test("creates an empty metadata map", () => {
    expect(createEmptyCloudSyncMetadataMap()).toEqual({
      settings: null,
      files: null,
      songs: null,
      calendar: null,
    });
  });

  test("normalizes partial metadata safely", () => {
    const normalized = normalizeCloudSyncMetadataMap({
      files: {
        updatedAt: "2026-03-04T12:00:00.000Z",
        createdAt: "2026-03-04T12:00:05.000Z",
        totalSize: 2048,
        version: 3,
      },
      songs: {
        updatedAt: 123,
      },
    });

    expect(normalized.files?.updatedAt).toBe("2026-03-04T12:00:00.000Z");
    expect(normalized.files?.totalSize).toBe(2048);
    expect(normalized.files?.version).toBe(3);
    expect(normalized.settings).toBeNull();
    expect(normalized.songs).toBeNull();
    expect(normalized.calendar).toBeNull();
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
});
