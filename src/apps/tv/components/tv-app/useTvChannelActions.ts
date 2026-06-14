import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import type { TFunction } from "i18next";
import {
  useCreateTvChannel,
  TvChannelAuthRequiredError,
} from "../../hooks/useCreateTvChannel";
import {
  fetchYoutubeVideoForTvPrompt,
  parseYoutubePasteInput,
} from "../../utils/youtubeFromPrompt";
import { useAuth } from "@/hooks/useAuth";
import { useTvStore } from "@/stores/useTvStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { MTV_CHANNEL_ID, RYO_TV_CHANNEL_ID } from "../../hooks/useTvLogic";
import { openNativeFile, saveBlobToDevice } from "@/utils/nativeFileDialogs";

export function useTvChannelActions({
  t,
  currentChannelId,
  setChannelById,
}: {
  t: TFunction;
  currentChannelId: string;
  setChannelById: (id: string) => void;
}) {
  const customChannels = useTvStore((s) => s.customChannels);
  const hiddenDefaultChannelIds = useTvStore((s) => s.hiddenDefaultChannelIds);
  const addVideoToCustomChannel = useTvStore((s) => s.addVideoToCustomChannel);
  const removeChannel = useTvStore((s) => s.removeChannel);
  const importChannels = useTvStore((s) => s.importChannels);
  const exportChannels = useTvStore((s) => s.exportChannels);
  const resetChannels = useTvStore((s) => s.resetChannels);

  const customChannelIds = useMemo(
    () => new Set(customChannels.map((c) => c.id)),
    [customChannels]
  );
  const { create: createChannel, isCreating: isCreatingChannel } =
    useCreateTvChannel();

  const {
    username,
    isAuthenticated,
    promptVerifyToken,
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
  } = useAuth();

  const isProbablyLoggedIn = !!username || isAuthenticated;

  const showLoginRequiredToast = useCallback(() => {
    toast.error(t("apps.tv.create.signInRequired"), {
      description: t("apps.tv.create.signInRequiredDescription"),
      duration: 8000,
      action: {
        label: t("common.appleMenu.login"),
        onClick: () => {
          promptVerifyToken();
        },
      },
    });
  }, [t, promptVerifyToken]);

  const ensureLoggedIn = useCallback((): boolean => {
    if (isProbablyLoggedIn) return true;
    showLoginRequiredToast();
    return false;
  }, [isProbablyLoggedIn, showLoginRequiredToast]);

  const handleInlinePromptSubmit = useCallback(
    async (
      description: string,
      setIsYoutubePasteLoading: (value: boolean) => void
    ): Promise<string | null> => {
      const trimmed = description.trim();
      const youtubeRef = parseYoutubePasteInput(trimmed);

      if (youtubeRef) {
        setIsYoutubePasteLoading(true);
        try {
          const video = await fetchYoutubeVideoForTvPrompt(youtubeRef);
          if (!video) {
            toast.error(t("apps.tv.youtubePaste.fetchFailed"));
            return null;
          }

          if (currentChannelId === RYO_TV_CHANNEL_ID) {
            const had = useVideoStore
              .getState()
              .videos.some((v) => v.id === video.id);
            if (had) {
              toast.success(t("apps.tv.youtubePaste.alreadyInLibrary"));
            } else {
              useVideoStore.getState().setVideos((prev) => [...prev, video]);
              toast.success(
                t("apps.tv.youtubePaste.added", { title: video.title })
              );
            }
            return video.title;
          }

          if (currentChannelId === MTV_CHANNEL_ID) {
            const hadTrack = useIpodStore
              .getState()
              .tracks.some((tr) => tr.id === video.id);
            await useIpodStore
              .getState()
              .addTrackFromVideoId(video.url, false);
            if (hadTrack) {
              toast.success(t("apps.tv.youtubePaste.alreadyInLibrary"));
            } else {
              toast.success(
                t("apps.tv.youtubePaste.added", { title: video.title })
              );
            }
            return video.title;
          }

          if (customChannelIds.has(currentChannelId)) {
            const { added } = addVideoToCustomChannel(
              currentChannelId,
              video
            );
            if (added) {
              toast.success(
                t("apps.tv.youtubePaste.added", { title: video.title })
              );
            } else {
              toast.success(t("apps.tv.youtubePaste.alreadyInChannel"));
            }
            return video.title;
          }

          toast.error(t("apps.tv.youtubePaste.needsEditableChannel"));
          return null;
        } finally {
          setIsYoutubePasteLoading(false);
        }
      }

      if (!ensureLoggedIn()) return null;
      try {
        const { channel } = await createChannel(description);
        setChannelById(channel.id);
        toast.success(
          t("apps.tv.create.toastSuccess", { name: channel.name })
        );
        return channel.name;
      } catch (err) {
        console.error("Inline create channel failed:", err);
        if (err instanceof TvChannelAuthRequiredError) {
          showLoginRequiredToast();
        } else {
          toast.error(
            err instanceof Error ? err.message : t("apps.tv.create.errorGeneric")
          );
        }
        return null;
      }
    },
    [
      addVideoToCustomChannel,
      currentChannelId,
      customChannelIds,
      ensureLoggedIn,
      createChannel,
      setChannelById,
      showLoginRequiredToast,
      t,
    ]
  );

  const hasResettableChannelChanges =
    customChannels.length > 0 || hiddenDefaultChannelIds.length > 0;

  const importChannelJson = (json: string) => {
    const result = importChannels(json);
    if (result.added === 0) {
      toast.error(t("apps.tv.toasts.importEmpty"));
      return;
    }
    toast.success(
      t("apps.tv.toasts.importSuccess", {
        count: result.added,
        skipped: result.skipped,
      })
    );
  };

  const handleExportChannels = async () => {
    try {
      const json = exportChannels();
      const blob = new Blob([json], { type: "application/json" });
      await saveBlobToDevice(
        blob,
        `tv-channels-${new Date().toISOString().slice(0, 10)}.json`,
        { filters: [{ name: "JSON", extensions: ["json"] }] }
      );
      toast.success(t("apps.tv.toasts.exportSuccess"));
    } catch (error) {
      console.error("Failed to export channels:", error);
      toast.error(t("apps.tv.toasts.exportFailed"));
    }
  };

  const handleImportChannels = async () => {
    try {
      const file = await openNativeFile({
        title: "Import TV Channels",
        filters: [{ name: "JSON", extensions: ["json"] }],
        mimeType: "application/json",
      });
      if (file) {
        importChannelJson(await file.text());
        return;
      }
    } catch (error) {
      console.error("Native TV channel import failed:", error);
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result;
          if (typeof json !== "string") throw new Error("empty file");
          importChannelJson(json);
        } catch (error) {
          console.error("Failed to import channels:", error);
          toast.error(t("apps.tv.toasts.importFailed"));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return {
    customChannels,
    removeChannel,
    resetChannels,
    ensureLoggedIn,
    handleInlinePromptSubmit,
    handleImportChannels,
    handleExportChannels,
    hasResettableChannelChanges,
    isCreatingChannel,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    promptSetUsername,
  };
}

export type UseTvChannelActionsApi = ReturnType<typeof useTvChannelActions>;
