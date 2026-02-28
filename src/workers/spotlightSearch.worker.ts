import {
  MAX_DYNAMIC_RESULTS_PER_TYPE,
  type SpotlightSearchFavoriteSnapshot,
  type SpotlightSearchSnapshot,
  type SpotlightWorkerMessage,
  type SpotlightWorkerResponse,
  type SpotlightWorkerResultPayload,
} from "./spotlightSearch.shared";

type IndexedEntry = {
  searchText: string;
  result: SpotlightWorkerResultPayload;
};

type SpotlightIndex = {
  documents: IndexedEntry[];
  applets: IndexedEntry[];
  music: IndexedEntry[];
  sites: IndexedEntry[];
  videos: IndexedEntry[];
};

const emptyIndex = (): SpotlightIndex => ({
  documents: [],
  applets: [],
  music: [],
  sites: [],
  videos: [],
});

let currentIndex: SpotlightIndex = emptyIndex();

const normalizeText = (...fields: (string | undefined)[]): string =>
  fields
    .filter((field): field is string => typeof field === "string" && field.length > 0)
    .join("\n")
    .toLowerCase();

const flattenFavorites = (
  favorites: SpotlightSearchFavoriteSnapshot[]
): SpotlightSearchFavoriteSnapshot[] => {
  const result: SpotlightSearchFavoriteSnapshot[] = [];

  for (const favorite of favorites) {
    if (favorite.isDirectory && favorite.children) {
      result.push(...flattenFavorites(favorite.children));
      continue;
    }

    if (favorite.url) {
      result.push(favorite);
    }
  }

  return result;
};

const getHostname = (url: string): string | undefined => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const buildIndex = (snapshot: SpotlightSearchSnapshot): SpotlightIndex => {
  const items = Object.values(snapshot.items);

  const documents = items
    .filter(
      (item) =>
        item.status === "active" &&
        !item.isDirectory &&
        item.path.startsWith("/Documents/")
    )
    .map<IndexedEntry>((item) => ({
      searchText: normalizeText(item.name, item.path),
      result: {
        id: `doc-${item.path}`,
        type: "document",
        title: item.name,
        path: item.path,
      },
    }));

  const applets = items
    .filter(
      (item) =>
        item.status === "active" &&
        !item.isDirectory &&
        item.path.startsWith("/Applets/")
    )
    .map<IndexedEntry>((item) => {
      const rawIcon = item.icon;
      const isEmoji =
        !!rawIcon &&
        !rawIcon.startsWith("/") &&
        !rawIcon.startsWith("http") &&
        rawIcon.length <= 10;

      return {
        searchText: normalizeText(item.name, item.path),
        result: {
          id: `applet-${item.path}`,
          type: "applet",
          title: item.name.replace(/\.(html|app)$/i, ""),
          path: item.path,
          icon: rawIcon,
          isEmoji,
        },
      };
    });

  const music = snapshot.tracks.map<IndexedEntry>((track) => {
    const thumbnail = track.cover
      ? track.cover.replace("{size}", "100").replace(/^http:\/\//, "https://")
      : `https://i.ytimg.com/vi/${track.id}/default.jpg`;

    return {
      searchText: normalizeText(track.title, track.artist, track.album),
      result: {
        id: `music-${track.id}`,
        type: "music",
        title: track.title,
        subtitle: track.artist,
        thumbnail,
        videoId: track.id,
      },
    };
  });

  const sites = flattenFavorites(snapshot.favorites).map<IndexedEntry>((favorite) => {
    const hostname = favorite.url ? getHostname(favorite.url) : undefined;

    return {
      searchText: normalizeText(favorite.title, favorite.url, hostname),
      result: {
        id: `site-${favorite.url}`,
        type: "site",
        title: favorite.title,
        subtitle: hostname,
        thumbnail: favorite.favicon || undefined,
        url: favorite.url!,
        year: favorite.year,
      },
    };
  });

  const videos = snapshot.videos.map<IndexedEntry>((video) => ({
    searchText: normalizeText(video.title, video.artist),
    result: {
      id: `video-${video.id}`,
      type: "video",
      title: video.title,
      subtitle: video.artist,
      thumbnail: `https://i.ytimg.com/vi/${video.id}/default.jpg`,
      videoId: video.id,
    },
  }));

  return {
    documents,
    applets,
    music,
    sites,
    videos,
  };
};

const queryIndex = (query: string): SpotlightWorkerResultPayload[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const collectMatches = (entries: IndexedEntry[]): SpotlightWorkerResultPayload[] =>
    entries
      .filter((entry) => entry.searchText.includes(normalizedQuery))
      .slice(0, MAX_DYNAMIC_RESULTS_PER_TYPE)
      .map((entry) => entry.result);

  return [
    ...collectMatches(currentIndex.documents),
    ...collectMatches(currentIndex.applets),
    ...collectMatches(currentIndex.music),
    ...collectMatches(currentIndex.sites),
    ...collectMatches(currentIndex.videos),
  ];
};

self.onmessage = (event: MessageEvent<SpotlightWorkerMessage>) => {
  const message = event.data;

  if (message.type === "index") {
    currentIndex = buildIndex(message.snapshot);
    return;
  }

  if (message.type === "query") {
    const response: SpotlightWorkerResponse = {
      type: "query-result",
      requestId: message.requestId,
      results: queryIndex(message.query),
    };

    self.postMessage(response);
  }
};
