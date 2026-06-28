import { type RefObject } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import type { AppProps } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { CreateChannelDialog } from "../CreateChannelDialog";
import { ChannelPromptInput } from "../ChannelPromptInput";
import { TvCrtEffects } from "../TvCrtEffects";
import { TvVideoDrawer } from "../TvVideoDrawer";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata } from "../..";
import { Button } from "@/components/ui/button";
import { VideoFullScreenPortal } from "@/components/shared/VideoFullScreenPortal";
import { YouTubePlayer } from "@/components/shared/YouTubePlayer";
import { MtvLyricsOverlay } from "../MtvLyricsOverlay";
import { MTV_CHANNEL_ID } from "../../hooks/useTvLogic";
import {
  SkipBack,
  SkipForward,
  Play,
  Pause,
  List,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type ReactPlayer from "react-player";
import { AnimatedNumber } from "@/components/shared/lcd/AnimatedNumber";
import { LcdAnimatedTitle } from "@/components/shared/lcd/LcdAnimatedTitle";
import { LcdStatusDisplay } from "@/components/shared/lcd/LcdStatusDisplay";
import {
  STATUS_FADE_TRANSITION,
  STATUS_OPACITY_ANIMATE,
  STATUS_OPACITY_INITIAL,
} from "@/components/shared/lcd/lcdMotionConstants";
import {
  AnimatedScheduleLabel,
  ScrollingChannelName,
} from "./TvLcdWidgets";
import { useTvAppController } from "./useTvAppController";

export function TvAppComponent(props: AppProps) {
  const c = useTvAppController(props);

  const url = c.currentVideo?.url ?? "";
  const hasVideos = (c.currentChannel?.videos.length ?? 0) > 0;

  const lcdScrollTitle =
    c.lcdSlot === "now" ? c.scheduleNowTitle : c.scheduleNextTitle;
  const lcdScrollPlaying = c.isPlaying && Boolean(lcdScrollTitle);
  const scheduleLabel =
    c.lcdSlot === "now" ? c.t("apps.tv.status.now") : c.t("apps.tv.status.next");
  const titleAnimDirection =
    c.lcdSlot === "now" ? c.animationDirection : c.scheduleAnimDirection;

  return (
    <AppWindowShell
      isWindowOpen={c.isWindowOpen}
      isWindowsTheme={c.isWindowsTheme}
      isForeground={c.isForeground}
      menuBar={c.menuBar}
      windowFrameProps={{
        title: c.windowTitle,
        onClose: c.handleInterceptedClose,
        isForeground: c.isForeground,
        appId: "tv",
        material: c.isMacOSTheme ? "brushedmetal" : "default",
        skipInitialSound: c.skipInitialSound,
        instanceId: c.instanceId,
        interceptClose: true,
        onFullscreenToggle: c.toggleFullScreen,
        drawer: (
          <TvVideoDrawer
            isOpen={c.isDrawerOpen && !c.isFullScreen}
            channel={c.currentChannel ?? null}
            channels={c.channels}
            currentChannelId={c.currentChannelId}
            currentVideoIndex={c.videoIndex}
            onSelectChannel={c.setChannelById}
            onSelectVideo={c.selectVideoFromPlaylist}
            onRemoveVideo={c.playlistRemoveVideo}
          />
        ),
      }}
      trailing={
        <>
          <AppHelpAboutDialogs
            appId="tv"
            helpItems={c.translatedHelpItems}
            metadata={appMetadata}
            isHelpOpen={c.isHelpDialogOpen}
            onHelpOpenChange={c.setIsHelpDialogOpen}
            isAboutOpen={c.isAboutDialogOpen}
            onAboutOpenChange={c.setIsAboutDialogOpen}
          />
          <CreateChannelDialog
            isOpen={c.isCreateChannelOpen}
            onOpenChange={c.setIsCreateChannelOpen}
            onChannelCreated={(id) => {
              c.setChannelById(id);
            }}
          />
          <ConfirmDialog
            isOpen={Boolean(c.pendingDeleteChannel)}
            onOpenChange={(open) => {
              if (!open) c.setPendingDeleteId(null);
            }}
            onConfirm={() => {
              if (c.pendingDeleteId) {
                c.removeChannel(c.pendingDeleteId);
                c.setPendingDeleteId(null);
              }
            }}
            title={c.t("apps.tv.delete.title")}
            description={c.t("apps.tv.delete.description", {
              name: c.pendingDeleteChannel?.name ?? "",
            })}
          />
          <ConfirmDialog
            isOpen={c.isResetConfirmOpen}
            onOpenChange={c.setIsResetConfirmOpen}
            onConfirm={() => {
              c.resetChannels();
              c.setIsResetConfirmOpen(false);
              toast.success(c.t("apps.tv.toasts.resetSuccess"));
            }}
            title={c.t("apps.tv.reset.title")}
            description={c.t("apps.tv.reset.description")}
          />
          <LoginDialog
            initialTab={c.isVerifyDialogOpen ? "login" : "signup"}
            isOpen={c.isUsernameDialogOpen || c.isVerifyDialogOpen}
            onOpenChange={(open) => {
              if (!open) {
                c.setIsUsernameDialogOpen(false);
                c.setVerifyDialogOpen(false);
              }
            }}
            usernameInput={c.verifyUsernameInput}
            onUsernameInputChange={c.setVerifyUsernameInput}
            passwordInput={c.verifyPasswordInput}
            onPasswordInputChange={c.setVerifyPasswordInput}
            onLoginSubmit={async () => {
              await c.handleVerifyTokenSubmit(c.verifyPasswordInput, true);
            }}
            isLoginLoading={c.isVerifyingToken}
            loginError={c.verifyError}
            newUsername={c.newUsername}
            onNewUsernameChange={c.setNewUsername}
            newPassword={c.newPassword}
            onNewPasswordChange={c.setNewPassword}
            onSignUpSubmit={
              c.isVerifyDialogOpen
                ? async () => {
                    c.setVerifyDialogOpen(false);
                    c.promptSetUsername();
                  }
                : c.submitUsernameDialog
            }
            isSignUpLoading={c.isSettingUsername}
            signUpError={c.usernameError}
          />
          {c.isFullScreen && url ? (
            <VideoFullScreenPortal
              isOpen={c.isFullScreen}
              onClose={() => c.toggleFullScreen()}
              url={url}
              playbackRequested={c.playbackRequested}
              isPlaying={c.isPlaying}
              onPlay={c.confirmPlayback}
              onPause={() => c.setIsPlaying(false)}
              onTogglePlay={c.handleTogglePlay}
              onEnded={c.handleVideoEnd}
              onProgress={c.handleProgress}
              onDuration={c.handleDuration}
              onReady={() => {}}
              onPlaybackAttemptFailed={c.handlePlaybackAttemptFailed}
              onPlayerError={c.handleError}
              loop={false}
              volume={c.masterVolume}
              playerRef={c.fullScreenPlayerRef as RefObject<ReactPlayer>}
              onSeek={c.handleSeek}
              onNext={c.nextVideo}
              onPrevious={c.prevVideo}
              onChannelNext={c.nextChannel}
              onChannelPrev={c.prevChannel}
              showStatus={c.showStatus}
              statusMessage={c.statusMessage}
              videoOverlay={
                <>
                  {c.channelBugOverlay}
                  {c.currentChannelId === MTV_CHANNEL_ID && c.closedCaptionsOn ? (
                    <MtvLyricsOverlay
                      songId={c.currentVideo?.id}
                      title={c.currentVideo?.title}
                      artist={c.currentVideo?.artist}
                      visible={
                        !c.screenOff &&
                        !c.poweringOff &&
                        !c.isBuffering &&
                        !c.isTransitioningCc &&
                        Boolean(url)
                      }
                      variant="fullscreen"
                    />
                  ) : null}
                </>
              }
            />
          ) : null}
        </>
      }
    >
        <div
          className={cn(
            "flex flex-col w-full h-full text-white",
            c.isMacOSTheme ? "bg-transparent" : "bg-[#1a1a1a]"
          )}
        >
          <div
            className="flex-1 relative overflow-hidden min-h-0 bg-black"
            style={
              c.isMacOSTheme
                ? {
                    border: "1px solid rgba(0, 0, 0, 0.55)",
                    boxShadow:
                      "inset 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.4)",
                  }
                : undefined
            }
          >
            <div className="w-full h-full overflow-hidden relative bg-black">
              <div className="w-full h-[calc(100%+300px)] mt-[-150px] relative">
                {!c.isFullScreen && url && (
                  <YouTubePlayer
                    ref={c.playerRef}
                    url={url}
                    // Pause the iframe during the CRT shutdown / paused
                    // "screen off" overlay so audio doesn't keep
                    // playing through a black screen.
                    playing={
                      c.playbackRequested &&
                      !c.isFullScreen &&
                      !c.poweringOff &&
                      !c.screenOff
                    }
                    controls={false}
                    width="calc(100% + 1px)"
                    height="calc(100% + 1px)"
                    volume={c.masterVolume}
                    onEnded={c.handleVideoEnd}
                    onError={c.handleError}
                    onProgress={c.handleProgress}
                    onDuration={c.handleDuration}
                    onPlay={() => {
                      c.confirmPlayback();
                      c.setIsBuffering(false);
                    }}
                    onPause={() => c.setIsPlaying(false)}
                    onPlaybackAttemptFailed={c.handlePlaybackAttemptFailed}
                    onBuffer={() => c.setIsBuffering(true)}
                    onBufferEnd={() => c.setIsBuffering(false)}
                    config={{
                      youtube: { playerVars: { fs: 0, autoplay: 0 } },
                    }}
                  />
                )}
              </div>
              {/* Transparent capture layer that swallows mouse/pointer
                  events so they never reach the YouTube iframe. This
                  prevents the iframe from showing its own hover UI
                  (title overlay, watch-on-YouTube link, etc.) inside
                  the broadcast-TV experience. Sits above the iframe
                  but below the status overlay so the channel-flash
                  is unaffected. */}
              <div
                className="absolute inset-0 z-20"
                aria-hidden
                onClick={c.handleTogglePlay}
              />
              <TvCrtEffects
                suppressAnalogNoise={c.isFullScreen}
                powerOnKey={c.powerOnKey}
                poweringOff={c.poweringOff}
                onPowerOffComplete={c.handlePowerOffComplete}
                screenOff={c.screenOff}
                channelSwitchKey={c.channelSwitchKey}
                buffering={c.isBuffering || (!url && c.isPlaying)}
                crtActive={c.lcdFilterOn}
              />
              {c.currentChannelId === MTV_CHANNEL_ID &&
                c.closedCaptionsOn &&
                !c.isFullScreen && (
                <MtvLyricsOverlay
                  songId={c.currentVideo?.id}
                  title={c.currentVideo?.title}
                  artist={c.currentVideo?.artist}
                  visible={
                    !c.screenOff &&
                    !c.poweringOff &&
                    !c.isBuffering &&
                    !c.isTransitioningCc &&
                    Boolean(url)
                  }
                />
              )}
              <AnimatePresence>
                {c.statusMessage && (
                  <motion.div
                    initial={STATUS_OPACITY_INITIAL}
                    animate={STATUS_OPACITY_ANIMATE}
                    exit={STATUS_OPACITY_INITIAL}
                    transition={STATUS_FADE_TRANSITION}
                    className="absolute top-4 left-4 z-[45]"
                  >
                    <LcdStatusDisplay message={c.statusMessage} />
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Channel-bug logo. Sits at z-[25] — above the YouTube
                  iframe and click-capture layer (z-20) but BELOW the
                  persistent CRT shader overlay (z-30) — so the
                  scanlines / vignette / phosphor mask composite over
                  the logo just like they do over the picture. Corner
                  is hashed from the channel id (top-left, top-right,
                  or bottom-right) so each channel always lands in the
                  same corner but corners vary across c.channels. Only
                  the built-in c.channels ship with branded artwork;
                  custom c.channels return undefined and render nothing.
                  Hidden while the CRT is "off" or collapsing so it
                  doesn't float over a black screen during pause /
                  power-off transitions. Keyed by c.currentChannelId so
                  channel switches unmount the old bug instantly
                  (killing its in-progress burst) and mount a fresh
                  one — the channel-switch CRT static burst covers the
                  swap. No AnimatePresence wrapper because we don't
                  want a lingering exit fade competing with the new
                  bug's mount fade-in. */}
              {!c.isFullScreen && c.channelBugOverlay}
            </div>
          </div>

          <div
            className={cn(
              "flex flex-col gap-4 shrink-0",
              c.isMacOSTheme
                ? "bg-transparent p-2 pt-4 border-t-0"
                : "bg-[#2a2a2a] os-toolbar-texture p-4 border-t border-[#3a3a3a]"
            )}
          >
            <div className="videos-lcd bg-black py-2 px-4 flex items-center justify-between w-full">
              <div className="flex items-center gap-8">
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300",
                    c.isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
                  )}
                >
                  <div>{c.t("apps.tv.status.channel")}</div>
                  <div className="text-xl">
                    <AnimatedNumber number={c.currentChannel?.number ?? 0} />
                  </div>
                </div>
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300 max-w-[5.5rem]",
                    c.isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
                  )}
                >
                  <div>{c.t("apps.tv.status.network")}</div>
                  <ScrollingChannelName
                    name={c.currentChannel?.name ?? ""}
                    isPlaying={c.isPlaying}
                  />
                </div>
              </div>
              <div className="relative overflow-hidden flex-1 min-w-0 px-2">
                {hasVideos && lcdScrollTitle ? (
                  <>
                    <div
                      className={cn(
                        "font-geneva-12 text-[10px] mb-[3px] pl-2 transition-colors duration-300",
                        c.isPlaying ? "text-[#ff00ff]" : "text-neutral-600"
                      )}
                    >
                      <AnimatedScheduleLabel
                        slotKey={c.lcdSlot}
                        text={scheduleLabel}
                        direction={titleAnimDirection}
                      />
                    </div>
                    <div className="relative overflow-hidden">
                      <LcdAnimatedTitle
                        title={lcdScrollTitle}
                        direction={titleAnimDirection}
                        isPlaying={lcdScrollPlaying}
                      />
                      {lcdScrollPlaying && (
                        <>
                          <div className="absolute left-0 top-0 h-full w-4 bg-gradient-to-r from-black to-transparent videos-lcd-fade-left" />
                          <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-l from-black to-transparent videos-lcd-fade-right" />
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="font-geneva-12 text-xl text-neutral-600 opacity-50 pl-2 -mt-1">
                    {c.t("apps.tv.status.noSignal")}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 videos-player-controls">
              <div className="flex items-center gap-2 shrink-0">
                {c.isMacOSTheme ? (
                  <div className="metal-inset-btn-group">
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      onClick={c.prevVideo}
                      disabled={!hasVideos}
                    >
                      <SkipBack size={10} weight="fill" />
                    </button>
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      onClick={c.handleTogglePlay}
                      disabled={!hasVideos}
                      style={{ minWidth: 32 }}
                    >
                      {c.isPlaying ? (
                        <Pause size={10} weight="fill" />
                      ) : (
                        <Play size={10} weight="fill" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="metal-inset-btn metal-inset-icon"
                      onClick={c.nextVideo}
                      disabled={!hasVideos}
                    >
                      <SkipForward size={10} weight="fill" />
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-0">
                    <button
                      type="button"
                      onClick={c.prevVideo}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={!hasVideos}
                    >
                      <img
                        src="/assets/videos/prev.png"
                        alt={c.t("apps.tv.menu.previous")}
                        width={32}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={c.handleTogglePlay}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={!hasVideos}
                    >
                      <img
                        src={
                          c.isPlaying
                            ? "/assets/videos/pause.png"
                            : "/assets/videos/play.png"
                        }
                        alt={
                          c.isPlaying
                            ? c.t("apps.tv.menu.pause")
                            : c.t("apps.tv.menu.play")
                        }
                        width={50}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={c.nextVideo}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={!hasVideos}
                    >
                      <img
                        src="/assets/videos/next.png"
                        alt={c.t("apps.tv.menu.next")}
                        width={32}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                  </div>
                )}
              </div>

              <ChannelPromptInput
                className="flex-1 min-w-0"
                onSubmit={c.handleInlinePromptSubmit}
                isLoading={c.isCreatingChannel || c.isYoutubePasteLoading}
                placeholder={c.t("apps.tv.create.inlinePlaceholder")}
                loadingMessages={[
                  c.t("apps.tv.create.statusPlanning"),
                  c.t("apps.tv.create.statusSearching"),
                  c.t("apps.tv.create.statusTuning"),
                ]}
                ariaLabel={c.t("apps.tv.create.title")}
              />

              <div className="flex items-center gap-2 shrink-0">
                {c.isMacOSTheme ? (
                  <>
                    <div className="metal-inset-btn-group">
                      <button
                        type="button"
                        className="metal-inset-btn font-geneva-12 !text-[11px]"
                        onClick={c.prevChannel}
                      >
                        {c.t("apps.tv.status.channelDown")}
                      </button>
                      <button
                        type="button"
                        className="metal-inset-btn font-geneva-12 !text-[11px]"
                        onClick={c.nextChannel}
                      >
                        {c.t("apps.tv.status.channelUp")}
                      </button>
                    </div>
                    <div className="metal-inset-btn-group">
                      <button
                        type="button"
                        className="metal-inset-btn metal-inset-icon"
                        onClick={c.toggleDrawer}
                        aria-pressed={c.isDrawerOpen}
                        aria-label={c.t("apps.tv.menu.showVideos")}
                        title={c.t("apps.tv.menu.showVideos")}
                        data-state={c.isDrawerOpen ? "on" : undefined}
                      >
                        <List size={10} weight="regular" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-0">
                      <Button
                        type="button"
                        onClick={c.prevChannel}
                        variant="player"
                        className="h-[22px] px-2 font-geneva-12"
                      >
                        {c.t("apps.tv.status.channelDown")}
                      </Button>
                      <Button
                        type="button"
                        onClick={c.nextChannel}
                        variant="player"
                        className="h-[22px] px-2 font-geneva-12"
                      >
                        {c.t("apps.tv.status.channelUp")}
                      </Button>
                    </div>
                    <div className="flex gap-0">
                      <Button
                        type="button"
                        onClick={c.toggleDrawer}
                        variant="player"
                        className={cn(
                          "h-[22px] px-2 font-geneva-12 flex items-center justify-center min-w-[28px]",
                          c.isDrawerOpen &&
                            "brightness-90 ring-1 ring-inset ring-black/25"
                        )}
                        aria-pressed={c.isDrawerOpen}
                        aria-label={c.t("apps.tv.menu.showVideos")}
                        title={c.t("apps.tv.menu.showVideos")}
                      >
                        <List
                          size={14}
                          weight="regular"
                          className="pointer-events-none"
                        />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
    </AppWindowShell>
  );
}
