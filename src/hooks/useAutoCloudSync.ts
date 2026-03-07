import { useCallback, useEffect, useMemo, useRef } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useDockStore } from "@/stores/useDockStore";
import { useStickiesStore } from "@/stores/useStickiesStore";

import { useCalendarStore } from "@/stores/useCalendarStore";
import { subscribeToCloudSyncDomainChanges } from "@/utils/cloudSyncEvents";
import {
  downloadAndApplyCloudSyncDomain,
  fetchCloudSyncMetadata,
  uploadCloudSyncDomain,
} from "@/utils/cloudSync";
import {
  CLOUD_SYNC_DOMAINS,
  parseCloudSyncTimestamp,
  shouldApplyRemoteUpdate,
  type CloudSyncDomain,
} from "@/utils/cloudSyncShared";

const POLL_INTERVAL_MS = 5 * 60 * 1000;
const REMOTE_APPLY_SUPPRESSION_MS = 4000;

const UPLOAD_DEBOUNCE_MS: Record<CloudSyncDomain, number> = {
  settings: 2500,
  "files-metadata": 4000,
  "files-documents": 8000,
  "files-images": 8000,
  "files-trash": 5000,
  "files-applets": 8000,
  songs: 4000,
  videos: 4000,
  stickies: 3000,
  calendar: 4000,
  "custom-wallpapers": 8000,
};

function createDomainStringMap(initialValue: string | null): Record<CloudSyncDomain, string | null> {
  return {
    settings: initialValue,
    "files-metadata": initialValue,
    "files-documents": initialValue,
    "files-images": initialValue,
    "files-trash": initialValue,
    "files-applets": initialValue,
    songs: initialValue,
    videos: initialValue,
    stickies: initialValue,
    calendar: initialValue,
    "custom-wallpapers": initialValue,
  };
}

export function useAutoCloudSync() {
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);
  const autoSyncEnabled = useCloudSyncStore((state) => state.autoSyncEnabled);
  const syncFiles = useCloudSyncStore((state) => state.syncFiles);
  const syncSettings = useCloudSyncStore((state) => state.syncSettings);
  const syncSongs = useCloudSyncStore((state) => state.syncSongs);
  const syncVideos = useCloudSyncStore((state) => state.syncVideos);
  const syncStickies = useCloudSyncStore((state) => state.syncStickies);
  const syncCalendar = useCloudSyncStore((state) => state.syncCalendar);

  const uploadTimersRef = useRef<
    Partial<Record<CloudSyncDomain, ReturnType<typeof setTimeout>>>
  >({});
  const lastLocalChangeAtRef = useRef<Record<CloudSyncDomain, string | null>>(
    createDomainStringMap(null)
  );
  const remoteApplySuppressUntilRef = useRef<Record<CloudSyncDomain, number>>({
    settings: 0,
    "files-metadata": 0,
    "files-documents": 0,
    "files-images": 0,
    "files-trash": 0,
    "files-applets": 0,
    songs: 0,
    videos: 0,
    stickies: 0,
    calendar: 0,
    "custom-wallpapers": 0,
  });
  const checkInFlightRef = useRef(false);

  const isSyncActive = Boolean(username && authToken && autoSyncEnabled);

  const enabledDomainsKey = useMemo(
    () =>
      [
        syncSettings ? "1" : "0",
        syncFiles ? "1" : "0",
        syncSongs ? "1" : "0",
        syncVideos ? "1" : "0",
        syncStickies ? "1" : "0",
        syncCalendar ? "1" : "0",
      ].join(""),
    [syncCalendar, syncFiles, syncSettings, syncSongs, syncStickies, syncVideos]
  );

  const clearUploadTimer = useCallback((domain: CloudSyncDomain) => {
    const timer = uploadTimersRef.current[domain];
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    delete uploadTimersRef.current[domain];
  }, []);

  const clearAllUploadTimers = useCallback(() => {
    for (const domain of CLOUD_SYNC_DOMAINS) {
      clearUploadTimer(domain);
    }
  }, [clearUploadTimer]);

  const isDomainEnabled = useCallback((domain: CloudSyncDomain): boolean => {
    const syncState = useCloudSyncStore.getState();
    return syncState.autoSyncEnabled && syncState.isDomainEnabled(domain);
  }, []);

  const uploadDomain = useCallback(
    async (domain: CloudSyncDomain) => {
      clearUploadTimer(domain);

      if (!username || !authToken || !isDomainEnabled(domain)) {
        return;
      }

      const syncState = useCloudSyncStore.getState();
      syncState.markUploadStart(domain);

      try {
        console.log(`[CloudSync] Uploading ${domain}...`);
        const metadata = await uploadCloudSyncDomain(domain, {
          username,
          authToken,
        });

        console.log(`[CloudSync] Upload ${domain} succeeded`, metadata.updatedAt);
        syncState.markUploadSuccess(domain, metadata.updatedAt);
        syncState.updateRemoteMetadataForDomain(domain, metadata);

        const currentLastChange = lastLocalChangeAtRef.current[domain];
        if (
          parseCloudSyncTimestamp(currentLastChange) <=
          parseCloudSyncTimestamp(metadata.updatedAt)
        ) {
          lastLocalChangeAtRef.current[domain] = metadata.updatedAt;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : `Failed to sync ${domain}.`;
        console.error(`[CloudSync] Upload ${domain} FAILED:`, message, error);
        useCloudSyncStore.getState().markUploadFailure(domain, message);
      }
    },
    [authToken, clearUploadTimer, isDomainEnabled, username]
  );

  const queueUpload = useCallback(
    (domain: CloudSyncDomain) => {
      if (!isSyncActive || !isDomainEnabled(domain)) {
        console.log(`[CloudSync] queueUpload(${domain}) skipped: syncActive=${isSyncActive}, enabled=${isDomainEnabled(domain)}`);
        return;
      }

      if (Date.now() < remoteApplySuppressUntilRef.current[domain]) {
        console.log(`[CloudSync] queueUpload(${domain}) skipped: suppressed for ${remoteApplySuppressUntilRef.current[domain] - Date.now()}ms`);
        return;
      }

      console.log(`[CloudSync] queueUpload(${domain}) — debounce ${UPLOAD_DEBOUNCE_MS[domain]}ms`);
      lastLocalChangeAtRef.current[domain] = new Date().toISOString();
      clearUploadTimer(domain);
      uploadTimersRef.current[domain] = setTimeout(() => {
        void uploadDomain(domain);
      }, UPLOAD_DEBOUNCE_MS[domain]);
    },
    [clearUploadTimer, isDomainEnabled, isSyncActive, uploadDomain]
  );

  const checkRemoteUpdates = useCallback(async () => {
    if (!username || !authToken || !isSyncActive || checkInFlightRef.current) {
      return;
    }

    checkInFlightRef.current = true;
    useCloudSyncStore.getState().setCheckingRemote(true);

    try {
      const metadataMap = await fetchCloudSyncMetadata({ username, authToken });
      useCloudSyncStore.getState().setRemoteMetadata(metadataMap);
      useCloudSyncStore.getState().setLastError(null);

      // Pre-suppress ALL domains before applying any. Applying one domain
      // can trigger side-effect uploads on another (e.g. settings apply
      // changes currentWallpaper → subscriber queues custom-wallpapers
      // upload while IndexedDB is still empty). A generous window ensures
      // the entire batch completes before any upload can fire.
      const batchSuppressUntil = Date.now() + 120_000;
      for (const d of CLOUD_SYNC_DOMAINS) {
        remoteApplySuppressUntilRef.current[d] = batchSuppressUntil;
      }

      const appliedDomains: CloudSyncDomain[] = [];

      for (const domain of CLOUD_SYNC_DOMAINS) {
        if (!isDomainEnabled(domain)) {
          continue;
        }

        const remoteMetadata = metadataMap[domain];
        const syncState = useCloudSyncStore.getState();
        const domainStatus = syncState.domainStatus[domain];

        const shouldApply = shouldApplyRemoteUpdate({
          remoteUpdatedAt: remoteMetadata?.updatedAt,
          lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
          lastUploadedAt: domainStatus.lastUploadedAt,
          lastLocalChangeAt: lastLocalChangeAtRef.current[domain],
          hasPendingUpload:
            Boolean(uploadTimersRef.current[domain]) || domainStatus.isUploading,
        });

        if (!shouldApply || !remoteMetadata) {
          continue;
        }

        const appliedMetadata = await downloadAndApplyCloudSyncDomain(domain, {
          username,
          authToken,
        });

        useCloudSyncStore
          .getState()
          .markRemoteApplied(domain, appliedMetadata.updatedAt);
        lastLocalChangeAtRef.current[domain] = appliedMetadata.updatedAt;
        appliedDomains.push(domain);
      }

      // Narrow suppression: applied domains get a short post-apply window,
      // all others are released immediately.
      const postApplyUntil = Date.now() + REMOTE_APPLY_SUPPRESSION_MS;
      for (const d of CLOUD_SYNC_DOMAINS) {
        remoteApplySuppressUntilRef.current[d] = appliedDomains.includes(d)
          ? postApplyUntil
          : 0;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to check cloud sync.";
      useCloudSyncStore.getState().setLastError(message);
    } finally {
      useCloudSyncStore.getState().setCheckingRemote(false);
      checkInFlightRef.current = false;
    }
  }, [authToken, isDomainEnabled, isSyncActive, username]);

  useEffect(() => {
    if (!isSyncActive) {
      clearAllUploadTimers();
      return;
    }

    const filesUnsubscribe = useFilesStore.subscribe((state, prevState) => {
      if (
        state.items !== prevState.items ||
        state.libraryState !== prevState.libraryState
      ) {
        queueUpload("files-metadata");
      }
    });

    const syncEventsUnsubscribe = subscribeToCloudSyncDomainChanges((domain) => {
      console.log(`[CloudSync] Domain change event received: ${domain}`);
      queueUpload(domain);
    });

    const themeUnsubscribe = useThemeStore.subscribe((state, prevState) => {
      if (state.current !== prevState.current) {
        queueUpload("settings");
      }
    });

    const languageUnsubscribe = useLanguageStore.subscribe((state, prevState) => {
      if (state.current !== prevState.current) {
        queueUpload("settings");
      }
    });

    const displayUnsubscribe = useDisplaySettingsStore.subscribe(
      (state, prevState) => {
        if (
          state.displayMode !== prevState.displayMode ||
          state.shaderEffectEnabled !== prevState.shaderEffectEnabled ||
          state.selectedShaderType !== prevState.selectedShaderType ||
          state.currentWallpaper !== prevState.currentWallpaper ||
          state.screenSaverEnabled !== prevState.screenSaverEnabled ||
          state.screenSaverType !== prevState.screenSaverType ||
          state.screenSaverIdleTime !== prevState.screenSaverIdleTime ||
          state.debugMode !== prevState.debugMode ||
          state.htmlPreviewSplit !== prevState.htmlPreviewSplit
        ) {
          queueUpload("settings");
        }
        if (
          state.currentWallpaper !== prevState.currentWallpaper &&
          state.currentWallpaper.startsWith("indexeddb://")
        ) {
          queueUpload("custom-wallpapers");
        }
      }
    );

    const audioUnsubscribe = useAudioSettingsStore.subscribe(
      (state, prevState) => {
        if (
          state.masterVolume !== prevState.masterVolume ||
          state.uiVolume !== prevState.uiVolume ||
          state.chatSynthVolume !== prevState.chatSynthVolume ||
          state.speechVolume !== prevState.speechVolume ||
          state.ipodVolume !== prevState.ipodVolume ||
          state.uiSoundsEnabled !== prevState.uiSoundsEnabled ||
          state.terminalSoundsEnabled !== prevState.terminalSoundsEnabled ||
          state.typingSynthEnabled !== prevState.typingSynthEnabled ||
          state.speechEnabled !== prevState.speechEnabled ||
          state.keepTalkingEnabled !== prevState.keepTalkingEnabled ||
          state.ttsModel !== prevState.ttsModel ||
          state.ttsVoice !== prevState.ttsVoice ||
          state.synthPreset !== prevState.synthPreset
        ) {
          queueUpload("settings");
        }
      }
    );

    const appUnsubscribe = useAppStore.subscribe((state, prevState) => {
      if (state.aiModel !== prevState.aiModel) {
        queueUpload("settings");
      }
    });

    const ipodSettingsUnsubscribe = useIpodStore.subscribe(
      (state, prevState) => {
        if (
          state.displayMode !== prevState.displayMode ||
          state.showLyrics !== prevState.showLyrics ||
          state.lyricsAlignment !== prevState.lyricsAlignment ||
          state.lyricsFont !== prevState.lyricsFont ||
          state.romanization !== prevState.romanization ||
          state.lyricsTranslationLanguage !== prevState.lyricsTranslationLanguage ||
          state.theme !== prevState.theme ||
          state.lcdFilterOn !== prevState.lcdFilterOn
        ) {
          queueUpload("settings");
        }
      }
    );

    const songsUnsubscribe = useIpodStore.subscribe((state, prevState) => {
      if (
        state.tracks !== prevState.tracks ||
        state.libraryState !== prevState.libraryState ||
        state.lastKnownVersion !== prevState.lastKnownVersion
      ) {
        queueUpload("songs");
      }
    });

    const videosUnsubscribe = useVideoStore.subscribe((state, prevState) => {
      if (state.videos !== prevState.videos) {
        queueUpload("videos");
      }
    });

    const dockUnsubscribe = useDockStore.subscribe((state, prevState) => {
      if (
        state.pinnedItems !== prevState.pinnedItems ||
        state.scale !== prevState.scale ||
        state.hiding !== prevState.hiding ||
        state.magnification !== prevState.magnification
      ) {
        queueUpload("settings");
      }
    });

    const stickiesUnsubscribe = useStickiesStore.subscribe(
      (state, prevState) => {
        if (state.notes !== prevState.notes) {
          queueUpload("stickies");
        }
      }
    );

    const calendarUnsubscribe = useCalendarStore.subscribe((state, prevState) => {
      if (
        state.events !== prevState.events ||
        state.calendars !== prevState.calendars ||
        state.todos !== prevState.todos
      ) {
        queueUpload("calendar");
      }
    });

    // Clear any uploads queued by store hydration/initialization so the
    // first remote check can pull down data without being blocked by
    // "has pending upload" guards (e.g. initializeLibrary on new devices).
    clearAllUploadTimers();
    for (const d of CLOUD_SYNC_DOMAINS) {
      lastLocalChangeAtRef.current[d] = null;
    }

    void checkRemoteUpdates().then(async () => {
      if (!isDomainEnabled("custom-wallpapers")) {
        console.log("[CloudSync] custom-wallpapers domain not enabled, skipping initial upload check");
        return;
      }
      const localRefs = await useDisplaySettingsStore
        .getState()
        .loadCustomWallpapers();
      console.log(`[CloudSync] Initial check: ${localRefs.length} local custom wallpapers found`);
      if (localRefs.length === 0) return;
      setTimeout(
        () => queueUpload("custom-wallpapers"),
        REMOTE_APPLY_SUPPRESSION_MS + 1000
      );
    });
    const intervalId = setInterval(() => {
      void checkRemoteUpdates();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      clearAllUploadTimers();
      filesUnsubscribe();
      syncEventsUnsubscribe();
      themeUnsubscribe();
      languageUnsubscribe();
      displayUnsubscribe();
      audioUnsubscribe();
      appUnsubscribe();
      ipodSettingsUnsubscribe();
      songsUnsubscribe();
      videosUnsubscribe();
      dockUnsubscribe();
      stickiesUnsubscribe();
      calendarUnsubscribe();
    };
  }, [
    checkRemoteUpdates,
    clearAllUploadTimers,
    enabledDomainsKey,
    isSyncActive,
    queueUpload,
  ]);
}
