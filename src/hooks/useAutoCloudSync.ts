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
import { useCalendarStore } from "@/stores/useCalendarStore";
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
  files: 10000,
  songs: 4000,
  calendar: 4000,
};

function createDomainStringMap(initialValue: string | null): Record<CloudSyncDomain, string | null> {
  return {
    settings: initialValue,
    files: initialValue,
    songs: initialValue,
    calendar: initialValue,
  };
}

export function useAutoCloudSync() {
  const username = useChatsStore((state) => state.username);
  const authToken = useChatsStore((state) => state.authToken);
  const autoSyncEnabled = useCloudSyncStore((state) => state.autoSyncEnabled);
  const syncFiles = useCloudSyncStore((state) => state.syncFiles);
  const syncSettings = useCloudSyncStore((state) => state.syncSettings);
  const syncSongs = useCloudSyncStore((state) => state.syncSongs);
  const syncCalendar = useCloudSyncStore((state) => state.syncCalendar);

  const uploadTimersRef = useRef<
    Partial<Record<CloudSyncDomain, ReturnType<typeof setTimeout>>>
  >({});
  const lastLocalChangeAtRef = useRef<Record<CloudSyncDomain, string | null>>(
    createDomainStringMap(null)
  );
  const remoteApplySuppressUntilRef = useRef<Record<CloudSyncDomain, number>>({
    settings: 0,
    files: 0,
    songs: 0,
    calendar: 0,
  });
  const checkInFlightRef = useRef(false);

  const isSyncActive = Boolean(username && authToken && autoSyncEnabled);

  const enabledDomainsKey = useMemo(
    () =>
      [
        syncSettings ? "1" : "0",
        syncFiles ? "1" : "0",
        syncSongs ? "1" : "0",
        syncCalendar ? "1" : "0",
      ].join(""),
    [syncCalendar, syncFiles, syncSettings, syncSongs]
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
        const metadata = await uploadCloudSyncDomain(domain, {
          username,
          authToken,
        });

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
        useCloudSyncStore.getState().markUploadFailure(domain, message);
      }
    },
    [authToken, clearUploadTimer, isDomainEnabled, username]
  );

  const queueUpload = useCallback(
    (domain: CloudSyncDomain) => {
      if (!isSyncActive || !isDomainEnabled(domain)) {
        return;
      }

      if (Date.now() < remoteApplySuppressUntilRef.current[domain]) {
        return;
      }

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

        remoteApplySuppressUntilRef.current[domain] =
          Date.now() + REMOTE_APPLY_SUPPRESSION_MS;

        const appliedMetadata = await downloadAndApplyCloudSyncDomain(domain, {
          username,
          authToken,
        });

        useCloudSyncStore
          .getState()
          .markRemoteApplied(domain, appliedMetadata.updatedAt);
        lastLocalChangeAtRef.current[domain] = appliedMetadata.updatedAt;
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
        queueUpload("files");
      }
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

    const songsUnsubscribe = useIpodStore.subscribe((state, prevState) => {
      if (
        state.tracks !== prevState.tracks ||
        state.libraryState !== prevState.libraryState ||
        state.lastKnownVersion !== prevState.lastKnownVersion
      ) {
        queueUpload("songs");
      }
    });

    const calendarUnsubscribe = useCalendarStore.subscribe((state, prevState) => {
      if (
        state.events !== prevState.events ||
        state.calendars !== prevState.calendars ||
        state.todos !== prevState.todos
      ) {
        queueUpload("calendar");
      }
    });

    void checkRemoteUpdates();
    const intervalId = setInterval(() => {
      void checkRemoteUpdates();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      clearAllUploadTimers();
      filesUnsubscribe();
      themeUnsubscribe();
      languageUnsubscribe();
      displayUnsubscribe();
      audioUnsubscribe();
      appUnsubscribe();
      songsUnsubscribe();
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
