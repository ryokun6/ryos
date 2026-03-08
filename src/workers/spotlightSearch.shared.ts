export const MAX_DYNAMIC_RESULTS_PER_TYPE = 4;

export type SpotlightDynamicResultType =
  | "document"
  | "applet"
  | "music"
  | "site"
  | "video"
  | "calendar"
  | "contact";

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

export interface SpotlightSearchCalendarEventSnapshot {
  id: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export interface SpotlightSearchContactSnapshot {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  organization: string;
  emails: string[];
  phones: string[];
  picture: string | null;
}

export interface SpotlightSearchSnapshot {
  items: Record<string, SpotlightSearchFileSnapshot>;
  tracks: SpotlightSearchTrackSnapshot[];
  favorites: SpotlightSearchFavoriteSnapshot[];
  videos: SpotlightSearchVideoSnapshot[];
  calendarEvents: SpotlightSearchCalendarEventSnapshot[];
  contacts: SpotlightSearchContactSnapshot[];
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
    }
  | {
      id: string;
      type: "calendar";
      title: string;
      subtitle?: string;
      date: string;
    }
  | {
      id: string;
      type: "contact";
      title: string;
      subtitle?: string;
      contactId: string;
      picture: string | null;
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
