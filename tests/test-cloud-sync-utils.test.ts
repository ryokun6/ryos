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
  shouldRecheckRemoteAfterLocalSync,
} from "../src/utils/cloudSyncShared";
import {
  filterDeletedFilePaths,
  filterDeletedIds,
  mergeDeletionMarkerMaps,
} from "../src/utils/cloudSyncDeletionMarkers";
import {
  applyFilesMetadataRedisPatch,
  buildFilesMetadataRedisPatch,
  getLocalDocumentKeysRequiredForFilesMetadataMerge,
  mergeFilesMetadataSnapshots,
} from "../src/utils/cloudSyncFileMerge";
import {
  planIndividualBlobDownload,
  planIndividualBlobUpload,
} from "../src/utils/cloudSyncIndividualBlobMerge";
import {
  applySettingsRedisPatch,
  buildSettingsRedisPatch,
  getSettingsSectionsToPatchUpload,
  mergeSettingsSnapshotData,
  normalizeSettingsSnapshotData,
  shouldRestoreLegacyCustomWallpapers,
} from "../src/utils/cloudSyncSettingsMerge";
import type { SettingsSnapshotData } from "../src/utils/cloudSyncSettingsMerge";
import {
  advanceCloudSyncVersion,
  assessCloudSyncWrite,
} from "../src/utils/cloudSyncVersion";
import { areRomanizationSettingsEqual } from "../src/types/lyrics";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

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
    expect(isIndividualBlobSyncDomain("files-trash")).toBe(true);
    expect(isIndividualBlobSyncDomain("files-applets")).toBe(true);
    expect(isIndividualBlobSyncDomain("custom-wallpapers")).toBe(true);
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
    expect(getCloudSyncCategory("custom-wallpapers")).toBe("files");
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
        "2026-03-04T12:01:00.000Z",
        "2026-03-04T12:00:00.000Z",
        "2026-03-04T12:01:00.000Z"
      )
    ).toBe(false);
    expect(
      hasUnsyncedLocalChanges(
        "2026-03-04T12:00:00.000Z",
        "2026-03-04T12:00:00.000Z",
        null,
        true
      )
    ).toBe(true);
  });

  test("treats remote-applied timestamps as already acknowledged", () => {
    expect(
      shouldApplyRemoteUpdate({
        remoteUpdatedAt: "2026-03-04T12:06:00.000Z",
        lastAppliedRemoteAt: "2026-03-04T12:04:00.000Z",
        lastUploadedAt: "2026-03-04T12:02:00.000Z",
        lastLocalChangeAt: "2026-03-04T12:04:00.000Z",
        hasPendingUpload: false,
      })
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

  test("prefers server revision numbers over timestamps when available", () => {
    expect(
      shouldApplyRemoteUpdate({
        remoteUpdatedAt: "2026-03-04T11:59:00.000Z",
        remoteSyncVersion: {
          serverVersion: 3,
          latestClientId: "client-b",
          latestClientVersion: 1,
          clientVersions: {
            "client-a": 1,
            "client-b": 1,
          },
        },
        lastAppliedRemoteAt: "2026-03-04T12:04:00.000Z",
        lastUploadedAt: "2026-03-04T12:04:00.000Z",
        lastLocalChangeAt: "2026-03-04T12:04:00.000Z",
        lastKnownServerVersion: 2,
      })
    ).toBe(true);
  });

  test("queues a follow-up remote check when local sync temporarily blocks apply", () => {
    expect(
      shouldRecheckRemoteAfterLocalSync({
        remoteUpdatedAt: "2026-03-04T12:05:00.000Z",
        lastAppliedRemoteAt: "2026-03-04T12:00:00.000Z",
        lastUploadedAt: "2026-03-04T12:02:00.000Z",
        lastLocalChangeAt: "2026-03-04T12:03:00.000Z",
        hasPendingUpload: true,
      })
    ).toBe(true);

    expect(
      shouldRecheckRemoteAfterLocalSync({
        remoteUpdatedAt: "2026-03-04T11:59:00.000Z",
        lastAppliedRemoteAt: "2026-03-04T12:04:00.000Z",
        lastUploadedAt: "2026-03-04T12:04:00.000Z",
        lastLocalChangeAt: "2026-03-04T12:05:00.000Z",
        hasPendingUpload: true,
      })
    ).toBe(false);

    expect(
      shouldRecheckRemoteAfterLocalSync({
        remoteUpdatedAt: "2026-03-04T12:05:00.000Z",
        remoteSyncVersion: {
          serverVersion: 3,
          latestClientId: "client-b",
          latestClientVersion: 1,
          clientVersions: {
            "client-a": 1,
            "client-b": 1,
          },
        },
        lastAppliedRemoteAt: "2026-03-04T12:04:00.000Z",
        lastUploadedAt: "2026-03-04T12:04:00.000Z",
        lastLocalChangeAt: "2026-03-04T12:05:00.000Z",
        hasPendingUpload: true,
        lastKnownServerVersion: 2,
      })
    ).toBe(true);

    expect(
      shouldRecheckRemoteAfterLocalSync({
        remoteUpdatedAt: "2026-03-04T12:05:00.000Z",
        lastAppliedRemoteAt: "2026-03-04T12:00:00.000Z",
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

  test("merges file metadata snapshots per path", () => {
    const merged = mergeFilesMetadataSnapshots(
      {
        items: {
          "/Documents/local.md": {
            path: "/Documents/local.md",
            name: "local.md",
            isDirectory: false,
            uuid: "local-doc",
            modifiedAt: 200,
            createdAt: 100,
            status: "active",
            type: "markdown",
          },
        },
        libraryState: "loaded",
        documents: [
          {
            key: "local-doc",
            value: { name: "local.md", content: "local content" },
          },
        ],
        deletedPaths: {},
      },
      {
        items: {
          "/Documents/remote.md": {
            path: "/Documents/remote.md",
            name: "remote.md",
            isDirectory: false,
            uuid: "remote-doc",
            modifiedAt: 250,
            createdAt: 150,
            status: "active",
            type: "markdown",
          },
        },
        libraryState: "loaded",
        documents: [
          {
            key: "remote-doc",
            value: { name: "remote.md", content: "remote content" },
          },
        ],
        deletedPaths: {},
      }
    );

    expect(Object.keys(merged.items).sort()).toEqual([
      "/Documents/local.md",
      "/Documents/remote.md",
    ]);
    expect(merged.documents?.map((item) => item.key).sort()).toEqual([
      "local-doc",
      "remote-doc",
    ]);
  });

  test("prefers the newer file version and matching document payload", () => {
    const merged = mergeFilesMetadataSnapshots(
      {
        items: {
          "/Documents/shared.md": {
            path: "/Documents/shared.md",
            name: "shared.md",
            isDirectory: false,
            uuid: "local-doc",
            modifiedAt: 100,
            createdAt: 50,
            status: "active",
            type: "markdown",
          },
        },
        libraryState: "loaded",
        documents: [
          {
            key: "local-doc",
            value: { name: "shared.md", content: "local content" },
          },
        ],
        deletedPaths: {},
      },
      {
        items: {
          "/Documents/shared.md": {
            path: "/Documents/shared.md",
            name: "shared.md",
            isDirectory: false,
            uuid: "remote-doc",
            modifiedAt: 300,
            createdAt: 50,
            status: "active",
            type: "markdown",
          },
        },
        libraryState: "loaded",
        documents: [
          {
            key: "remote-doc",
            value: { name: "shared.md", content: "remote content" },
          },
        ],
        deletedPaths: {},
      }
    );

    expect(merged.items["/Documents/shared.md"]?.uuid).toBe("remote-doc");
    expect(merged.documents).toEqual([
      {
        key: "remote-doc",
        value: { name: "shared.md", content: "remote content" },
      },
    ]);
  });

  test("keeps recreated files when deletion markers are older", () => {
    const merged = mergeFilesMetadataSnapshots(
      {
        items: {
          "/Documents/recreated.md": {
            path: "/Documents/recreated.md",
            name: "recreated.md",
            isDirectory: false,
            uuid: "recreated-doc",
            modifiedAt: 500,
            createdAt: 400,
            status: "active",
            type: "markdown",
          },
        },
        libraryState: "loaded",
        documents: [
          {
            key: "recreated-doc",
            value: { name: "recreated.md", content: "restored content" },
          },
        ],
        deletedPaths: {},
      },
      {
        items: {},
        libraryState: "loaded",
        documents: [],
        deletedPaths: {
          "/Documents/recreated.md": "1970-01-01T00:00:00.450Z",
        },
      }
    );

    expect(merged.items["/Documents/recreated.md"]?.uuid).toBe("recreated-doc");
    expect(merged.deletedPaths).toEqual({});
  });

  test("getLocalDocumentKeysRequiredForFilesMetadataMerge lists only local-winning document UUIDs", () => {
    const keys = getLocalDocumentKeysRequiredForFilesMetadataMerge(
      {
        items: {
          "/Documents/a.md": {
            path: "/Documents/a.md",
            name: "a.md",
            isDirectory: false,
            uuid: "u-local",
            modifiedAt: 300,
            createdAt: 100,
            status: "active",
            type: "markdown",
          },
        },
        libraryState: "loaded",
        documents: [],
        deletedPaths: {},
      },
      {
        items: {
          "/Documents/b.md": {
            path: "/Documents/b.md",
            name: "b.md",
            isDirectory: false,
            uuid: "u-remote",
            modifiedAt: 400,
            createdAt: 100,
            status: "active",
            type: "markdown",
          },
        },
        libraryState: "loaded",
        documents: [
          {
            key: "u-remote",
            value: { name: "b.md", content: "r" },
          },
        ],
        deletedPaths: {},
      }
    );
    expect(keys.sort()).toEqual(["u-local"]);
  });

  test("buildFilesMetadataRedisPatch is null when merged matches remote", () => {
    const remote = {
      items: {
        "/Documents/x.md": {
          path: "/Documents/x.md",
          name: "x.md",
          isDirectory: false,
          uuid: "d1",
          modifiedAt: 1,
          createdAt: 1,
          status: "active",
          type: "markdown",
        },
      },
      libraryState: "loaded" as const,
      documents: [{ key: "d1", value: { content: "hi" } }],
      deletedPaths: {},
    };
    const merged = mergeFilesMetadataSnapshots(remote, remote);
    expect(buildFilesMetadataRedisPatch(merged, remote, "2026-01-01T00:00:00.000Z")).toBeNull();
  });

  test("applyFilesMetadataRedisPatch round-trips incremental file-metadata upload", () => {
    const remote = {
      items: {
        "/Documents/keep.md": {
          path: "/Documents/keep.md",
          name: "keep.md",
          isDirectory: false,
          uuid: "k",
          modifiedAt: 50,
          createdAt: 50,
          status: "active",
          type: "markdown",
        },
        "/Documents/old.md": {
          path: "/Documents/old.md",
          name: "old.md",
          isDirectory: false,
          uuid: "o",
          modifiedAt: 40,
          createdAt: 40,
          status: "active",
          type: "markdown",
        },
      },
      libraryState: "loaded" as const,
      documents: [
        { key: "k", value: { content: "k" } },
        { key: "o", value: { content: "o" } },
      ],
      deletedPaths: {},
    };
    const local = {
      items: {
        ...remote.items,
        "/Documents/new.md": {
          path: "/Documents/new.md",
          name: "new.md",
          isDirectory: false,
          uuid: "n",
          modifiedAt: 100,
          createdAt: 100,
          status: "active",
          type: "markdown",
        },
      },
      libraryState: "loaded" as const,
      documents: [
        ...(remote.documents || []),
        { key: "n", value: { content: "fresh" } },
      ],
      deletedPaths: {},
    };
    const merged = mergeFilesMetadataSnapshots(local, remote);
    const patch = buildFilesMetadataRedisPatch(
      merged,
      remote,
      "2026-01-01T00:00:00.000Z"
    );
    expect(patch).not.toBeNull();
    expect(Object.keys(patch!.items || {})).toEqual(["/Documents/new.md"]);
    expect(patch!.items?.["/Documents/new.md"]?.uuid).toBe("n");
    const roundTrip = applyFilesMetadataRedisPatch(remote, patch!);
    expect(Object.keys(roundTrip.items).sort()).toEqual(
      Object.keys(merged.items).sort()
    );
    for (const p of Object.keys(merged.items)) {
      expect(roundTrip.items[p]).toEqual(merged.items[p]);
    }
    const docByKey = (docs: typeof merged.documents) =>
      new Map((docs || []).map((d) => [d.key, d]));
    expect([...docByKey(roundTrip.documents).keys()].sort()).toEqual(
      [...docByKey(merged.documents).keys()].sort()
    );
    for (const k of docByKey(merged.documents).keys()) {
      expect(docByKey(roundTrip.documents).get(k)).toEqual(
        docByKey(merged.documents).get(k)
      );
    }
  });

  test("getSettingsSectionsToPatchUpload returns only sections with newer local timestamps", () => {
    const t1 = "2026-01-01T00:00:00.000Z";
    const t2 = "2026-01-05T00:00:00.000Z";
    const sectionUpdatedAt = {
      theme: t1,
      language: t1,
      display: t1,
      audio: t1,
      aiModel: t1,
      ipod: t1,
      dock: t1,
      dashboard: t1,
    };
    const remote = {
      theme: "xp",
      language: "en",
      languageInitialized: true,
      aiModel: null,
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "",
        currentWallpaper: "",
        screenSaverEnabled: false,
        screenSaverType: "",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: false,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: false,
        ttsModel: null,
        ttsVoice: null,
        synthPreset: "",
      },
      ipod: {
        displayMode: "browser" as const,
        showLyrics: true,
        lyricsAlignment: "center" as const,
        lyricsFont: "default" as const,
        romanization: {},
        lyricsTranslationLanguage: null,
        theme: "classic" as const,
        lcdFilterOn: false,
      },
      dock: { pinnedItems: [], scale: 1, hiding: false, magnification: false },
      dashboard: { widgets: [] },
      sectionUpdatedAt: { ...sectionUpdatedAt },
    };
    const local = {
      ...remote,
      theme: "aqua",
      sectionUpdatedAt: { ...sectionUpdatedAt, theme: t2 },
    };
    expect(getSettingsSectionsToPatchUpload(local, remote)).toEqual(["theme"]);
  });

  test("applySettingsRedisPatch applies incremental settings sections", () => {
    const t1 = "2026-01-01T00:00:00.000Z";
    const t2 = "2026-01-06T00:00:00.000Z";
    const sectionUpdatedAt = {
      theme: t1,
      language: t1,
      display: t1,
      audio: t1,
      aiModel: t1,
      ipod: t1,
      dock: t1,
      dashboard: t1,
    };
    const remote = {
      theme: "xp",
      language: "en",
      languageInitialized: true,
      aiModel: null,
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "",
        currentWallpaper: "",
        screenSaverEnabled: false,
        screenSaverType: "",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: false,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: false,
        ttsModel: null,
        ttsVoice: null,
        synthPreset: "",
      },
      ipod: {
        displayMode: "browser" as const,
        showLyrics: true,
        lyricsAlignment: "center" as const,
        lyricsFont: "default" as const,
        romanization: {},
        lyricsTranslationLanguage: null,
        theme: "classic" as const,
        lcdFilterOn: false,
      },
      dock: { pinnedItems: [], scale: 1, hiding: false, magnification: false },
      dashboard: { widgets: [] },
      sectionUpdatedAt: { ...sectionUpdatedAt },
    };
    const local = {
      ...remote,
      theme: "aqua",
      sectionUpdatedAt: { ...sectionUpdatedAt, theme: t2 },
    };
    const patch = buildSettingsRedisPatch(local, ["theme"], t1);
    expect(patch).not.toBeNull();
    const out = applySettingsRedisPatch(remote, patch!);
    expect(out.theme).toBe("aqua");
    expect(out.sectionUpdatedAt?.theme).toBe(t2);
    expect(out.language).toBe("en");
  });

  test("merges settings per store so newer local and remote sections both survive", () => {
    const merged = mergeSettingsSnapshotData(
      {
        theme: "xp",
        language: "en",
        languageInitialized: true,
        aiModel: "gpt-4o-mini",
        display: {
          displayMode: "color",
          shaderEffectEnabled: false,
          selectedShaderType: "aurora",
          currentWallpaper: "/wallpapers/local.jpg",
          screenSaverEnabled: false,
          screenSaverType: "starfield",
          screenSaverIdleTime: 5,
          debugMode: false,
          htmlPreviewSplit: true,
        },
        audio: {
          masterVolume: 0.5,
          uiVolume: 0.4,
          chatSynthVolume: 0.3,
          speechVolume: 0.2,
          ipodVolume: 0.1,
          uiSoundsEnabled: true,
          terminalSoundsEnabled: true,
          typingSynthEnabled: false,
          speechEnabled: false,
          keepTalkingEnabled: true,
          ttsModel: null,
          ttsVoice: null,
          synthPreset: "classic",
        },
        ipod: {
          displayMode: "video",
          showLyrics: true,
          lyricsAlignment: "alternating",
          lyricsFont: "serif-red",
          romanization: {
            enabled: true,
            japaneseFurigana: true,
            japaneseRomaji: false,
            korean: false,
            chinese: false,
            soramimi: false,
            soramamiTargetLanguage: "zh-TW",
            pronunciationOnly: false,
          },
          lyricsTranslationLanguage: "ja",
          theme: "classic",
          lcdFilterOn: true,
        },
        dock: {
          pinnedItems: [{ type: "app", id: "finder" }],
          scale: 1,
          hiding: false,
          magnification: true,
        },
        dashboard: {
          widgets: [],
        },
        sectionUpdatedAt: {
          theme: "2026-03-14T16:00:02.000Z",
          language: "2026-03-14T16:00:00.000Z",
          display: "2026-03-14T16:00:05.000Z",
          audio: "2026-03-14T16:00:00.000Z",
          aiModel: "2026-03-14T16:00:00.000Z",
          ipod: "2026-03-14T16:00:00.000Z",
          dock: "2026-03-14T16:00:00.000Z",
          dashboard: "2026-03-14T16:00:00.000Z",
        },
      },
      {
        theme: "macosx",
        language: "ko",
        languageInitialized: true,
        aiModel: "claude-3-5-sonnet-latest",
        display: {
          displayMode: "grayscale",
          shaderEffectEnabled: true,
          selectedShaderType: "matrix",
          currentWallpaper: "/wallpapers/remote.jpg",
          screenSaverEnabled: true,
          screenSaverType: "matrix",
          screenSaverIdleTime: 15,
          debugMode: true,
          htmlPreviewSplit: false,
        },
        audio: {
          masterVolume: 0.9,
          uiVolume: 0.8,
          chatSynthVolume: 0.7,
          speechVolume: 0.6,
          ipodVolume: 0.5,
          uiSoundsEnabled: false,
          terminalSoundsEnabled: false,
          typingSynthEnabled: true,
          speechEnabled: true,
          keepTalkingEnabled: false,
          ttsModel: "openai",
          ttsVoice: "alloy",
          synthPreset: "modern",
        },
        ipod: {
          displayMode: "cover",
          showLyrics: false,
          lyricsAlignment: "left",
          lyricsFont: "serif-red",
          romanization: {
            enabled: false,
            japaneseFurigana: false,
            japaneseRomaji: false,
            korean: false,
            chinese: false,
            soramimi: false,
            soramamiTargetLanguage: "zh-TW",
            pronunciationOnly: false,
          },
          lyricsTranslationLanguage: "en",
          theme: "u2",
          lcdFilterOn: false,
        },
        dock: {
          pinnedItems: [{ type: "app", id: "finder" }, { type: "app", id: "dashboard" }],
          scale: 1.2,
          hiding: true,
          magnification: false,
        },
        dashboard: {
          widgets: [{ id: "clock", type: "clock", position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }],
        },
        sectionUpdatedAt: {
          theme: "2026-03-14T16:00:01.000Z",
          language: "2026-03-14T16:00:03.000Z",
          display: "2026-03-14T16:00:04.000Z",
          audio: "2026-03-14T16:00:06.000Z",
          aiModel: "2026-03-14T16:00:03.000Z",
          ipod: "2026-03-14T16:00:03.000Z",
          dock: "2026-03-14T16:00:03.000Z",
          dashboard: "2026-03-14T16:00:03.000Z",
        },
      }
    );

    expect(merged.theme).toBe("xp");
    expect(merged.display.currentWallpaper).toBe("/wallpapers/local.jpg");
    expect(merged.language).toBe("ko");
    expect(merged.audio.masterVolume).toBe(0.9);
    expect(merged.aiModel).toBe("claude-3-5-sonnet-latest");
    expect(merged.dock?.scale).toBe(1.2);
    expect(merged.sectionUpdatedAt?.theme).toBe("2026-03-14T16:00:02.000Z");
    expect(merged.sectionUpdatedAt?.audio).toBe("2026-03-14T16:00:06.000Z");
  });

  test("remote ipod/dock/dashboard win when local has no section timestamp", () => {
    const localSnapshot: SettingsSnapshotData = {
      theme: "xp",
      language: "en",
      languageInitialized: true,
      aiModel: "gpt-4o-mini",
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "aurora",
        currentWallpaper: "/wallpapers/local.jpg",
        screenSaverEnabled: false,
        screenSaverType: "starfield",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: true,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: true,
        ttsModel: null,
        ttsVoice: null,
        synthPreset: "classic",
      },
      ipod: {
        displayMode: "video",
        showLyrics: false,
        lyricsAlignment: "center",
        lyricsFont: "sans",
        romanization: {
          enabled: false,
          japaneseFurigana: false,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        },
        lyricsTranslationLanguage: null,
        theme: "classic",
        lcdFilterOn: false,
      },
      dock: {
        pinnedItems: [],
        scale: 1,
        hiding: false,
        magnification: false,
      },
      sectionUpdatedAt: {
        theme: "2026-03-15T10:00:00.000Z",
      },
    };

    const remoteSnapshot: SettingsSnapshotData = {
      theme: "system7",
      language: "ja",
      languageInitialized: true,
      aiModel: "claude-3-5-sonnet-latest",
      display: {
        displayMode: "grayscale",
        shaderEffectEnabled: true,
        selectedShaderType: "matrix",
        currentWallpaper: "/wallpapers/remote.jpg",
        screenSaverEnabled: true,
        screenSaverType: "matrix",
        screenSaverIdleTime: 15,
        debugMode: false,
        htmlPreviewSplit: false,
      },
      audio: {
        masterVolume: 0.9,
        uiVolume: 0.8,
        chatSynthVolume: 0.7,
        speechVolume: 0.6,
        ipodVolume: 0.5,
        uiSoundsEnabled: false,
        terminalSoundsEnabled: false,
        typingSynthEnabled: true,
        speechEnabled: true,
        keepTalkingEnabled: false,
        ttsModel: "openai",
        ttsVoice: "alloy",
        synthPreset: "modern",
      },
      ipod: {
        displayMode: "cover",
        showLyrics: true,
        lyricsAlignment: "alternating",
        lyricsFont: "serif-red",
        romanization: {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        },
        lyricsTranslationLanguage: "ja",
        theme: "u2",
        lcdFilterOn: true,
      },
      dock: {
        pinnedItems: [{ type: "app", id: "finder" }],
        scale: 1.2,
        hiding: true,
        magnification: true,
      },
      dashboard: {
        widgets: [{ id: "clock", type: "clock", position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }],
      },
      sectionUpdatedAt: {
        theme: "2026-03-15T09:00:00.000Z",
        language: "2026-03-15T09:30:00.000Z",
        display: "2026-03-15T09:30:00.000Z",
        audio: "2026-03-15T09:30:00.000Z",
        aiModel: "2026-03-15T09:30:00.000Z",
        ipod: "2026-03-15T09:30:00.000Z",
        dock: "2026-03-15T09:30:00.000Z",
        dashboard: "2026-03-15T09:30:00.000Z",
      },
    };

    const merged = mergeSettingsSnapshotData(
      localSnapshot,
      remoteSnapshot,
      null,
      "2026-03-15T09:30:00.000Z"
    );

    expect(merged.theme).toBe("xp");
    expect(merged.sectionUpdatedAt?.theme).toBe("2026-03-15T10:00:00.000Z");

    expect(merged.ipod?.displayMode).toBe("cover");
    expect(merged.ipod?.showLyrics).toBe(true);
    expect(merged.ipod?.theme).toBe("u2");
    expect(merged.ipod?.lcdFilterOn).toBe(true);
    expect(merged.sectionUpdatedAt?.ipod).toBe("2026-03-15T09:30:00.000Z");

    expect(merged.dock?.scale).toBe(1.2);
    expect(merged.dock?.hiding).toBe(true);
    expect(merged.sectionUpdatedAt?.dock).toBe("2026-03-15T09:30:00.000Z");

    expect(merged.dashboard?.widgets).toHaveLength(1);
    expect(merged.sectionUpdatedAt?.dashboard).toBe("2026-03-15T09:30:00.000Z");

    expect(merged.language).toBe("ja");
    expect(merged.audio.masterVolume).toBe(0.9);
    expect(merged.aiModel).toBe("claude-3-5-sonnet-latest");
  });

  test("local fallback timestamp does not inflate missing section timestamps", () => {
    const localSnapshot: SettingsSnapshotData = {
      theme: "xp",
      language: "en",
      languageInitialized: true,
      aiModel: "gpt-4o-mini",
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "aurora",
        currentWallpaper: "/wallpapers/local.jpg",
        screenSaverEnabled: false,
        screenSaverType: "starfield",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: true,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: true,
        ttsModel: null,
        ttsVoice: null,
        synthPreset: "classic",
      },
      ipod: {
        displayMode: "video",
        showLyrics: false,
        lyricsAlignment: "center",
        lyricsFont: "sans",
        romanization: {
          enabled: false,
          japaneseFurigana: false,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        },
        lyricsTranslationLanguage: null,
        theme: "classic",
        lcdFilterOn: false,
      },
      sectionUpdatedAt: {
        theme: "2026-03-15T10:00:00.000Z",
      },
    };

    const remoteSnapshot: SettingsSnapshotData = {
      theme: "system7",
      language: "en",
      languageInitialized: true,
      aiModel: "gpt-4o-mini",
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "aurora",
        currentWallpaper: "/wallpapers/local.jpg",
        screenSaverEnabled: false,
        screenSaverType: "starfield",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: true,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: true,
        ttsModel: null,
        ttsVoice: null,
        synthPreset: "classic",
      },
      ipod: {
        displayMode: "cover",
        showLyrics: true,
        lyricsAlignment: "alternating",
        lyricsFont: "serif-red",
        romanization: {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        },
        lyricsTranslationLanguage: "ja",
        theme: "u2",
        lcdFilterOn: true,
      },
      sectionUpdatedAt: {
        ipod: "2026-03-15T09:30:00.000Z",
      },
    };

    const mergedWithInflation = mergeSettingsSnapshotData(
      localSnapshot,
      remoteSnapshot,
      "2026-03-15T11:00:00.000Z",
      "2026-03-15T09:30:00.000Z"
    );
    expect(mergedWithInflation.ipod?.displayMode).toBe("video");

    const mergedWithoutInflation = mergeSettingsSnapshotData(
      localSnapshot,
      remoteSnapshot,
      null,
      "2026-03-15T09:30:00.000Z"
    );
    expect(mergedWithoutInflation.ipod?.displayMode).toBe("cover");
    expect(mergedWithoutInflation.ipod?.showLyrics).toBe(true);
    expect(mergedWithoutInflation.ipod?.theme).toBe("u2");
  });

  test("normalizes undefined lyricsTranslationLanguage to null in ipod section", () => {
    const snapshot = {
      theme: "xp",
      language: "en" as const,
      languageInitialized: true,
      aiModel: "gpt-4o-mini" as const,
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "aurora",
        currentWallpaper: "/wallpapers/local.jpg",
        screenSaverEnabled: false,
        screenSaverType: "starfield",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: true,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: true,
        ttsModel: null as "openai" | "elevenlabs" | null,
        ttsVoice: null as string | null,
        synthPreset: "classic",
      },
      ipod: {
        displayMode: "video" as const,
        showLyrics: true,
        lyricsAlignment: "alternating" as const,
        lyricsFont: "serif-red" as const,
        romanization: {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW" as const,
          pronunciationOnly: false,
        },
        lyricsTranslationLanguage: undefined as unknown as string | null,
        theme: "classic" as const,
        lcdFilterOn: true,
      },
      sectionUpdatedAt: {},
    } as unknown as SettingsSnapshotData;

    const normalized = normalizeSettingsSnapshotData(snapshot, null);
    expect(normalized.ipod?.lyricsTranslationLanguage).toBeNull();
  });

  test("preserves explicit lyricsTranslationLanguage values during normalization", () => {
    const snapshot = {
      theme: "xp",
      language: "en" as const,
      languageInitialized: true,
      aiModel: "gpt-4o-mini" as const,
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "aurora",
        currentWallpaper: "/wallpapers/local.jpg",
        screenSaverEnabled: false,
        screenSaverType: "starfield",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: true,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: true,
        ttsModel: null as "openai" | "elevenlabs" | null,
        ttsVoice: null as string | null,
        synthPreset: "classic",
      },
      ipod: {
        displayMode: "video" as const,
        showLyrics: true,
        lyricsAlignment: "alternating" as const,
        lyricsFont: "serif-red" as const,
        romanization: {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW" as const,
          pronunciationOnly: false,
        },
        lyricsTranslationLanguage: "ja",
        theme: "classic" as const,
        lcdFilterOn: true,
      },
      sectionUpdatedAt: {},
    } as SettingsSnapshotData;

    const normalized = normalizeSettingsSnapshotData(snapshot, null);
    expect(normalized.ipod?.lyricsTranslationLanguage).toBe("ja");

    snapshot.ipod!.lyricsTranslationLanguage = null;
    const normalizedNull = normalizeSettingsSnapshotData(snapshot, null);
    expect(normalizedNull.ipod?.lyricsTranslationLanguage).toBeNull();

    snapshot.ipod!.lyricsTranslationLanguage = "auto";
    const normalizedAuto = normalizeSettingsSnapshotData(snapshot, null);
    expect(normalizedAuto.ipod?.lyricsTranslationLanguage).toBe("auto");
  });

  test("remote ipod section with undefined lyricsTranslationLanguage uses null when merged", () => {
    const local: SettingsSnapshotData = {
      theme: "xp",
      language: "en",
      languageInitialized: true,
      aiModel: "gpt-4o-mini",
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "aurora",
        currentWallpaper: "/wallpapers/local.jpg",
        screenSaverEnabled: false,
        screenSaverType: "starfield",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: true,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: true,
        ttsModel: null,
        ttsVoice: null,
        synthPreset: "classic",
      },
      ipod: {
        displayMode: "video",
        showLyrics: false,
        lyricsAlignment: "center",
        lyricsFont: "sans-serif",
        romanization: {
          enabled: false,
          japaneseFurigana: false,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        },
        lyricsTranslationLanguage: "en",
        theme: "classic",
        lcdFilterOn: false,
      },
      sectionUpdatedAt: {
        ipod: "2026-03-14T10:00:00.000Z",
      },
    };

    const remote = {
      ...local,
      ipod: {
        displayMode: "cover",
        showLyrics: true,
        lyricsAlignment: "alternating",
        lyricsFont: "serif-red",
        romanization: {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        },
        lyricsTranslationLanguage: undefined,
        theme: "u2",
        lcdFilterOn: true,
      },
      sectionUpdatedAt: {
        ipod: "2026-03-14T12:00:00.000Z",
      },
    } as unknown as SettingsSnapshotData;

    const merged = mergeSettingsSnapshotData(local, remote);

    expect(merged.ipod?.showLyrics).toBe(true);
    expect(merged.ipod?.theme).toBe("u2");
    expect(merged.ipod?.lyricsTranslationLanguage).toBeNull();
  });

  test("preserves local settings when remote snapshot has undefined sections", () => {
    const localSnapshot = {
      theme: "xp",
      language: "en" as const,
      languageInitialized: true,
      aiModel: "gpt-4o-mini" as const,
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "aurora",
        currentWallpaper: "/wallpapers/local.jpg",
        screenSaverEnabled: false,
        screenSaverType: "starfield",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: true,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: true,
        ttsModel: null as "openai" | "elevenlabs" | null,
        ttsVoice: null as string | null,
        synthPreset: "classic",
      },
      sectionUpdatedAt: {
        theme: "2026-03-14T16:00:00.000Z",
        language: "2026-03-14T16:00:00.000Z",
        display: "2026-03-14T16:00:00.000Z",
        audio: "2026-03-14T16:00:00.000Z",
        aiModel: "2026-03-14T16:00:00.000Z",
      },
    };

    const malformedRemote = {
      sectionUpdatedAt: {
        theme: "2026-03-14T16:00:05.000Z",
        language: "2026-03-14T16:00:05.000Z",
        display: "2026-03-14T16:00:05.000Z",
        audio: "2026-03-14T16:00:05.000Z",
        aiModel: "2026-03-14T16:00:05.000Z",
      },
    } as unknown as Parameters<typeof mergeSettingsSnapshotData>[1];

    const merged = mergeSettingsSnapshotData(localSnapshot, malformedRemote);

    expect(merged.theme).toBe("xp");
    expect(merged.language).toBe("en");
    expect(merged.display.currentWallpaper).toBe("/wallpapers/local.jpg");
    expect(merged.audio.masterVolume).toBe(0.5);
    expect(merged.aiModel).toBe("gpt-4o-mini");
  });

  test("hydrates remote-winning settings sections locally after upload resolution", async () => {
    const browserGlobals = globalThis as typeof globalThis & {
      localStorage?: Storage;
      document?: Document;
      window?: Window & typeof globalThis;
      fetch?: typeof fetch;
    };
    const originalLocalStorage = browserGlobals.localStorage;
    const originalDocument = browserGlobals.document;
    const originalWindow = browserGlobals.window;
    const originalFetch = browserGlobals.fetch;

    browserGlobals.localStorage = new MemoryStorage();
    browserGlobals.document = {
      documentElement: {
        dataset: {},
      },
      visibilityState: "visible",
      head: {
        appendChild: () => undefined,
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      createTextNode: () => ({}),
      createElement: () => ({
        dataset: {},
        styleSheet: null,
        appendChild: () => undefined,
        remove: () => undefined,
        replaceWith: () => undefined,
      }),
    } as unknown as Document;
    browserGlobals.window = {
      AudioContext: class {} as typeof AudioContext,
      document: browserGlobals.document,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as unknown as Window & typeof globalThis;
    browserGlobals.fetch = (async () =>
      new Response(JSON.stringify({ songs: [] }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      })) as typeof fetch;

    const { useThemeStore } = await import("../src/stores/useThemeStore");
    const {
      getSettingsSectionTimestampMap,
      setSettingsSectionTimestamps,
    } = await import("../src/sync/state");
    const { applyResolvedRedisUploadLocally } = await import(
      "../src/sync/domains"
    );

    const localTimestamp = "2026-03-15T10:00:00.000Z";
    const remoteThemeTimestamp = "2026-03-15T10:05:00.000Z";
    const resolvedSnapshot: SettingsSnapshotData = {
      theme: "macosx",
      language: "en",
      languageInitialized: true,
      aiModel: "gpt-4o-mini",
      display: {
        displayMode: "color",
        shaderEffectEnabled: false,
        selectedShaderType: "aurora",
        currentWallpaper: "/wallpapers/photos/aqua/water.jpg",
        screenSaverEnabled: false,
        screenSaverType: "starfield",
        screenSaverIdleTime: 5,
        debugMode: false,
        htmlPreviewSplit: true,
      },
      audio: {
        masterVolume: 0.5,
        uiVolume: 0.4,
        chatSynthVolume: 0.3,
        speechVolume: 0.2,
        ipodVolume: 0.1,
        uiSoundsEnabled: true,
        terminalSoundsEnabled: true,
        typingSynthEnabled: false,
        speechEnabled: false,
        keepTalkingEnabled: true,
        ttsModel: null,
        ttsVoice: null,
        synthPreset: "classic",
      },
      ipod: {
        displayMode: "video",
        showLyrics: true,
        lyricsAlignment: "alternating",
        lyricsFont: "serif-red",
        romanization: {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        },
        lyricsTranslationLanguage: "ja",
        theme: "classic",
        lcdFilterOn: true,
      },
      dock: {
        pinnedItems: [{ type: "app", id: "finder" }],
        scale: 1,
        hiding: false,
        magnification: true,
      },
      dashboard: {
        widgets: [],
      },
      sectionUpdatedAt: {
        theme: remoteThemeTimestamp,
        language: localTimestamp,
        display: localTimestamp,
        audio: localTimestamp,
        aiModel: localTimestamp,
        ipod: localTimestamp,
        dock: localTimestamp,
        dashboard: localTimestamp,
      },
    };

    try {
      useThemeStore.setState({ current: "system7" });
      setSettingsSectionTimestamps({
        theme: localTimestamp,
        language: localTimestamp,
        display: localTimestamp,
        audio: localTimestamp,
        aiModel: localTimestamp,
        ipod: localTimestamp,
        dock: localTimestamp,
        dashboard: localTimestamp,
      });

      await applyResolvedRedisUploadLocally(
        "settings",
        resolvedSnapshot,
        "2026-03-15T10:06:00.000Z"
      );

      expect(useThemeStore.getState().current).toBe("macosx");
      expect(getSettingsSectionTimestampMap().theme).toBe(remoteThemeTimestamp);
      expect(getSettingsSectionTimestampMap().language).toBe(localTimestamp);
    } finally {
      useThemeStore.setState({ current: "system7" });
      browserGlobals.localStorage = originalLocalStorage;
      browserGlobals.document = originalDocument;
      browserGlobals.window = originalWindow;
      browserGlobals.fetch = originalFetch;
    }
  });

  test("treats structurally equal romanization settings as unchanged", () => {
    expect(
      areRomanizationSettingsEqual(
        {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        },
        {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
        }
      )
    ).toBe(true);

    expect(
      areRomanizationSettingsEqual(
        {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: false,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        },
        {
          enabled: true,
          japaneseFurigana: true,
          japaneseRomaji: false,
          korean: false,
          chinese: false,
          soramimi: true,
          soramamiTargetLanguage: "zh-TW",
          pronunciationOnly: false,
        }
      )
    ).toBe(false);
  });

  test("restores legacy custom wallpapers only for first-time migration", () => {
    expect(
      shouldRestoreLegacyCustomWallpapers({
        legacyWallpaperCount: 2,
        localWallpaperCount: 0,
        hasDedicatedCustomWallpaperSync: false,
      })
    ).toBe(true);

    expect(
      shouldRestoreLegacyCustomWallpapers({
        legacyWallpaperCount: 2,
        localWallpaperCount: 1,
        hasDedicatedCustomWallpaperSync: false,
      })
    ).toBe(false);

    expect(
      shouldRestoreLegacyCustomWallpapers({
        legacyWallpaperCount: 2,
        localWallpaperCount: 0,
        hasDedicatedCustomWallpaperSync: true,
      })
    ).toBe(false);
  });

  test("preserves remote-only individual blob items on upload", () => {
    const plan = planIndividualBlobUpload(
      [
        {
          item: { key: "local-image", value: {} },
          signature: "local-signature",
        },
      ],
      {
        "remote-image": {
          signature: "remote-signature",
          updatedAt: "2026-03-14T04:00:00.000Z",
          size: 10,
          storageUrl: "remote://image",
        },
      },
      {},
      {}
    );

    expect(plan.itemsToUpload.map((record) => record.item.key)).toEqual([
      "local-image",
    ]);
    expect(Object.keys(plan.preservedRemoteItems)).toEqual(["remote-image"]);
  });

  test("preserves missing known individual blob items on upload", () => {
    const plan = planIndividualBlobUpload(
      [],
      {
        "remote-image": {
          signature: "remote-signature",
          updatedAt: "2026-03-14T04:00:00.000Z",
          size: 10,
          storageUrl: "remote://image",
        },
      },
      {
        "remote-image": {
          signature: "old-signature",
          updatedAt: "2026-03-14T03:00:00.000Z",
        },
      },
      {}
    );

    expect(plan.itemsToUpload).toEqual([]);
    expect(plan.preservedRemoteItems).toEqual({
      "remote-image": {
        signature: "remote-signature",
        updatedAt: "2026-03-14T04:00:00.000Z",
        size: 10,
        storageUrl: "remote://image",
      },
    });
  });

  test("preserves local-only individual blob items on download", () => {
    const plan = planIndividualBlobDownload(
      [
        {
          item: { key: "local-image", value: {} },
          signature: "local-signature",
        },
      ],
      {},
      {},
      {}
    );

    expect(plan.keysToDelete).toEqual([]);
    expect(plan.itemKeysToDownload).toEqual([]);
  });

  test("deletes unchanged synced individual blob items when remote removes them", () => {
    const plan = planIndividualBlobDownload(
      [
        {
          item: { key: "old-image", value: {} },
          signature: "same-signature",
        },
      ],
      {},
      {
        "old-image": {
          signature: "same-signature",
          updatedAt: "2026-03-14T03:00:00.000Z",
        },
      },
      {}
    );

    expect(plan.keysToDelete).toEqual(["old-image"]);
    expect(plan.itemKeysToDownload).toEqual([]);
  });

  test("re-downloads missing known individual blob items when local storage is empty", () => {
    const plan = planIndividualBlobDownload(
      [],
      {
        "remote-image": {
          signature: "remote-signature",
          updatedAt: "2026-03-14T04:00:00.000Z",
          size: 10,
          storageUrl: "remote://image",
        },
      },
      {
        "remote-image": {
          signature: "remote-signature",
          updatedAt: "2026-03-14T03:00:00.000Z",
        },
      },
      {}
    );

    expect(plan.itemKeysToDownload).toEqual(["remote-image"]);
    expect(plan.keysToDelete).toEqual([]);
    expect(plan.nextKnownItems).toEqual({});
  });

  test("preserves local individual blob edits when remote changed the same key", () => {
    const plan = planIndividualBlobDownload(
      [
        {
          item: { key: "shared-image", value: {} },
          signature: "local-signature",
        },
      ],
      {
        "shared-image": {
          signature: "remote-signature",
          updatedAt: "2026-03-14T04:00:00.000Z",
          size: 10,
          storageUrl: "remote://image",
        },
      },
      {
        "shared-image": {
          signature: "base-signature",
          updatedAt: "2026-03-14T03:00:00.000Z",
        },
      },
      {}
    );

    expect(plan.itemKeysToDownload).toEqual([]);
    expect(plan.keysToDelete).toEqual([]);
    expect(plan.nextKnownItems).toEqual({
      "shared-image": {
        signature: "base-signature",
        updatedAt: "2026-03-14T03:00:00.000Z",
      },
    });
  });

  test("rejects stale client writes that have not seen another client revision", () => {
    const firstWrite = advanceCloudSyncVersion(null, {
      clientId: "client-a",
      clientVersion: 1,
      baseServerVersion: null,
      knownClientVersions: {},
    });

    const secondWrite = advanceCloudSyncVersion(firstWrite, {
      clientId: "client-b",
      clientVersion: 1,
      baseServerVersion: 1,
      knownClientVersions: {
        "client-a": 1,
      },
    });

    expect(
      assessCloudSyncWrite(secondWrite, {
        clientId: "client-a",
        clientVersion: 2,
        baseServerVersion: 1,
        knownClientVersions: {
          "client-a": 1,
        },
      })
    ).toEqual({
      duplicate: false,
      canFastForward: false,
      hasConflict: true,
    });
  });
});
