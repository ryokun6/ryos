import type { Track } from "@/shared/media/library";

export interface SongSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

export type AppleMusicSearchScope = "catalog" | "library";
export type SearchMode = "youtube" | "appleMusic";

export interface SongSearchDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (result: SongSearchResult) => void;
  onAddUrl?: (url: string) => Promise<void>;
  /** Listen-together: queue the selected YouTube result instead of playing it. */
  onQueueSelect?: (result: SongSearchResult) => void;
  onPlayNextSelect?: (result: SongSearchResult) => void;
  /** Listen-together: queue a pasted YouTube URL. */
  onQueueUrl?: (url: string) => Promise<void>;
  onPlayNextUrl?: (url: string) => Promise<void>;
  /**
   * Opened from the listen-together queue. Confirm adds to the queue and
   * closes this dialog. The queue drawer stays open.
   */
  queueOnly?: boolean;
  /** Draw above the karaoke fullscreen portal. */
  aboveFullscreen?: boolean;
  initialQuery?: string;
  mode?: SearchMode;
  appleMusicAuthorized?: boolean;
  onAppleMusicSearch?: (
    query: string,
    scope: AppleMusicSearchScope
  ) => Promise<Track[]>;
  onAppleMusicSelect?: (track: Track) => Promise<void> | void;
}

export type SongSearchState = {
  query: string;
  results: SongSearchResult[];
  appleMusicResults: Track[];
  activeAppleMusicTab: AppleMusicSearchScope;
  selectedIndex: number;
  isSearching: boolean;
  isAdding: boolean;
  error: string | null;
};

export type SongSearchAction =
  | { type: "resetOnOpen"; query: string }
  | { type: "setQuery"; query: string }
  | { type: "setActiveAppleMusicTab"; tab: AppleMusicSearchScope }
  | { type: "setSelectedIndex"; index: number }
  | { type: "searchStart" }
  | {
      type: "searchFinish";
      mode: "youtube" | "appleMusic";
      results: SongSearchResult[] | Track[];
      error: string | null;
    }
  | { type: "searchError"; error: string }
  | { type: "setAdding"; isAdding: boolean }
  | { type: "setError"; error: string | null };
