// Minimal MusicKit JS v3 type declarations for the iPod app's Apple Music
// integration. Apple does not ship official `@types/musickit-js@v3` types
// (the published package targets v1), so we declare just the surface that
// `useMusicKit`, the playback bridge, and the library loader rely on.
//
// Sources:
//   - https://js-cdn.music.apple.com/musickit/v3/docs/
//   - https://developer.apple.com/forums/thread/704565 (setQueue / playParams)
//   - https://developer.apple.com/forums/thread/775085 (playbackState enum)

export {};

declare global {
  namespace MusicKit {
    /** Apple Music playback state codes from the v3 docs. */
    enum PlaybackStates {
      none = 0,
      loading = 1,
      playing = 2,
      paused = 3,
      stopped = 4,
      ended = 5,
      seeking = 6,
      waiting = 8,
      stalled = 9,
      completed = 10,
    }

    interface AppMetadata {
      name: string;
      build: string;
      icon?: string;
    }

    interface ConfigureOptions {
      developerToken: string;
      app: AppMetadata;
      bitrate?: number;
      storefrontId?: string;
      /** Provided automatically by the JS once a user authorizes. */
      musicUserToken?: string;
    }

    interface SetQueueOptions {
      song?: string;
      songs?: string[];
      album?: string;
      playlist?: string;
      url?: string;
      startWith?: number;
      startTime?: number;
      /** v3-preferred replacement for the deprecated `autoplay`. */
      startPlaying?: boolean;
    }

    interface MediaItemArtwork {
      url?: string;
      width?: number;
      height?: number;
    }

    interface MediaItemAttributes {
      name?: string;
      artistName?: string;
      albumName?: string;
      durationInMillis?: number;
      artwork?: MediaItemArtwork;
      playParams?: PlayParameters;
      genreNames?: string[];
      hasLyrics?: boolean;
    }

    interface PlayParameters {
      id: string;
      kind: string;
      isLibrary?: boolean;
      catalogId?: string;
      reporting?: boolean;
    }

    interface MediaItem {
      id?: string;
      type?: string;
      attributes?: MediaItemAttributes;
      playbackDuration?: number;
      title?: string;
      artistName?: string;
      albumName?: string;
      artworkURL?: string;
    }

    /** v3 events emitted by `MusicKit.MusicKitInstance`. */
    interface PlaybackStateDidChangeEvent {
      state: PlaybackStates | number;
      oldState?: PlaybackStates | number;
      item?: MediaItem;
    }

    interface PlaybackTimeDidChangeEvent {
      currentPlaybackTime?: number;
      currentPlaybackDuration?: number;
      currentPlaybackTimeRemaining?: number;
      isPlaying?: boolean;
    }

    interface MediaItemDidChangeEvent {
      item?: MediaItem;
      oldItem?: MediaItem;
    }

    /** Map of MusicKit event names to their event payload types. */
    interface MusicKitEventMap {
      playbackStateDidChange: PlaybackStateDidChangeEvent;
      playbackTimeDidChange: PlaybackTimeDidChangeEvent;
      mediaItemDidChange: MediaItemDidChangeEvent;
      nowPlayingItemDidChange: MediaItemDidChangeEvent;
      authorizationStatusDidChange: { authorizationStatus?: number };
      userTokenDidChange: { token?: string };
    }

    interface MusicAPI {
      music: <T = unknown>(
        path: string,
        params?: Record<string, string | number | boolean>,
        options?: { fetchOptions?: RequestInit }
      ) => Promise<{ data: T }>;
    }

    interface MusicKitInstance {
      readonly api: MusicAPI;
      readonly developerToken: string;
      readonly isAuthorized: boolean;
      readonly musicUserToken: string;
      readonly playbackState: PlaybackStates;
      readonly storefrontId: string;
      readonly currentPlaybackTime: number;
      readonly currentPlaybackDuration: number;
      readonly volume: number;

      addEventListener<K extends keyof MusicKitEventMap>(
        name: K,
        cb: (event: MusicKitEventMap[K]) => void
      ): void;
      addEventListener(name: string, cb: (event: unknown) => void): void;
      removeEventListener<K extends keyof MusicKitEventMap>(
        name: K,
        cb?: (event: MusicKitEventMap[K]) => void
      ): void;
      removeEventListener(name: string, cb?: (event: unknown) => void): void;

      authorize(): Promise<string>;
      unauthorize(): Promise<void>;

      setQueue(options: SetQueueOptions): Promise<unknown>;
      play(): Promise<void>;
      pause(): void;
      stop(): void;
      seekToTime(time: number): Promise<void>;
      changeToMediaAtIndex(index: number): Promise<void>;
      skipToNextItem(): Promise<void>;
      skipToPreviousItem(): Promise<void>;

      // Volume control (read-only on the type but settable in practice — we
      // assign through the bridge to honour the iPod volume slider).
    }

    function configure(
      options: ConfigureOptions
    ): Promise<MusicKitInstance> | MusicKitInstance;
    function getInstance(): MusicKitInstance | undefined;
  }

  interface DocumentEventMap {
    musickitloaded: Event;
  }

  interface Window {
    MusicKit?: typeof MusicKit & {
      configure: typeof MusicKit.configure;
      getInstance: typeof MusicKit.getInstance;
    };
  }
}
