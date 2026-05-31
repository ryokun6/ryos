import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appMetadata } from "../..";
import type { VideosAppController } from "./useVideosAppController";

type VideosAppDialogsProps = {
  c: VideosAppController;
};

export function VideosAppDialogs({ c }: VideosAppDialogsProps) {
  const {
    t,
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmClearOpen,
    setIsConfirmClearOpen,
    isConfirmResetOpen,
    setIsConfirmResetOpen,
    isAddDialogOpen,
    setIsAddDialogOpen,
    isShareDialogOpen,
    setIsShareDialogOpen,
    setVideos,
    safeSetCurrentVideoId,
    setIsPlaying,
    setOriginalOrder,
    showStatus,
    DEFAULT_VIDEOS,
    getCurrentVideo,
    urlInput,
    setUrlInput,
    isAddingVideo,
    addVideo,
    videosGenerateShareUrl,
  } = c;

  return (
    <>
      <AppHelpAboutDialogs
        appId="videos"
        helpItems={translatedHelpItems}
        metadata={appMetadata}
        isHelpOpen={isHelpDialogOpen}
        onHelpOpenChange={setIsHelpDialogOpen}
        isAboutOpen={isAboutDialogOpen}
        onAboutOpenChange={setIsAboutDialogOpen}
      />
      <ConfirmDialog
        isOpen={isConfirmClearOpen}
        onOpenChange={setIsConfirmClearOpen}
        onConfirm={() => {
          setVideos([]);
          safeSetCurrentVideoId(null);
          setIsPlaying(false);
          setIsConfirmClearOpen(false);
        }}
        title={t("apps.videos.dialogs.clearPlaylistTitle")}
        description={t("apps.videos.dialogs.clearPlaylistDescription")}
      />
      <ConfirmDialog
        isOpen={isConfirmResetOpen}
        onOpenChange={setIsConfirmResetOpen}
        onConfirm={() => {
          setVideos(DEFAULT_VIDEOS);
          safeSetCurrentVideoId(
            DEFAULT_VIDEOS.length > 0 ? DEFAULT_VIDEOS[0].id : null
          );
          setIsPlaying(false);
          setOriginalOrder(DEFAULT_VIDEOS);
          setIsConfirmResetOpen(false);
          showStatus(t("apps.videos.status.playlistReset"));
        }}
        title={t("apps.videos.dialogs.resetPlaylistTitle")}
        description={t("apps.videos.dialogs.resetPlaylistDescription")}
      />
      <InputDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onSubmit={addVideo}
        title={t("apps.videos.dialogs.addVideoTitle")}
        description={t("apps.videos.dialogs.addVideoDescription")}
        value={urlInput}
        onChange={setUrlInput}
        isLoading={isAddingVideo}
      />
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType={t("apps.videos.dialogs.videoItemType")}
        itemIdentifier={getCurrentVideo()?.id || ""}
        title={getCurrentVideo()?.title}
        details={getCurrentVideo()?.artist}
        generateShareUrl={videosGenerateShareUrl}
      />
    </>
  );
}
