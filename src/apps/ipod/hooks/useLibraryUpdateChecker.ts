import { useEffect, useRef } from "react";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { useAppStore } from "@/stores/useAppStore";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const CHECK_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

export function useLibraryUpdateChecker(isActive: boolean) {
  const { t } = useTranslation();
  const syncLibrary = useIpodStore((state) => state.syncLibrary);
  const debugMode = useAppStore((state) => state.debugMode);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckedRef = useRef<number>(0);

  useEffect(() => {
    // Skip all auto-update logic when debug mode is enabled
    if (debugMode) {
      return;
    }

    if (!isActive) {
      // Clear interval when app is not active
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const checkForUpdates = async () => {
      try {
        // Do track-based comparison like manual sync, not version-based
        // This avoids timing issues where version might already be updated
        const currentTracks = useIpodStore.getState().tracks;
        const wasEmpty = currentTracks.length === 0;

        // Get server tracks directly (same as syncLibrary does)
        const res = await fetch("/data/ipod-videos.json");
        const data = await res.json();
        const serverTracks: Track[] = (data.videos || data).map(
          (v: Record<string, unknown>) => ({
            id: v.id as string,
            url: v.url as string,
            title: v.title as string,
            artist: v.artist as string | undefined,
            album: (v.album as string | undefined) ?? "",
            lyricOffset: v.lyricOffset as number | undefined,
            lyricsSearch: v.lyricsSearch as Track["lyricsSearch"],
          })
        );
        const serverVersion = data.version || 1;

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
            const hasChanges =
              currentTrack.title !== serverTrack.title ||
              currentTrack.artist !== serverTrack.artist ||
              currentTrack.album !== serverTrack.album ||
              currentTrack.url !== serverTrack.url ||
              currentTrack.lyricOffset !== serverTrack.lyricOffset ||
              // Check if server has lyricsSearch but user doesn't
              (serverTrack.lyricsSearch?.selection && !currentTrack.lyricsSearch?.selection);
            if (hasChanges) tracksUpdated++;
          }
        });

        console.log("[iPod] Auto update check:", {
          newTracksCount,
          tracksUpdated,
          currentTracksCount: currentTracks.length,
          serverTracksCount: serverTracks.length,
          serverVersion,
          currentLastKnownVersion: useIpodStore.getState().lastKnownVersion,
        });

        if (newTracksCount > 0 || tracksUpdated > 0) {
          // Auto-update: directly sync without asking user
          try {
            const result = await syncLibrary();
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

            console.log(
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

    // Always check immediately when app becomes active (with a small delay to allow store to rehydrate)
    const immediateCheckTimeout = setTimeout(() => {
      console.log(
        "[iPod] Running immediate library update check on app activation"
      );
      checkForUpdates();
      lastCheckedRef.current = Date.now();
    }, 100);

    // Set up periodic checking
    intervalRef.current = setInterval(() => {
      checkForUpdates();
      lastCheckedRef.current = Date.now();
    }, CHECK_INTERVAL);

    return () => {
      clearTimeout(immediateCheckTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, syncLibrary, debugMode]);

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
