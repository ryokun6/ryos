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
  shouldDelaySettingsUploadForWallpaperSync,
  shouldRecheckRemoteAfterLocalSync,
} from "../src/utils/cloudSyncShared";
import {
  filterDeletedFilePaths,
  filterDeletedIds,
  mergeDeletionMarkerMaps,
} from "../src/utils/cloudSyncDeletionMarkers";
import { mergeFilesMetadataSnapshots } from "../src/utils/cloudSyncFileMerge";
import {
  planIndividualBlobDownload,
  planIndividualBlobUpload,
} from "../src/utils/cloudSyncIndividualBlobMerge";
import {
  mergeSettingsSnapshotData,
  shouldRestoreLegacyCustomWallpapers,
} from "../src/utils/cloudSyncSettingsMerge";
import {
  advanceCloudSyncVersion,
  assessCloudSyncWrite,
} from "../src/utils/cloudSyncVersion";
import { areRomanizationSettingsEqual } from "../src/types/lyrics";

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

  test("delays settings upload until an active custom wallpaper blob syncs", () => {
    expect(
      shouldDelaySettingsUploadForWallpaperSync({
        currentWallpaper: "indexeddb://wallpaper-1",
        customWallpapersEnabled: true,
        customWallpapersLastLocalChangeAt: "2026-03-15T04:00:10.000Z",
        customWallpapersLastUploadedAt: "2026-03-15T04:00:00.000Z",
        customWallpapersHasPendingUpload: false,
        settingsQueuedAtMs: 1_000,
        nowMs: 5_000,
        maxWaitMs: 20_000,
      })
    ).toBe(true);

    expect(
      shouldDelaySettingsUploadForWallpaperSync({
        currentWallpaper: "indexeddb://wallpaper-1",
        customWallpapersEnabled: true,
        customWallpapersLastLocalChangeAt: "2026-03-15T04:00:00.000Z",
        customWallpapersLastUploadedAt: "2026-03-15T04:00:00.000Z",
        customWallpapersHasPendingUpload: true,
        settingsQueuedAtMs: 1_000,
        nowMs: 5_000,
        maxWaitMs: 20_000,
      })
    ).toBe(true);

    expect(
      shouldDelaySettingsUploadForWallpaperSync({
        currentWallpaper: "/wallpapers/photos/aqua/water.jpg",
        customWallpapersEnabled: true,
        customWallpapersLastLocalChangeAt: "2026-03-15T04:00:10.000Z",
        customWallpapersLastUploadedAt: "2026-03-15T04:00:00.000Z",
        customWallpapersHasPendingUpload: false,
        settingsQueuedAtMs: 1_000,
        nowMs: 5_000,
        maxWaitMs: 20_000,
      })
    ).toBe(false);

    expect(
      shouldDelaySettingsUploadForWallpaperSync({
        currentWallpaper: "indexeddb://wallpaper-1",
        customWallpapersEnabled: true,
        customWallpapersLastLocalChangeAt: "2026-03-15T04:00:10.000Z",
        customWallpapersLastUploadedAt: "2026-03-15T04:00:00.000Z",
        customWallpapersHasPendingUpload: false,
        settingsQueuedAtMs: 1_000,
        nowMs: 25_500,
        maxWaitMs: 20_000,
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
