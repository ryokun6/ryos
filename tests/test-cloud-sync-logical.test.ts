import { describe, expect, test } from "bun:test";
import {
  aggregateLogicalCloudSyncMetadata,
  createEmptyLogicalCloudSyncMetadataMap,
  getLogicalCloudSyncDomainForPhysical,
  getLogicalCloudSyncDomainPhysicalParts,
  isLogicalCloudSyncDomain,
} from "../src/utils/cloudSyncLogical";
import { createEmptyCloudSyncMetadataMap } from "../src/utils/cloudSyncShared";

describe("logical cloud sync helpers", () => {
  test("validates logical domains", () => {
    expect(isLogicalCloudSyncDomain("settings")).toBe(true);
    expect(isLogicalCloudSyncDomain("files")).toBe(true);
    expect(isLogicalCloudSyncDomain("contacts")).toBe(true);
    expect(isLogicalCloudSyncDomain("files-images")).toBe(false);
    expect(isLogicalCloudSyncDomain("widgets")).toBe(false);
  });

  test("maps physical domains into logical groups", () => {
    expect(getLogicalCloudSyncDomainForPhysical("custom-wallpapers")).toBe(
      "settings"
    );
    expect(getLogicalCloudSyncDomainForPhysical("files-images")).toBe("files");
    expect(getLogicalCloudSyncDomainPhysicalParts("settings")).toEqual([
      "custom-wallpapers",
      "settings",
    ]);
    expect(getLogicalCloudSyncDomainPhysicalParts("files")).toEqual([
      "files-images",
      "files-trash",
      "files-applets",
      "files-metadata",
    ]);
  });

  test("creates an empty logical metadata map", () => {
    expect(createEmptyLogicalCloudSyncMetadataMap()).toEqual({
      settings: null,
      files: null,
      songs: null,
      videos: null,
      stickies: null,
      calendar: null,
      contacts: null,
    });
  });

  test("aggregates settings and files metadata from physical parts", () => {
    const metadata = createEmptyCloudSyncMetadataMap();
    metadata.settings = {
      updatedAt: "2026-03-15T10:00:00.000Z",
      createdAt: "2026-03-15T09:00:00.000Z",
      version: 1,
      totalSize: 100,
      syncVersion: null,
    };
    metadata["custom-wallpapers"] = {
      updatedAt: "2026-03-15T10:05:00.000Z",
      createdAt: "2026-03-15T08:00:00.000Z",
      version: 1,
      totalSize: 250,
      syncVersion: null,
    };
    metadata["files-metadata"] = {
      updatedAt: "2026-03-15T09:30:00.000Z",
      createdAt: "2026-03-15T09:00:00.000Z",
      version: 1,
      totalSize: 80,
      syncVersion: null,
    };
    metadata["files-images"] = {
      updatedAt: "2026-03-15T09:45:00.000Z",
      createdAt: "2026-03-15T09:15:00.000Z",
      version: 1,
      totalSize: 500,
      syncVersion: null,
    };

    const aggregated = aggregateLogicalCloudSyncMetadata(metadata);

    expect(aggregated.settings).toMatchObject({
      updatedAt: "2026-03-15T10:05:00.000Z",
      createdAt: "2026-03-15T08:00:00.000Z",
      totalSize: 350,
    });
    expect(Object.keys(aggregated.settings?.parts || {}).sort()).toEqual([
      "custom-wallpapers",
      "settings",
    ]);

    expect(aggregated.files).toMatchObject({
      updatedAt: "2026-03-15T09:45:00.000Z",
      createdAt: "2026-03-15T09:00:00.000Z",
      totalSize: 580,
    });
    expect(Object.keys(aggregated.files?.parts || {}).sort()).toEqual([
      "files-images",
      "files-metadata",
    ]);
  });
});

