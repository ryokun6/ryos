import { useCallback, useEffect, useRef, useState } from "react";
import ReactPlayerImport from "react-player";
import type ReactPlayerType from "react-player";
import { createClientLogger } from "@/utils/logger";

// react-player 2 is CJS with an `__esModule`/`default` exports object. Vite's
// dev prebundler (esbuild) resolves the default import to the component, but
// Rolldown production builds use Node CJS semantics where the default import
// is the whole exports object — rendering it throws React error #130.
const ReactPlayer = ((
  ReactPlayerImport as unknown as { default?: typeof ReactPlayerImport }
).default ?? ReactPlayerImport) as typeof ReactPlayerImport;

const youtubePlayerLog = createClientLogger("YouTubePlayer");

export const PLAYBACK_CONFIRMATION_TIMEOUT_MS = 8000;

export type YouTubePlaybackFailure =
  | { kind: "player-error"; error: unknown }
  | { kind: "confirmation-timeout"; timeoutMs: number };

export type YouTubePlayerProps = React.ComponentProps<typeof ReactPlayer> & {
  onPlaybackAttemptFailed?: (failure: YouTubePlaybackFailure) => void;
  playbackConfirmationTimeoutMs?: number;
};

function setReactRef<T>(ref: React.Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

export const YouTubePlayer = function YouTubePlayer(
  {
    ref,
    config,
    url,
    playing = false,
    onReady,
    onPlay,
    onPause,
    onError,
    onPlaybackAttemptFailed,
    playbackConfirmationTimeoutMs = PLAYBACK_CONFIRMATION_TIMEOUT_MS,
    ...props
  }: YouTubePlayerProps & {
    ref?: React.Ref<ReactPlayerType>;
  }
) {
  const [readyUrl, setReadyUrl] = useState<YouTubePlayerProps["url"] | null>(
    null
  );
  const [blockedAttempt, setBlockedAttempt] = useState(false);
  const playerRef = useRef<ReactPlayerType | null>(null);
  const playbackConfirmedRef = useRef(false);
  // react-player 2.16 calls YouTube.play() immediately when `playing` flips,
  // even before its own ready flag is set. The YouTube adapter only warns when
  // playVideo is unavailable, so gate the controlled prop on the matching
  // URL's onReady callback and require a later onPlay confirmation.
  const readyForCurrentUrl = Object.is(readyUrl, url);
  const setPlayerRef = useCallback(
    (player: ReactPlayerType | null) => {
      playerRef.current = player;
      setReactRef(ref, player);
    },
    [ref]
  );

  useEffect(() => {
    playbackConfirmedRef.current = false;
    setBlockedAttempt(false);
  }, [url]);

  useEffect(() => {
    if (!playing) {
      playbackConfirmedRef.current = false;
      setBlockedAttempt(false);
    }
  }, [playing]);

  const failPendingAttempt = useCallback(
    (failure: YouTubePlaybackFailure) => {
      if (!playing) return;
      playbackConfirmedRef.current = false;
      setBlockedAttempt(true);
      youtubePlayerLog.warn("playback attempt failed", {
        failure,
        url: typeof url === "string" ? url : "non-string-url",
        ready: readyForCurrentUrl,
      });
      onPlaybackAttemptFailed?.(failure);
    },
    [onPlaybackAttemptFailed, playing, readyForCurrentUrl, url]
  );

  useEffect(() => {
    if (!playing || playbackConfirmedRef.current || blockedAttempt) return;
    const timeoutId = window.setTimeout(() => {
      if (playbackConfirmedRef.current) return;
      failPendingAttempt({
        kind: "confirmation-timeout",
        timeoutMs: playbackConfirmationTimeoutMs,
      });
    }, playbackConfirmationTimeoutMs);
    return () => window.clearTimeout(timeoutId);
  }, [
    blockedAttempt,
    failPendingAttempt,
    playbackConfirmationTimeoutMs,
    playing,
    url,
  ]);

  return (
    <ReactPlayer
      ref={setPlayerRef}
      url={url}
      playing={playing && readyForCurrentUrl && !blockedAttempt}
      playsinline
      onReady={(player) => {
        setReadyUrl(url);
        setBlockedAttempt(false);
        onReady?.(player);
      }}
      onPlay={() => {
        if (!playing || blockedAttempt) {
          const internalPlayer = playerRef.current?.getInternalPlayer?.();
          if (
            internalPlayer &&
            typeof internalPlayer.pauseVideo === "function"
          ) {
            internalPlayer.pauseVideo();
          }
          youtubePlayerLog.warn("ignored play without an active request", {
            url: typeof url === "string" ? url : "non-string-url",
          });
          return;
        }
        playbackConfirmedRef.current = true;
        onPlay?.();
      }}
      onPause={() => {
        playbackConfirmedRef.current = false;
        onPause?.();
      }}
      onError={(error: unknown, data?: unknown, hlsInstance?: unknown, hlsGlobal?: unknown) => {
        failPendingAttempt({ kind: "player-error", error });
        onError?.(error, data, hlsInstance, hlsGlobal);
      }}
      config={{
        ...config,
        youtube: {
          ...config?.youtube,
          playerVars: {
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            iv_load_policy: 3,
            disablekb: 1,
            playsinline: 1,
            enablejsapi: 1,
            origin: window.location.origin,
            ...config?.youtube?.playerVars,
          },
          embedOptions: {
            referrerPolicy: "strict-origin-when-cross-origin",
            ...config?.youtube?.embedOptions,
          },
        },
      }}
      {...props}
    />
  );
};
