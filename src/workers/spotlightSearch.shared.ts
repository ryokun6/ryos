export const MAX_DYNAMIC_RESULTS_PER_TYPE = 4;

export type SpotlightDynamicResultType =
  | "document"
  | "applet"
  | "music"
  | "site"
  | "video";

export interface SpotlightSearchFileSnapshot {
  path: string;
  name: string;
  isDirectory: boolean;
  status: "active" | "trashed";
  icon?: string;
}

export interface SpotlightSearchTrackSnapshot {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  cover?: string;
}

export interface SpotlightSearchFavoriteSnapshot {
  title: string;
  url?: string;
  favicon?: string;
  year?: string;
  children?: SpotlightSearchFavoriteSnapshot[];
  isDirectory?: boolean;
}

export interface SpotlightSearchVideoSnapshot {
  id: string;
  title: string;
  artist?: string;
}

export interface SpotlightSearchSnapshot {
  items: Record<string, SpotlightSearchFileSnapshot>;
  tracks: SpotlightSearchTrackSnapshot[];
  favorites: SpotlightSearchFavoriteSnapshot[];
  videos: SpotlightSearchVideoSnapshot[];
}

export type SpotlightWorkerResultPayload =
  | {
      id: string;
      type: "document";
      title: string;
      path: string;
    }
  | {
      id: string;
      type: "applet";
      title: string;
      path: string;
      icon?: string;
      isEmoji: boolean;
    }
  | {
      id: string;
      type: "music";
      title: string;
      subtitle?: string;
      thumbnail: string;
      videoId: string;
    }
  | {
      id: string;
      type: "site";
      title: string;
      subtitle?: string;
      thumbnail?: string;
      url: string;
      year?: string;
    }
  | {
      id: string;
      type: "video";
      title: string;
      subtitle?: string;
      thumbnail: string;
      videoId: string;
    };

export interface SpotlightIndexMessage {
  type: "index";
  snapshot: SpotlightSearchSnapshot;
}

export interface SpotlightQueryMessage {
  type: "query";
  query: string;
  requestId: number;
}

export type SpotlightWorkerMessage =
  | SpotlightIndexMessage
  | SpotlightQueryMessage;

export interface SpotlightQueryResultMessage {
  type: "query-result";
  requestId: number;
  results: SpotlightWorkerResultPayload[];
}

export type SpotlightWorkerResponse = SpotlightQueryResultMessage;
