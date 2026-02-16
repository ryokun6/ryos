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

  // Already loaded (e.g. by react-player)
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
    // YouTube API doesn't support stereo balance – no-op
  }

  setPreamp(_value: number) {
    // No Web-Audio graph to apply preamp to – no-op
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
    }
  }

  async loadFromUrl(url: string, autoPlay: boolean): Promise<void> {
    const videoId = extractVideoId(url);

    if (!videoId) {
      // Not a YouTube URL – emit loaded with zero duration
      this._duration = 0;
      this._timeElapsed = 0;
      this._emitter.trigger("loaded");
      return;
    }

    await ensureYTApi();
    if (this._disposed) return;

    return new Promise<void>((resolve) => {
      // Destroy previous player if exists
      if (this._player) {
        this._stopPolling();
        this._player.destroy();
        this._player = null;
        // Re-create container div since destroy removes it
        const newContainer = document.createElement("div");
        newContainer.id = this._container.id;
        newContainer.style.cssText = this._container.style.cssText;
        this._container.parentNode?.replaceChild(newContainer, this._container);
        this._container = newContainer;
      }

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
            this._player?.setVolume?.(this._volume);
            this._duration = this._player?.getDuration?.() ?? 0;
            this._emitter.trigger("loaded");
            resolve();
            if (autoPlay) {
              this._player?.playVideo?.();
            }
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            if (this._disposed) return;
            const state = event.data;

            if (state === YT.PlayerState.PLAYING) {
              this._duration = this._player?.getDuration?.() ?? this._duration;
              this._startPolling();
              this._emitter.trigger("playing");
            } else if (state === YT.PlayerState.PAUSED) {
              this._stopPolling();
              this._emitter.trigger("timeupdate");
            } else if (state === YT.PlayerState.ENDED) {
              this._stopPolling();
              this._emitter.trigger("ended");
            } else if (state === YT.PlayerState.BUFFERING) {
              this._emitter.trigger("waiting");
            } else if (state === YT.PlayerState.CUED) {
              this._emitter.trigger("stopWaiting");
            }
          },
          onError: () => {
            if (this._disposed) return;
            resolve();
          },
        },
      });
    });
  }

  setEqBand(_band: Band, _value: number) {
    // No Web-Audio graph – no-op
  }

  disableEq() {
    // no-op
  }

  enableEq() {
    // no-op
  }

  getAnalyser(): AnalyserNode {
    // Return a silent analyser so Webamp's visualizer doesn't crash
    if (!this._analyserCtx) {
      this._analyserCtx = new AudioContext();
      this._analyser = this._analyserCtx.createAnalyser();
      this._analyser.fftSize = 2048;
      // Connect a silent source so getByteFrequencyData returns zeroes
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
        // ignore destroy errors
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
