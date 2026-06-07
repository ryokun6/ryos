/**
 * Cloud sync snapshot wire types shared between client sync domains and API.
 */

export type DeletionMarkerMap = Record<string, string>;

/** IndexedDB-backed store item on the sync wire. */
export interface SyncStoreItemWire {
  key: string;
  value: Record<string, unknown>;
}

export interface SettingsSnapshotData {
  theme: string;
  themeDarkMode?: Record<string, "system" | "light" | "dark" | boolean>;
  themeAccent?: Record<string, string>;
  language: string;
  languageInitialized: boolean;
  aiModel: string | null;
  display: {
    displayMode: string;
    shaderEffectEnabled: boolean;
    selectedShaderType: string;
    currentWallpaper: string;
    screenSaverEnabled: boolean;
    screenSaverType: string;
    screenSaverIdleTime: number;
    debugMode: boolean;
    htmlPreviewSplit: boolean;
  };
  audio: {
    masterVolume: number;
    uiVolume: number;
    chatSynthVolume: number;
    speechVolume: number;
    ipodVolume: number;
    uiSoundsEnabled: boolean;
    terminalSoundsEnabled: boolean;
    typingSynthEnabled: boolean;
    speechEnabled: boolean;
    keepTalkingEnabled: boolean;
    ttsModel: "openai" | "elevenlabs" | null;
    ttsVoice: string | null;
    synthPreset: string;
  };
  ipod?: {
    displayMode: string;
    showLyrics: boolean;
    lyricsAlignment: string;
    lyricsFont: string;
    romanization: unknown;
    lyricsTranslationLanguage: string | null;
    theme: "classic" | "black" | "u2";
    lcdFilterOn: boolean;
  };
  dock?: {
    pinnedItems: unknown[];
    scale: number;
    hiding: boolean;
    magnification: boolean;
  };
  dashboard?: {
    widgets: unknown[];
  };
  customWallpapers?: SyncStoreItemWire[];
  sectionUpdatedAt?: Record<string, string>;
}

export interface SongsSnapshotWireTrack {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  appleMusicAlbumId?: string;
  cover?: string;
  coverColor?: string;
  lyricOffset?: number;
  lyricsSource?: unknown;
  createdAt?: number;
  importOrder?: number;
  updatedAt?: number;
  source?: string;
  durationMs?: number;
  appleMusicPlayParams?: unknown;
}

export interface SongsSnapshotData {
  tracks: SongsSnapshotWireTrack[];
  libraryState: "uninitialized" | "loaded" | "cleared";
  lastKnownVersion: number;
  deletedTrackIds?: DeletionMarkerMap;
}

export interface VideosSnapshotData {
  videos: Array<{
    id: string;
    url: string;
    title: string;
    artist?: string;
  }>;
}

export interface TvSnapshotWireChannel {
  id: string;
  name: string;
  description?: string;
  videos: Array<{
    id: string;
    url: string;
    title: string;
    artist?: string;
  }>;
  prompt?: string;
  queries?: string[];
  createdAt: number;
}

export interface TvSnapshotData {
  customChannels: TvSnapshotWireChannel[];
  hiddenDefaultChannelIds?: string[];
  hiddenDefaultChannelIdsUpdatedAt?: string | null;
  hiddenDefaultChannelIdsResetAt?: string | null;
  deletedCustomChannelIds?: DeletionMarkerMap;
  lcdFilterOn: boolean;
  closedCaptionsOn: boolean;
}

export interface StickiesSnapshotData {
  notes: Array<{
    id: string;
    content: string;
    color: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    createdAt: number;
    updatedAt: number;
  }>;
  deletedNoteIds?: DeletionMarkerMap;
}

export interface CalendarSnapshotData {
  events: Array<{
    id: string;
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    color: string;
    calendarId?: string;
    location?: string;
    notes?: string;
    createdAt: number;
    updatedAt: number;
  }>;
  calendars: Array<{
    id: string;
    name: string;
    color: string;
    visible: boolean;
  }>;
  todos: Array<{
    id: string;
    title: string;
    completed: boolean;
    dueDate: string | null;
    calendarId: string;
    createdAt: number;
  }>;
  deletedEventIds?: DeletionMarkerMap;
  deletedCalendarIds?: DeletionMarkerMap;
  deletedTodoIds?: DeletionMarkerMap;
}

export interface SyncWireContactValue {
  id: string;
  label: string;
  value: string;
}

export interface SyncWireContactAddress {
  id: string;
  label: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  formatted: string;
}

export interface SyncWireContact {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  nickname: string;
  organization: string;
  title: string;
  notes: string;
  emails: SyncWireContactValue[];
  phones: SyncWireContactValue[];
  addresses: SyncWireContactAddress[];
  urls: SyncWireContactValue[];
  birthday: string | null;
  telegramUsername: string;
  telegramUserId: string;
  picture: string | null;
  source: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContactsSnapshotData {
  contacts: SyncWireContact[];
  myContactId?: string | null;
  deletedContactIds?: DeletionMarkerMap;
}

export interface MapsSnapshotData {
  home: {
    id: string;
    name: string;
    subtitle?: string;
    latitude: number;
    longitude: number;
    category?: string;
    placeId?: string;
  } | null;
  work: {
    id: string;
    name: string;
    subtitle?: string;
    latitude: number;
    longitude: number;
    category?: string;
    placeId?: string;
  } | null;
  favorites: Array<{
    id: string;
    name: string;
    subtitle?: string;
    latitude: number;
    longitude: number;
    category?: string;
    placeId?: string;
  }>;
  updatedAt: number;
  deletedFavoriteIds?: DeletionMarkerMap;
}
