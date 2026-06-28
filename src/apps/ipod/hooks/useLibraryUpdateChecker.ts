import { useEffect, useRef } from "react";
import { useIpodStore } from "@/stores/useIpodStore";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { listAllCachedSongMetadata } from "@/utils/songMetadataCache";
import { hasLibraryTrackMetadataChanges } from "@/stores/ipodTrackMetadataSync";
import { mapCatalogSongToTrack } from "@/stores/ipodCatalogTrackMapping";
import { fetchSongsVersion, type SongsVersionInfo } from "@/api/songs";
import { createVisibilityGatedInterval } from "@/utils/backgroundTask";
import { createClientLogger } from "@/utils/logger";

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes
const debug = createClientLogger("IpodLibraryUpdateChecker").debug;

export function useLibraryUpdateChecker(isActive: boolean) {
  const { t } = useTranslation();
  const syncLibrary = useIpodStore((state) => state.syncLibrary);
  const debugMode = useDisplaySettingsStore((state) => state.debugMode);
  const disposeIntervalRef = useRef<(() => void) | null>(null);
  const lastCheckedRef = useRef<number>(0);
  /**
   * Server version observed by the last full check that ended in-sync.
   * While the server still reports this version+count, the poller skips the
   * full catalog download (which used to run every 5 minutes regardless).
   * Only set after a check confirms there is nothing to apply, so a failed
   * or partial sync never suppresses the next full comparison.
   */
  const lastInSyncVersionRef = useRef<SongsVersionInfo | null>(null);

  useEffect(() => {
    // Skip all auto-update logic when debug mode is enabled
    if (debugMode) {
      return;
    }

    if (!isActive) {
      // Clear interval when app is not active
      if (disposeIntervalRef.current) {
        disposeIntervalRef.current();
        disposeIntervalRef.current = null;
      }
      return;
    }

    const checkForUpdates = async () => {
      try {
        const currentTracks = useIpodStore.getState().tracks;
        const wasEmpty = currentTracks.length === 0;

        // Cheap version probe first: skip the full catalog download when the
        // server reports the same version+count we already confirmed as
        // in-sync. Probe failures fall through to the full check.
        let versionInfo: SongsVersionInfo | null = null;
        try {
          versionInfo = await fetchSongsVersion("ryo");
        } catch (error) {
          console.warn(
            "[iPod] Songs version probe failed; falling back to full check",
            error
          );
        }
        const lastInSync = lastInSyncVersionRef.current;
        if (
          versionInfo &&
          lastInSync &&
          versionInfo.version === lastInSync.version &&
          versionInfo.count === lastInSync.count
        ) {
          debug(
            `[iPod] Catalog version unchanged, skipping full check (version=${versionInfo.version}, count=${versionInfo.count})`
          );
          return;
        }

        // Do track-based comparison like manual sync, not version-based
        // This avoids timing issues where version might already be updated
        // Get server tracks from Redis cache (only songs by ryo)
        const cachedSongs = await listAllCachedSongMetadata("ryo");
        
        if (cachedSongs.length === 0) {
          debug("[iPod] No songs found in Redis cache, skipping update check");
          return;
        }
        
        const serverTracks = cachedSongs.map(mapCatalogSongToTrack);
        const serverVersion = Math.max(...cachedSongs.map((s) => s.createdAt || 1));

        // Check for new tracks (same logic as syncLibrary)
        const existingIds = new Set(currentTracks.map((track) => track.id));
        const newTracksCount = serverTracks.filter(
          (track) => !existingIds.has(track.id)
        ).length;

        // Check for metadata updates
        let tracksUpdated = 0;
        const serverTrackMap = new Map(
          serverTracks.map((track) => [track.id, track])
        );
        currentTracks.forEach((currentTrack) => {
          const serverTrack = serverTrackMap.get(currentTrack.id);
          if (serverTrack) {
            if (hasLibraryTrackMetadataChanges(currentTrack, serverTrack)) {
              tracksUpdated++;
            }
          }
        });

        debug(
          `[iPod] Auto update check: new=${newTracksCount}, updated=${tracksUpdated}, current=${currentTracks.length}, server=${serverTracks.length}, version=${serverVersion}, known=${useIpodStore.getState().lastKnownVersion}`
        );

        if (newTracksCount === 0 && tracksUpdated === 0) {
          // Fully in sync — remember the server version so the next polls
          // can stop at the cheap probe.
          if (versionInfo) {
            lastInSyncVersionRef.current = versionInfo;
          }
        }

        if (newTracksCount > 0 || tracksUpdated > 0) {
          // Auto-update: directly sync without asking user
          try {
            const result = await syncLibrary();
            if (versionInfo) {
              // Sync applied (or confirmed no-op) — record the version we
              // just reconciled against.
              lastInSyncVersionRef.current = versionInfo;
            }
            if (result.newTracksAdded === 0 && result.tracksUpdated === 0) {
              debug("[iPod] Auto update check resolved with no applied changes");
              return;
            }
            const message =
              wasEmpty && result.newTracksAdded > 0
                ? t("apps.ipod.dialogs.addedSongsToTop", {
                    count: result.newTracksAdded,
                    plural: result.newTracksAdded === 1 ? "" : "s",
                  })
                : result.newTracksAdded > 0
                ? t("apps.ipod.dialogs.autoUpdatedLibraryAddedSongs", {
                    newCount: result.newTracksAdded,
                    newPlural: result.newTracksAdded === 1 ? "" : "s",
                    updatedText:
                      result.tracksUpdated > 0
                        ? t("apps.ipod.dialogs.andUpdated", {
                            count: result.tracksUpdated,
                            plural: result.tracksUpdated === 1 ? "" : "s",
                          })
                        : "",
                  })
                : t("apps.ipod.dialogs.autoUpdatedTrackMetadata", {
                    count: result.tracksUpdated,
                  });

            toast.success(t("apps.ipod.dialogs.libraryAutoUpdated"), {
              description: message,
              duration: 4000,
            });

            debug(
              `[iPod] Auto-updated: ${result.newTracksAdded} new tracks, ${result.tracksUpdated} updated tracks`
            );
          } catch (error) {
            console.error("Error auto-updating library:", error);
            toast.error(t("apps.ipod.dialogs.autoUpdateFailed"), {
              description: t("apps.ipod.dialogs.failedToAutoUpdateLibrary"),
              duration: 4000,
            });
          }
        }
      } catch (error) {
        console.error("Error checking for library updates:", error);
      }
    };

    // Check immediately when app becomes active, but skip if checked recently (within 5 min)
    const timeSinceLastCheck = Date.now() - lastCheckedRef.current;
    const shouldCheckImmediately = timeSinceLastCheck >= CHECK_INTERVAL;
    
    const immediateCheckTimeout = shouldCheckImmediately
      ? setTimeout(() => {
          debug(
            "[iPod] Running immediate library update check on app activation"
          );
          checkForUpdates();
          lastCheckedRef.current = Date.now();
        }, 100)
      : null;
    
    if (!shouldCheckImmediately) {
      debug(
        `[iPod] Skipping immediate check - last checked ${Math.round(timeSinceLastCheck / 1000)}s ago (< ${CHECK_INTERVAL / 1000}s)`
      );
    }

    // Set up periodic checking (paused while the tab is hidden; catches up
    // immediately on return when a check is overdue)
    disposeIntervalRef.current = createVisibilityGatedInterval(() => {
      checkForUpdates();
      lastCheckedRef.current = Date.now();
    }, CHECK_INTERVAL);

    return () => {
      if (immediateCheckTimeout) {
        clearTimeout(immediateCheckTimeout);
      }
      if (disposeIntervalRef.current) {
        disposeIntervalRef.current();
        disposeIntervalRef.current = null;
      }
    };
  }, [isActive, syncLibrary, debugMode, t]);

  // Manual check function that can be called externally
  const manualCheck = async () => {
    try {
      const wasEmptyBefore = useIpodStore.getState().tracks.length === 0;
      const result = await syncLibrary();

      if (result.newTracksAdded > 0 || result.tracksUpdated > 0) {
        const message =
          wasEmptyBefore && result.newTracksAdded > 0
            ? t("apps.ipod.dialogs.addedSongsToTop", {
                count: result.newTracksAdded,
                plural: result.newTracksAdded === 1 ? "" : "s",
              })
            : t("apps.ipod.dialogs.addedNewSongsToTop", {
                newCount: result.newTracksAdded,
                newPlural: result.newTracksAdded === 1 ? "" : "s",
                updatedText:
                  result.tracksUpdated > 0
                    ? t("apps.ipod.dialogs.andUpdated", {
                        count: result.tracksUpdated,
                        plural: result.tracksUpdated === 1 ? "" : "s",
                      })
                    : "",
                total: result.totalTracks,
              });

        toast.success(t("apps.ipod.dialogs.libraryUpdated"), {
          description: message,
        });
        return true;
      } else {
        toast.info(t("apps.ipod.dialogs.noUpdates"), {
          description: t("apps.ipod.dialogs.libraryAlreadyUpToDate"),
        });
        return false;
      }
    } catch (error) {
      console.error("Error during manual library update check:", error);
      toast.error(t("apps.ipod.dialogs.updateCheckFailed"), {
        description: t("apps.ipod.dialogs.failedToCheckForLibraryUpdates"),
      });
      return false;
    }
  };

  // Manual sync function that syncs with server library
  const manualSync = async () => {
    try {
      const wasEmptyBefore = useIpodStore.getState().tracks.length === 0;
      const result = await syncLibrary();

      if (result.newTracksAdded > 0 || result.tracksUpdated > 0) {
        const message =
          wasEmptyBefore && result.newTracksAdded > 0
            ? t("apps.ipod.dialogs.addedSongsToTop", {
                count: result.newTracksAdded,
                plural: result.newTracksAdded === 1 ? "" : "s",
              })
            : t("apps.ipod.dialogs.addedNewSongsToTop", {
                newCount: result.newTracksAdded,
                newPlural: result.newTracksAdded === 1 ? "" : "s",
                updatedText:
                  result.tracksUpdated > 0
                    ? t("apps.ipod.dialogs.andUpdated", {
                        count: result.tracksUpdated,
                        plural: result.tracksUpdated === 1 ? "" : "s",
                      })
                    : "",
                total: result.totalTracks,
              });

        toast.success(t("apps.ipod.dialogs.librarySynced"), {
          description: message,
        });
      } else {
        toast.info(t("apps.ipod.dialogs.librarySynced"), {
          description: t("apps.ipod.dialogs.libraryUpToDateWithSongs", {
            count: result.totalTracks,
          }),
        });
      }
      return true;
    } catch (error) {
      console.error("Error during library sync:", error);
      toast.error(t("apps.ipod.dialogs.syncFailed"), {
        description: t("apps.ipod.dialogs.failedToSyncWithServerLibrary"),
      });
      return false;
    }
  };

  return { manualCheck, manualSync };
}
