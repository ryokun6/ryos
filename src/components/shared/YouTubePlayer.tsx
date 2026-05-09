import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/**
 * Native HTML5 video player that resolves YouTube URLs into direct stream
 * URLs via the `/api/youtube/extract` endpoint (powered by yt-dlp on the
 * server). Exposes a ref API compatible with react-player so the rest of
 * the app (iPod, Karaoke, TV, Videos, Listen sync, Winamp) can use it as
 * a drop-in replacement.
 *
 * What this intentionally does NOT do:
 *  - Talk to YouTube's IFrame API. There is no embed; we render a plain
 *    `<video>` and stream the URL yt-dlp gave us. The `getInternalPlayer()`
 *    method returns a YT.Player-shaped shim so existing call sites keep
 *    working without code changes.
 *  - Render YouTube branding / overlays. The `controls` prop maps to the
 *    `<video controls>` attribute; YouTube's `playerVars` (via `config`)
 *    are accepted but ignored.
 */

type ProgressState = {
  played: number;
  playedSeconds: number;
  loaded: number;
  loadedSeconds: number;
};

export interface YouTubePlayerProps {
  url: string;
  playing?: boolean;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  volume?: number;
  playbackRate?: number;
  width?: number | string;
  height?: number | string;
  playsinline?: boolean;
  /** ms between `onProgress` callbacks. Mirrors react-player's prop name. */
  progressInterval?: number;
  /** Forwarded to the rendered container element. */
  style?: CSSProperties;
  /** Forwarded to the rendered container element. */
  className?: string;
  /**
   * Accepted for API compatibility with react-player. The native player
   * cannot honor `youtube.playerVars` (no iframe), so this is ignored.
   */
  config?: unknown;

  onReady?: (player: YouTubePlayerHandle) => void;
  onStart?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (err: unknown) => void;
  onSeek?: (seconds: number) => void;
  onBuffer?: () => void;
  onBufferEnd?: () => void;
  onDuration?: (duration: number) => void;
  onProgress?: (state: ProgressState) => void;
}

/** Subset of the YT.Player surface our internal-player shim implements. */
export interface NativeInternalPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  /** YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued. */
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
  setVolume: (vol100: number) => void;
  getVolume: () => number;
  setPlaybackRate: (rate: number) => void;
  getPlaybackRate: () => number;
  /** react-player consumers occasionally read/write this directly. */
  playbackRate: number;
  /** The underlying `<video>` element (handy for low-level features). */
  videoElement: HTMLVideoElement | null;
}

export interface YouTubePlayerHandle {
  seekTo: (amount: number, type?: "seconds" | "fraction") => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getSecondsLoaded: () => number;
  getInternalPlayer: () => NativeInternalPlayer;
}

/** YT.PlayerState mirror constants. */
const YT_STATE_UNSTARTED = -1;
const YT_STATE_ENDED = 0;
const YT_STATE_PLAYING = 1;
const YT_STATE_PAUSED = 2;
const YT_STATE_BUFFERING = 3;

interface ExtractedFormat {
  url: string;
  ext: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  isProgressive: boolean;
}

interface ExtractResponse {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  isLive: boolean;
  expiresAt: string;
  best: ExtractedFormat | null;
  bestAudio: ExtractedFormat | null;
  formats: ExtractedFormat[];
  /**
   * Same-origin URL the player should set as `<video src>`. Required for
   * production playback because googlevideo.com signed URLs are tied to
   * the User-Agent / Origin / Referer that yt-dlp used during extraction
   * and would 403 if fetched directly from the browser.
   */
  proxyUrl?: string | null;
  proxyAudioUrl?: string | null;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** Pull an 11-char video id from any YouTube URL shape (or pass-through ids). */
function parseYouTubeId(input: string | undefined | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) return null;
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0] ?? "";
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    const v = url.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    const m = url.pathname.match(
      /\/(?:embed\/|v\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/
    );
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/**
 * Cache keyed by `${id}:${refreshNonce}` so a forced refresh evicts the
 * stale entry without touching the rest of the app.
 */
const memoryCache = new Map<string, { data: ExtractResponse; expiresAt: number }>();
const inflight = new Map<string, Promise<ExtractResponse>>();

async function fetchExtract(
  videoId: string,
  options: { refresh?: boolean; signal?: AbortSignal } = {}
): Promise<ExtractResponse> {
  const cacheKey = videoId;
  const now = Date.now();
  if (!options.refresh) {
    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expiresAt - now > 30_000) {
      return cached.data;
    }
    const pending = inflight.get(cacheKey);
    if (pending) return pending;
  }

  const params = new URLSearchParams({ id: videoId });
  if (options.refresh) params.set("refresh", "1");
  const url = `/api/youtube/extract?${params.toString()}`;

  const promise = (async () => {
    const res = await fetch(url, {
      method: "GET",
      credentials: "same-origin",
      signal: options.signal,
    });
    if (!res.ok) {
      let detail = "";
      try {
        const json = await res.json();
        detail =
          (json && (json.detail || json.error)) || `HTTP ${res.status}`;
      } catch {
        detail = `HTTP ${res.status}`;
      }
      throw new Error(`YouTube extract failed: ${detail}`);
    }
    const data = (await res.json()) as ExtractResponse;
    const expiresAt = Date.parse(data.expiresAt);
    memoryCache.set(cacheKey, {
      data,
      expiresAt: Number.isFinite(expiresAt)
        ? expiresAt
        : Date.now() + 5 * 60 * 60 * 1000,
    });
    return data;
  })();

  inflight.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(cacheKey);
  }
}

function pickPlayableUrl(data: ExtractResponse): string | null {
  // Prefer the same-origin proxy so the browser doesn't have to talk
  // to googlevideo.com directly (UA / referer mismatches → 403).
  if (data.proxyUrl) return data.proxyUrl;
  if (data.proxyAudioUrl) return data.proxyAudioUrl;
  if (data.best?.url) return data.best.url;
  if (data.bestAudio?.url) return data.bestAudio.url;
  return data.formats.find((f) => f.url)?.url ?? null;
}

function dimToCss(value: number | string | undefined): string {
  if (value == null) return "";
  return typeof value === "number" ? `${value}px` : value;
}

export const YouTubePlayer = forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(
  function YouTubePlayer(
    {
      url,
      playing = false,
      controls = false,
      loop = false,
      muted = false,
      volume = 1,
      playbackRate = 1,
      width,
      height,
      playsinline = true,
      progressInterval = 1000,
      style,
      className,
      onReady,
      onStart,
      onPlay,
      onPause,
      onEnded,
      onError,
      onSeek,
      onBuffer,
      onBufferEnd,
      onDuration,
      onProgress,
    },
    ref
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
    const [resolvedDuration, setResolvedDuration] = useState<number | null>(null);
    const [loadError, setLoadError] = useState<unknown>(null);

    // Stable refs for callbacks so polling effects don't re-subscribe on every prop change.
    const callbacksRef = useRef({
      onReady,
      onStart,
      onPlay,
      onPause,
      onEnded,
      onError,
      onSeek,
      onBuffer,
      onBufferEnd,
      onDuration,
      onProgress,
    });
    useEffect(() => {
      callbacksRef.current = {
        onReady,
        onStart,
        onPlay,
        onPause,
        onEnded,
        onError,
        onSeek,
        onBuffer,
        onBufferEnd,
        onDuration,
        onProgress,
      };
    });

    const startedRef = useRef(false);
    const lastReportedDurationRef = useRef<number | null>(null);
    const playerStateRef = useRef<number>(YT_STATE_UNSTARTED);

    const videoId = useMemo(() => parseYouTubeId(url), [url]);

    // Resolve the YouTube URL to a direct stream via the API. Refetch when the
    // id changes; abort in-flight requests on teardown.
    useEffect(() => {
      if (!videoId) {
        setResolvedUrl(null);
        setResolvedDuration(null);
        return;
      }
      const controller = new AbortController();
      let cancelled = false;
      setLoadError(null);
      startedRef.current = false;
      lastReportedDurationRef.current = null;
      playerStateRef.current = YT_STATE_UNSTARTED;

      fetchExtract(videoId, { signal: controller.signal })
        .then((data) => {
          if (cancelled) return;
          const playable = pickPlayableUrl(data);
          if (!playable) {
            const err = new Error("No playable YouTube format");
            setLoadError(err);
            callbacksRef.current.onError?.(err);
            return;
          }
          setResolvedUrl(playable);
          if (typeof data.duration === "number" && data.duration > 0) {
            setResolvedDuration(data.duration);
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if ((err as { name?: string })?.name === "AbortError") return;
          setLoadError(err);
          callbacksRef.current.onError?.(err);
        });

      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [videoId]);

    // Apply imperative props (volume / muted / playbackRate) to the element
    // whenever they change. Each effect is independent so React batching
    // doesn't drop updates.
    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const next = Math.max(0, Math.min(1, volume));
      if (Math.abs(v.volume - next) > 0.001) v.volume = next;
    }, [volume]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.muted !== muted) v.muted = muted;
    }, [muted]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      const next = playbackRate || 1;
      if (Math.abs(v.playbackRate - next) > 0.001) v.playbackRate = next;
    }, [playbackRate]);

    useEffect(() => {
      const v = videoRef.current;
      if (!v) return;
      if (v.loop !== loop) v.loop = loop;
    }, [loop]);

    // Drive play/pause from the `playing` prop. We try-catch because mobile
    // Safari throws synchronously when autoplay is blocked.
    useEffect(() => {
      const v = videoRef.current;
      if (!v || !resolvedUrl) return;
      if (playing) {
        const playPromise = v.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch((err) => {
            // Don't spam onError: autoplay rejection is expected; the
            // surrounding app falls back to "paused" via the standard
            // pause event we'll emit below.
            if ((err as { name?: string })?.name !== "AbortError") {
              callbacksRef.current.onError?.(err);
            }
          });
        }
      } else {
        try {
          v.pause();
        } catch (err) {
          callbacksRef.current.onError?.(err);
        }
      }
    }, [playing, resolvedUrl]);

    // Periodic onProgress emitter, mirroring react-player's contract.
    useEffect(() => {
      if (!onProgress && !progressInterval) return;
      const interval = Math.max(100, progressInterval || 1000);
      const id = window.setInterval(() => {
        const v = videoRef.current;
        if (!v) return;
        const duration = v.duration;
        const playedSeconds = v.currentTime;
        let loadedSeconds = 0;
        try {
          if (v.buffered.length > 0) {
            loadedSeconds = v.buffered.end(v.buffered.length - 1);
          }
        } catch {
          /* ignore */
        }
        const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
        const state: ProgressState = {
          played: safeDuration ? playedSeconds / safeDuration : 0,
          playedSeconds,
          loaded: safeDuration ? loadedSeconds / safeDuration : 0,
          loadedSeconds,
        };
        callbacksRef.current.onProgress?.(state);
      }, interval);
      return () => window.clearInterval(id);
    }, [progressInterval, onProgress]);

    // Build the imperative ref handle.
    const internalPlayer = useMemo<NativeInternalPlayer>(() => {
      const handle: NativeInternalPlayer = {
        playVideo() {
          const v = videoRef.current;
          if (!v) return;
          const p = v.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => {
              /* play() rejection is surfaced via the pause event */
            });
          }
        },
        pauseVideo() {
          videoRef.current?.pause();
        },
        stopVideo() {
          const v = videoRef.current;
          if (!v) return;
          try {
            v.pause();
            v.currentTime = 0;
          } catch {
            /* ignore */
          }
        },
        seekTo(seconds: number) {
          const v = videoRef.current;
          if (!v) return;
          try {
            v.currentTime = seconds;
          } catch {
            /* ignore */
          }
        },
        getPlayerState() {
          return playerStateRef.current;
        },
        getCurrentTime() {
          return videoRef.current?.currentTime ?? 0;
        },
        getDuration() {
          const v = videoRef.current;
          if (v && Number.isFinite(v.duration) && v.duration > 0) {
            return v.duration;
          }
          return resolvedDuration ?? 0;
        },
        setVolume(vol100: number) {
          const v = videoRef.current;
          if (!v) return;
          v.volume = Math.max(0, Math.min(1, vol100 / 100));
        },
        getVolume() {
          return Math.round((videoRef.current?.volume ?? 0) * 100);
        },
        setPlaybackRate(rate: number) {
          const v = videoRef.current;
          if (!v) return;
          v.playbackRate = rate || 1;
        },
        getPlaybackRate() {
          return videoRef.current?.playbackRate ?? 1;
        },
        get playbackRate() {
          return videoRef.current?.playbackRate ?? 1;
        },
        set playbackRate(rate: number) {
          const v = videoRef.current;
          if (!v) return;
          v.playbackRate = rate || 1;
        },
        get videoElement() {
          return videoRef.current;
        },
      };
      return handle;
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolvedDuration]);

    useImperativeHandle(
      ref,
      (): YouTubePlayerHandle => ({
        seekTo(amount: number, type: "seconds" | "fraction" = "seconds") {
          const v = videoRef.current;
          if (!v) return;
          let seconds = amount;
          if (type === "fraction") {
            const dur = Number.isFinite(v.duration) && v.duration > 0
              ? v.duration
              : resolvedDuration ?? 0;
            seconds = amount * dur;
          }
          try {
            v.currentTime = seconds;
          } catch {
            /* ignore */
          }
        },
        getCurrentTime() {
          return videoRef.current?.currentTime ?? 0;
        },
        getDuration() {
          const v = videoRef.current;
          if (v && Number.isFinite(v.duration) && v.duration > 0) {
            return v.duration;
          }
          return resolvedDuration ?? 0;
        },
        getSecondsLoaded() {
          const v = videoRef.current;
          if (!v) return 0;
          try {
            if (v.buffered.length > 0) {
              return v.buffered.end(v.buffered.length - 1);
            }
          } catch {
            /* ignore */
          }
          return 0;
        },
        getInternalPlayer() {
          return internalPlayer;
        },
      }),
      [internalPlayer, resolvedDuration]
    );

    // ---- HTMLVideoElement event wiring ---------------------------------
    const handleLoadedMetadata = useCallback(() => {
      const v = videoRef.current;
      if (!v) return;
      // Seed the video element with the current props before the user can
      // interact, since some apply-prop effects only run once the element exists.
      v.volume = Math.max(0, Math.min(1, volume));
      if (muted) v.muted = true;
      v.playbackRate = playbackRate || 1;
      v.loop = loop;

      const dur = Number.isFinite(v.duration) && v.duration > 0
        ? v.duration
        : resolvedDuration ?? 0;
      if (dur && lastReportedDurationRef.current !== dur) {
        lastReportedDurationRef.current = dur;
        callbacksRef.current.onDuration?.(dur);
      }
    }, [muted, playbackRate, volume, loop, resolvedDuration]);

    const handleDurationChange = useCallback(() => {
      const v = videoRef.current;
      if (!v) return;
      const dur = v.duration;
      if (Number.isFinite(dur) && dur > 0 && lastReportedDurationRef.current !== dur) {
        lastReportedDurationRef.current = dur;
        callbacksRef.current.onDuration?.(dur);
      }
    }, []);

    const handleCanPlay = useCallback(() => {
      const handle: YouTubePlayerHandle = {
        seekTo: (amount: number, type: "seconds" | "fraction" = "seconds") => {
          const v = videoRef.current;
          if (!v) return;
          let seconds = amount;
          if (type === "fraction") {
            seconds = amount * (v.duration || 0);
          }
          v.currentTime = seconds;
        },
        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
        getDuration: () => videoRef.current?.duration ?? 0,
        getSecondsLoaded: () => 0,
        getInternalPlayer: () => internalPlayer,
      };
      callbacksRef.current.onReady?.(handle);
    }, [internalPlayer]);

    const handlePlay = useCallback(() => {
      playerStateRef.current = YT_STATE_PLAYING;
      if (!startedRef.current) {
        startedRef.current = true;
        callbacksRef.current.onStart?.();
      }
      callbacksRef.current.onPlay?.();
    }, []);

    const handlePause = useCallback(() => {
      playerStateRef.current = YT_STATE_PAUSED;
      callbacksRef.current.onPause?.();
    }, []);

    const handleEnded = useCallback(() => {
      playerStateRef.current = YT_STATE_ENDED;
      callbacksRef.current.onEnded?.();
    }, []);

    const handleSeeked = useCallback(() => {
      const v = videoRef.current;
      callbacksRef.current.onSeek?.(v?.currentTime ?? 0);
    }, []);

    const handleWaiting = useCallback(() => {
      playerStateRef.current = YT_STATE_BUFFERING;
      callbacksRef.current.onBuffer?.();
    }, []);

    const handlePlaying = useCallback(() => {
      playerStateRef.current = YT_STATE_PLAYING;
      callbacksRef.current.onBufferEnd?.();
    }, []);

    const handleError = useCallback(() => {
      const v = videoRef.current;
      const err = v?.error;
      // If the URL probably expired (network / decode error), try once to
      // refetch via the extract API.
      if (videoId && err && (err.code === MediaError.MEDIA_ERR_NETWORK || err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)) {
        fetchExtract(videoId, { refresh: true })
          .then((data) => {
            const playable = pickPlayableUrl(data);
            if (playable) {
              setResolvedUrl(playable);
            } else {
              callbacksRef.current.onError?.(err);
            }
          })
          .catch((refreshErr) => {
            callbacksRef.current.onError?.(refreshErr);
          });
        return;
      }
      callbacksRef.current.onError?.(err ?? loadError ?? new Error("video error"));
    }, [videoId, loadError]);

    const computedStyle: CSSProperties = {
      width: dimToCss(width),
      height: dimToCss(height),
      ...style,
    };

    // Keep the legacy `react-player` class so existing global styles (in
    // `src/index.css`) keep applying without further refactor.
    const containerClassName = ["react-player", className]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        className={containerClassName}
        style={computedStyle}
        data-video-id={videoId ?? undefined}
      >
        <video
          ref={videoRef}
          src={resolvedUrl ?? undefined}
          controls={controls}
          loop={loop}
          muted={muted}
          autoPlay={false}
          playsInline={playsinline}
          preload="metadata"
          // The container already constrains size; the element fills it
          // so callers can keep their existing layout / cropping styles.
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            backgroundColor: "black",
            display: "block",
          }}
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleDurationChange}
          onCanPlay={handleCanPlay}
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onSeeked={handleSeeked}
          onWaiting={handleWaiting}
          onPlaying={handlePlaying}
          onError={handleError}
        />
      </div>
    );
  }
);

export default YouTubePlayer;
