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
import { useDashboardStore } from "@/stores/useDashboardStore";
import { useStickiesStore } from "@/stores/useStickiesStore";

import { useCalendarStore } from "@/stores/useCalendarStore";
import { useContactsStore } from "@/stores/useContactsStore";
import {
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import {
  subscribeToCloudSyncDomainChanges,
  subscribeToCloudSyncCheckRequests,
} from "@/utils/cloudSyncEvents";
import {
  downloadAndApplyCloudSyncDomain,
  fetchCloudSyncMetadata,
  getSyncSessionId,
  uploadCloudSyncDomain,
} from "@/utils/cloudSync";
import {
  CLOUD_SYNC_DOMAINS,
  CLOUD_SYNC_REMOTE_APPLY_DOMAINS,
  getLatestCloudSyncTimestamp,
  getSyncChannelName,
  hasUnsyncedLocalChanges,
  isCloudSyncDomain,
  parseCloudSyncTimestamp,
  shouldApplyRemoteUpdate,
  type CloudSyncDomain,
} from "@/utils/cloudSyncShared";
import type { CloudSyncVersionState } from "@/utils/cloudSyncVersion";

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const REMOTE_APPLY_SUPPRESSION_MS = 2000;

// Safety windows used while a download is in-flight. These are narrowed to
// REMOTE_APPLY_SUPPRESSION_MS once the download completes successfully, so
// they only need to cover the worst-case download duration.
const REALTIME_INFLIGHT_SUPPRESSION_MS = 30_000;
const BATCH_INFLIGHT_SUPPRESSION_MS = 60_000;

const UPLOAD_DEBOUNCE_MS: Record<CloudSyncDomain, number> = {
  settings: 2500,
  "files-metadata": 8000,
  "files-images": 8000,
  "files-trash": 5000,
  "files-applets": 8000,
  songs: 4000,
  videos: 4000,
  stickies: 3000,
  calendar: 4000,
  contacts: 3000,
  "custom-wallpapers": 8000,
};

function createDomainStringMap(initialValue: string | null): Record<CloudSyncDomain, string | null> {
  return {
    settings: initialValue,
    "files-metadata": initialValue,
    "files-images": initialValue,
    "files-trash": initialValue,
    "files-applets": initialValue,
    songs: initialValue,
    videos: initialValue,
    stickies: initialValue,
    calendar: initialValue,
    contacts: initialValue,
    "custom-wallpapers": initialValue,
  };
}

function getPersistedDeletionChangeAt(domain: CloudSyncDomain): string | null {
  const deletionMarkers = useCloudSyncStore.getState().deletionMarkers;

  switch (domain) {
    case "calendar":
      return getLatestCloudSyncTimestamp([
        ...Object.values(deletionMarkers.calendarTodoIds),
        ...Object.values(deletionMarkers.calendarEventIds),
        ...Object.values(deletionMarkers.calendarIds),
      ]);
    case "stickies":
      return getLatestCloudSyncTimestamp(
        Object.values(deletionMarkers.stickyNoteIds)
      );
    case "contacts":
      return getLatestCloudSyncTimestamp(
        Object.values(deletionMarkers.contactIds)
      );
    case "files-metadata":
      return getLatestCloudSyncTimestamp(
        Object.values(deletionMarkers.fileMetadataPaths)
      );
    case "custom-wallpapers":
      return getLatestCloudSyncTimestamp(
        Object.values(deletionMarkers.customWallpaperKeys)
      );
    default:
      return null;
  }
}

export function useAutoCloudSync() {
  const username = useChatsStore((state) => state.username);
  const isAuthenticated = useChatsStore((state) => state.isAuthenticated);
  const autoSyncEnabled = useCloudSyncStore((state) => state.autoSyncEnabled);
  const syncFiles = useCloudSyncStore((state) => state.syncFiles);
  const syncSettings = useCloudSyncStore((state) => state.syncSettings);
  const syncSongs = useCloudSyncStore((state) => state.syncSongs);
  const syncVideos = useCloudSyncStore((state) => state.syncVideos);
  const syncStickies = useCloudSyncStore((state) => state.syncStickies);
  const syncCalendar = useCloudSyncStore((state) => state.syncCalendar);
  const syncContacts = useCloudSyncStore((state) => state.syncContacts);

  const uploadTimersRef = useRef<
    Partial<Record<CloudSyncDomain, ReturnType<typeof setTimeout>>>
  >({});
  const lastLocalChangeAtRef = useRef<Record<CloudSyncDomain, string | null>>(
    createDomainStringMap(null)
  );
  const remoteApplySuppressUntilRef = useRef<Record<CloudSyncDomain, number>>({
    settings: 0,
    "files-metadata": 0,
    "files-images": 0,
    "files-trash": 0,
    "files-applets": 0,
    songs: 0,
    videos: 0,
    stickies: 0,
    calendar: 0,
    contacts: 0,
    "custom-wallpapers": 0,
  });
  const checkInFlightRef = useRef(false);
  const wallpaperSeedDoneRef = useRef(false);
  const contactsSeedDoneRef = useRef(false);

  const isSyncActive = Boolean(username && isAuthenticated && autoSyncEnabled);

  const enabledDomainsKey = useMemo(
    () =>
      [
        syncSettings ? "1" : "0",
        syncFiles ? "1" : "0",
        syncSongs ? "1" : "0",
        syncVideos ? "1" : "0",
        syncStickies ? "1" : "0",
        syncCalendar ? "1" : "0",
        syncContacts ? "1" : "0",
      ].join(""),
    [
      syncCalendar,
      syncContacts,
      syncFiles,
      syncSettings,
      syncSongs,
      syncStickies,
      syncVideos,
    ]
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

      if (!username || !isAuthenticated || !isDomainEnabled(domain)) {
        return;
      }

      const syncState = useCloudSyncStore.getState();
      syncState.markUploadStart(domain);

      try {
        console.log(`[CloudSync] Uploading ${domain}...`);
        const metadata = await uploadCloudSyncDomain(domain, {
          username,
          isAuthenticated,
        });

        console.log(`[CloudSync] Upload ${domain} succeeded`, metadata.updatedAt);
        syncState.markUploadSuccess(domain, metadata);
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
    [isAuthenticated, clearUploadTimer, isDomainEnabled, username]
  );

  const queueUpload = useCallback(
    (domain: CloudSyncDomain) => {
      if (!isSyncActive || !isDomainEnabled(domain)) {
        console.log(`[CloudSync] queueUpload(${domain}) skipped: syncActive=${isSyncActive}, enabled=${isDomainEnabled(domain)}`);
        return;
      }

      const suppressUntil = remoteApplySuppressUntilRef.current[domain];
      if (Date.now() < suppressUntil) {
        const remainingMs = suppressUntil - Date.now();
        const deferMs = remainingMs + UPLOAD_DEBOUNCE_MS[domain];
        console.log(`[CloudSync] queueUpload(${domain}) deferred: suppressed for ${remainingMs}ms, will fire in ${deferMs}ms`);
        lastLocalChangeAtRef.current[domain] = new Date().toISOString();
        clearUploadTimer(domain);
        uploadTimersRef.current[domain] = setTimeout(() => {
          void uploadDomain(domain);
        }, deferMs);
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

  const syncChannelRef = useRef<{ name: string; unbind: () => void } | null>(
    null
  );
  const realtimeInFlightRef = useRef(new Set<CloudSyncDomain>());

  const handleRealtimeDomainUpdate = useCallback(
    async (
      domain: CloudSyncDomain,
      remoteUpdatedAt: string,
      remoteSyncVersion?: CloudSyncVersionState | null
    ) => {
      if (!username || !isAuthenticated || !isDomainEnabled(domain)) return;
      if (realtimeInFlightRef.current.has(domain)) return;

      const syncState = useCloudSyncStore.getState();
      const domainStatus = syncState.domainStatus[domain];

      const shouldApply = shouldApplyRemoteUpdate({
        remoteUpdatedAt,
        remoteSyncVersion: remoteSyncVersion || syncState.remoteMetadata[domain]?.syncVersion,
        lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
        lastUploadedAt: domainStatus.lastUploadedAt,
        lastLocalChangeAt: lastLocalChangeAtRef.current[domain],
        hasPendingUpload:
          Boolean(uploadTimersRef.current[domain]) || domainStatus.isUploading,
        lastKnownServerVersion: domainStatus.lastKnownServerVersion,
      });

      if (!shouldApply) return;

      remoteApplySuppressUntilRef.current[domain] = Date.now() + REALTIME_INFLIGHT_SUPPRESSION_MS;
      realtimeInFlightRef.current.add(domain);

      try {
        console.log(`[CloudSync] Realtime download: ${domain}`);
        const appliedMetadata = await downloadAndApplyCloudSyncDomain(domain, {
          username,
          isAuthenticated,
        });

        useCloudSyncStore
          .getState()
          .markRemoteApplied(domain, appliedMetadata);
        lastLocalChangeAtRef.current[domain] = appliedMetadata.updatedAt;
        remoteApplySuppressUntilRef.current[domain] =
          Date.now() + REMOTE_APPLY_SUPPRESSION_MS;
      } catch (error) {
        console.error(`[CloudSync] Targeted download ${domain} failed:`, error);
        remoteApplySuppressUntilRef.current[domain] = 0;
      } finally {
        realtimeInFlightRef.current.delete(domain);
      }
    },
    [isAuthenticated, isDomainEnabled, username]
  );

  const checkRemoteUpdates = useCallback(async () => {
    if (!username || !isAuthenticated || !isSyncActive || checkInFlightRef.current) {
      return;
    }

    checkInFlightRef.current = true;
    useCloudSyncStore.getState().setCheckingRemote(true);

    try {
      const metadataMap = await fetchCloudSyncMetadata({ username, isAuthenticated });
      useCloudSyncStore.getState().setRemoteMetadata(metadataMap);
      useCloudSyncStore.getState().setLastError(null);

      // Pre-suppress ALL domains before applying any. Applying one domain
      // can trigger side-effect uploads on another (e.g. settings apply
      // changes currentWallpaper → subscriber queues custom-wallpapers
      // upload while IndexedDB is still empty). A generous window ensures
      // the entire batch completes before any upload can fire.
      const batchSuppressUntil = Date.now() + BATCH_INFLIGHT_SUPPRESSION_MS;
      for (const d of CLOUD_SYNC_DOMAINS) {
        remoteApplySuppressUntilRef.current[d] = batchSuppressUntil;
      }

      const appliedDomains: CloudSyncDomain[] = [];

      for (const domain of CLOUD_SYNC_REMOTE_APPLY_DOMAINS) {
        if (!isDomainEnabled(domain)) {
          continue;
        }

        const remoteMetadata = metadataMap[domain];
        const syncState = useCloudSyncStore.getState();
        const domainStatus = syncState.domainStatus[domain];

        const shouldApply = shouldApplyRemoteUpdate({
          remoteUpdatedAt: remoteMetadata?.updatedAt,
          remoteSyncVersion: remoteMetadata?.syncVersion,
          lastAppliedRemoteAt: domainStatus.lastAppliedRemoteAt,
          lastUploadedAt: domainStatus.lastUploadedAt,
          lastLocalChangeAt: lastLocalChangeAtRef.current[domain],
          hasPendingUpload:
            Boolean(uploadTimersRef.current[domain]) || domainStatus.isUploading,
          lastKnownServerVersion: domainStatus.lastKnownServerVersion,
        });

        if (!shouldApply || !remoteMetadata) {
          continue;
        }

        const appliedMetadata = await downloadAndApplyCloudSyncDomain(domain, {
          username,
          isAuthenticated,
        });

        useCloudSyncStore
          .getState()
          .markRemoteApplied(domain, appliedMetadata);
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

      // One-time seed: if the cloud has no custom-wallpapers but local does,
      // queue an upload after the suppression window so the first device
      // populates the cloud. Runs only once per session.
      if (!wallpaperSeedDoneRef.current && isDomainEnabled("custom-wallpapers")) {
        wallpaperSeedDoneRef.current = true;
        if (!metadataMap["custom-wallpapers"]?.updatedAt) {
          const localRefs = await useDisplaySettingsStore
            .getState()
            .loadCustomWallpapers();
          if (localRefs.length > 0) {
            console.log(`[CloudSync] Seed upload: ${localRefs.length} local custom wallpapers, no remote data`);
            setTimeout(
              () => queueUpload("custom-wallpapers"),
              REMOTE_APPLY_SUPPRESSION_MS + 1000
            );
          }
        }
      }

      if (!contactsSeedDoneRef.current && isDomainEnabled("contacts")) {
        contactsSeedDoneRef.current = true;
        if (!metadataMap["contacts"]?.updatedAt) {
          const localContacts = useContactsStore.getState().contacts;
          if (localContacts.length > 0) {
            console.log(`[CloudSync] Seed upload: ${localContacts.length} local contacts, no remote data`);
            setTimeout(
              () => queueUpload("contacts"),
              REMOTE_APPLY_SUPPRESSION_MS + 1000
            );
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to check cloud sync.";
      useCloudSyncStore.getState().setLastError(message);
    } finally {
      useCloudSyncStore.getState().setCheckingRemote(false);
      checkInFlightRef.current = false;
    }
  }, [isAuthenticated, isDomainEnabled, isSyncActive, queueUpload, username]);

  const handleRealtimeDomainUpdateRef = useRef(handleRealtimeDomainUpdate);
  handleRealtimeDomainUpdateRef.current = handleRealtimeDomainUpdate;

  useEffect(() => {
    if (!isSyncActive || !username) {
      if (syncChannelRef.current) {
        syncChannelRef.current.unbind();
        unsubscribePusherChannel(syncChannelRef.current.name);
        syncChannelRef.current = null;
      }
      return;
    }

    const channelName = getSyncChannelName(username);
    const sessionId = getSyncSessionId();
    const channel = subscribePusherChannel(channelName);

    const handler = (data: unknown) => {
      const payload = data as {
        domain?: string;
        updatedAt?: string;
        sourceSessionId?: string;
        syncVersion?: CloudSyncVersionState | null;
      };

      if (payload.sourceSessionId === sessionId) return;

      if (
        !payload.domain ||
        !payload.updatedAt ||
        !isCloudSyncDomain(payload.domain)
      ) {
        console.warn("[CloudSync] Ignoring malformed realtime payload:", payload);
        return;
      }

      void handleRealtimeDomainUpdateRef.current(
        payload.domain,
        payload.updatedAt,
        payload.syncVersion
      );
    };

    channel.bind("domain-updated", handler);
    syncChannelRef.current = {
      name: channelName,
      unbind: () => {
        channel.unbind("domain-updated", handler);
      },
    };

    return () => {
      if (syncChannelRef.current) {
        syncChannelRef.current.unbind();
        unsubscribePusherChannel(syncChannelRef.current.name);
        syncChannelRef.current = null;
      }
    };
  }, [isSyncActive, username]);

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

    const syncCheckUnsubscribe = subscribeToCloudSyncCheckRequests(() => {
      void checkRemoteUpdates();
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
          console.log(`[CloudSync] display subscriber: currentWallpaper changed from "${prevState.currentWallpaper}" to "${state.currentWallpaper}"`);
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

    const dashboardUnsubscribe = useDashboardStore.subscribe(
      (state, prevState) => {
        if (state.widgets !== prevState.widgets) {
          queueUpload("settings");
        }
      }
    );

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

    const contactsUnsubscribe = useContactsStore.subscribe((state, prevState) => {
      if (state.contacts !== prevState.contacts) {
        queueUpload("contacts");
      }
    });

    // Clear any uploads queued by store hydration/initialization so the
    // first remote check can pull down data without being blocked by
    // "has pending upload" guards (e.g. initializeLibrary on new devices).
    clearAllUploadTimers();
    for (const d of CLOUD_SYNC_DOMAINS) {
      lastLocalChangeAtRef.current[d] = getPersistedDeletionChangeAt(d);
    }

    void (async () => {
      await checkRemoteUpdates();

      const syncState = useCloudSyncStore.getState();
      for (const domain of CLOUD_SYNC_DOMAINS) {
        if (
          isDomainEnabled(domain) &&
          hasUnsyncedLocalChanges(
            lastLocalChangeAtRef.current[domain],
            syncState.domainStatus[domain].lastUploadedAt
          )
        ) {
          setTimeout(
            () => queueUpload(domain),
            REMOTE_APPLY_SUPPRESSION_MS + 1000
          );
        }
      }
    })();
    const intervalId = setInterval(() => {
      void checkRemoteUpdates();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      clearAllUploadTimers();
      filesUnsubscribe();
      syncEventsUnsubscribe();
      syncCheckUnsubscribe();
      themeUnsubscribe();
      languageUnsubscribe();
      displayUnsubscribe();
      audioUnsubscribe();
      appUnsubscribe();
      ipodSettingsUnsubscribe();
      songsUnsubscribe();
      videosUnsubscribe();
      dockUnsubscribe();
      dashboardUnsubscribe();
      stickiesUnsubscribe();
      calendarUnsubscribe();
      contactsUnsubscribe();
    };
  }, [
    checkRemoteUpdates,
    clearAllUploadTimers,
    enabledDomainsKey,
    isSyncActive,
    queueUpload,
  ]);
}
