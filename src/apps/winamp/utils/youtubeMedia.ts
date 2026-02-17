/**
 * Custom Webamp media implementation backed by YouTube IFrame API.
 * Replaces the default HTML5 <audio> element so Winamp can play
 * tracks from the iPod music library via YouTube.
 */
import type { Band } from "webamp";

// ── Tiny event emitter (matches Webamp's Emitter contract) ──────────
type Listener = (...args: unknown[]) => void;

class Emitter {
  private _listeners: Record<string, Listener[]> = {};

  on(event: string, cb: Listener) {
    (this._listeners[event] ??= []).push(cb);
  }

  trigger(event: string, ...args: unknown[]) {
    (this._listeners[event] ?? []).forEach((cb) => cb(...args));
  }

  dispose() {
    this._listeners = {};
  }
}

// ── Helpers ─────────────────────────────────────────────────────────
function extractVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/
  );
  return m ? m[1] : null;
}

let ytApiReady: Promise<void> | null = null;

function ensureYTApi(): Promise<void> {
  if (ytApiReady) return ytApiReady;

  if (
    typeof window !== "undefined" &&
    (window as unknown as Record<string, unknown>).YT &&
    ((window as unknown as Record<string, unknown>).YT as Record<string, unknown>).Player
  ) {
    ytApiReady = Promise.resolve();
    return ytApiReady;
  }

  ytApiReady = new Promise<void>((resolve) => {
    const prev = (window as unknown as Record<string, () => void>)
      .onYouTubeIframeAPIReady;
    (window as unknown as Record<string, () => void>).onYouTubeIframeAPIReady =
      () => {
        prev?.();
        resolve();
      };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });

  return ytApiReady;
}

// ── YouTubeMedia class ──────────────────────────────────────────────
export class YouTubeMedia {
  private _emitter = new Emitter();
  private _player: YT.Player | null = null;
  private _container: HTMLDivElement;
  private _volume = 50;
  private _duration = 0;
  private _timeElapsed = 0;
  private _pollId: ReturnType<typeof setInterval> | null = null;
  private _analyserCtx: AudioContext | null = null;
  private _analyser: AnalyserNode | null = null;
  private _disposed = false;
  private _playerReady = false;
  private _pendingLoadResolve: (() => void) | null = null;
  private _lastReportedDuration = 0;

  constructor() {
    this._container = document.createElement("div");
    this._container.id = `yt-webamp-player-${Date.now()}`;
    this._container.style.position = "fixed";
    this._container.style.width = "1px";
    this._container.style.height = "1px";
    this._container.style.opacity = "0";
    this._container.style.pointerEvents = "none";
    this._container.style.left = "-9999px";
    this._container.style.top = "-9999px";
    document.body.appendChild(this._container);
  }

  // ── IMedia interface ──────────────────────────────────────────────

  setVolume(volume: number) {
    this._volume = volume;
    this._player?.setVolume?.(volume);
  }

  setBalance(_balance: number) {
    // YouTube API doesn't support stereo balance
  }

  setPreamp(_value: number) {
    // No Web-Audio graph to apply preamp to
  }

  on(event: string, cb: (...args: unknown[]) => void) {
    this._emitter.on(event, cb);
  }

  timeElapsed(): number {
    return this._timeElapsed;
  }

  duration(): number {
    return this._duration;
  }

  async play(): Promise<void> {
    this._player?.playVideo?.();
  }

  pause() {
    this._player?.pauseVideo?.();
  }

  stop() {
    this._player?.stopVideo?.();
    this._timeElapsed = 0;
  }

  seekToPercentComplete(percent: number) {
    if (this._duration > 0) {
      const time = (percent / 100) * this._duration;
      this._player?.seekTo?.(time, true);
      this._timeElapsed = time;
      this._emitter.trigger("timeupdate");
    }
  }

  seekToTime(time: number) {
    if (this._duration > 0) {
      const clamped = Math.max(0, Math.min(time, this._duration));
      this._player?.seekTo?.(clamped, true);
      this._timeElapsed = clamped;
      this._emitter.trigger("timeupdate");
    }
  }

  async loadFromUrl(url: string, autoPlay: boolean): Promise<void> {
    const videoId = extractVideoId(url);

    if (!videoId) {
      this._duration = 0;
      this._timeElapsed = 0;
      this._emitter.trigger("loaded");
      return;
    }

    this._timeElapsed = 0;
    this._duration = 0;
    this._lastReportedDuration = 0;
    this._stopPolling();

    await ensureYTApi();
    if (this._disposed) return;

    // If we already have a player, reuse it with loadVideoById / cueVideoById.
    // This avoids the destroy/recreate cycle that breaks prev/next skip.
    if (this._player && this._playerReady) {
      // The onStateChange handler will call _resolvePendingLoad() when the
      // new video reaches PLAYING or CUED, syncing duration to Webamp's store.
      return new Promise<void>((resolve) => {
        this._pendingLoadResolve = resolve;

        if (autoPlay) {
          this._player!.loadVideoById(videoId);
        } else {
          this._player!.cueVideoById(videoId);
        }
      });
    }

    // First time: create the player from scratch
    return new Promise<void>((resolve) => {
      this._player = new YT.Player(this._container.id, {
        width: "1",
        height: "1",
        videoId,
        playerVars: {
          autoplay: autoPlay ? 1 : 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3,
          fs: 0,
          disablekb: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (this._disposed) return;
            this._playerReady = true;
            this._player?.setVolume?.(this._volume);
            this._duration = this._player?.getDuration?.() ?? 0;
            this._reportDuration();
            resolve();
            if (autoPlay) {
              this._player?.playVideo?.();
            }
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            if (this._disposed) return;
            const state = event.data;

            if (state === YT.PlayerState.PLAYING) {
              this._duration =
                this._player?.getDuration?.() ?? this._duration;
              this._reportDuration();
              this._startPolling();
              this._emitter.trigger("playing");
              this._resolvePendingLoad();
            } else if (state === YT.PlayerState.PAUSED) {
              this._stopPolling();
              this._emitter.trigger("timeupdate");
            } else if (state === YT.PlayerState.ENDED) {
              this._stopPolling();
              this._emitter.trigger("ended");
            } else if (state === YT.PlayerState.BUFFERING) {
              this._emitter.trigger("waiting");
            } else if (state === YT.PlayerState.CUED) {
              this._duration =
                this._player?.getDuration?.() ?? this._duration;
              this._reportDuration();
              this._emitter.trigger("stopWaiting");
              this._resolvePendingLoad();
            }
          },
          onError: () => {
            if (this._disposed) return;
            this._emitter.trigger("ended");
            resolve();
          },
        },
      });
    });
  }

  setEqBand(_band: Band, _value: number) {
    // No Web-Audio graph
  }

  disableEq() {}

  enableEq() {}

  getAnalyser(): AnalyserNode {
    if (!this._analyserCtx) {
      this._analyserCtx = new AudioContext();
      this._analyser = this._analyserCtx.createAnalyser();
      this._analyser.fftSize = 2048;
      const osc = this._analyserCtx.createOscillator();
      const gain = this._analyserCtx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this._analyser);
      osc.start();
    }
    return this._analyser!;
  }

  dispose() {
    this._disposed = true;
    this._stopPolling();
    if (this._player) {
      try {
        this._player.destroy();
      } catch {
        // ignore
      }
      this._player = null;
    }
    if (this._analyserCtx) {
      this._analyserCtx.close().catch(() => {});
      this._analyserCtx = null;
      this._analyser = null;
    }
    this._container.remove();
    this._emitter.dispose();
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private _resolvePendingLoad() {
    if (this._pendingLoadResolve) {
      this._duration = this._player?.getDuration?.() ?? this._duration;
      this._reportDuration();
      const resolve = this._pendingLoadResolve;
      this._pendingLoadResolve = null;
      resolve();
    }
  }

  /**
   * Emit "fileLoaded" when the YouTube duration first becomes available
   * (or changes). Webamp's middleware listens for "fileLoaded" to sync
   * the track duration into the Redux store, enabling seek-by-time,
   * keyboard arrow seeking, and the position slider.
   */
  private _reportDuration() {
    if (this._duration > 0 && this._duration !== this._lastReportedDuration) {
      this._lastReportedDuration = this._duration;
      this._emitter.trigger("fileLoaded");
    }
  }

  private _startPolling() {
    this._stopPolling();
    this._pollId = setInterval(() => {
      if (this._player?.getCurrentTime) {
        this._timeElapsed = this._player.getCurrentTime();
        this._emitter.trigger("timeupdate");
      }
    }, 100);
  }

  private _stopPolling() {
    if (this._pollId !== null) {
      clearInterval(this._pollId);
      this._pollId = null;
    }
  }
}
