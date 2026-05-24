import {
  searchAppleMusicTracks as defaultSearchAppleMusicTracks,
  type AppleMusicSearchScope,
} from "@/apps/ipod/hooks/useAppleMusicLibrary";
import {
  getActiveIpodTracks,
  useIpodStore,
  type Track,
} from "@/stores/useIpodStore";

export type SearchAppleMusicTracksFn = (
  query: string,
  scope: AppleMusicSearchScope
) => Promise<Track[]>;

export interface IpodTrackIdentifiers {
  id?: string;
  title?: string;
  artist?: string;
}

export interface IpodMusicListEntry {
  path: string;
  id: string;
  title: string;
  artist?: string;
  album?: string;
  source?: string;
}

export interface IpodMusicListResult {
  entries: IpodMusicListEntry[];
  totalMatches: number;
  libraryName: "Apple Music" | "iPod";
}

const stripDiacritics = (value: string): string =>
  value.normalize("NFKD").replace(/\p{Diacritic}/gu, "");

const normalizeSearchText = (value: string): string =>
  stripDiacritics(value).toLowerCase();

const ciIncludes = (value: string | undefined, query: string): boolean =>
  normalizeSearchText(value ?? "").includes(normalizeSearchText(query));

const isLooseSubsequence = (target: string, pattern: string): boolean => {
  if (pattern.length === 0) return true;

  let searchStart = 0;
  for (const char of pattern) {
    const foundIndex = target.indexOf(char, searchStart);
    if (foundIndex === -1) return false;
    searchStart = foundIndex + 1;
  }
  return true;
};

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = new Array<number>(a.length + 1);
  const current = new Array<number>(a.length + 1);

  for (let i = 0; i <= a.length; i += 1) previous[i] = i;

  for (let i = 1; i <= b.length; i += 1) {
    current[0] = i;
    const bChar = b[i - 1]!;

    for (let j = 1; j <= a.length; j += 1) {
      const substitutionCost = bChar === a[j - 1]! ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + substitutionCost
      );
    }

    for (let j = 0; j <= a.length; j += 1) previous[j] = current[j]!;
  }

  return previous[a.length]!;
};

const bestSubstringDistance = (text: string, query: string): number => {
  if (query.length === 0) return 0;
  if (text.length === 0) return query.length;
  if (query.length >= text.length) return levenshteinDistance(text, query);

  let best = Number.MAX_SAFE_INTEGER;
  const maxOffset = text.length - query.length;
  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const distance = levenshteinDistance(
      text.slice(offset, offset + query.length),
      query
    );
    if (distance < best) {
      best = distance;
      if (best === 0) break;
    }
  }
  return best;
};

const computeMatchScore = (
  text: string,
  query: string,
  tokens: string[]
): number => {
  if (!query) return 1;
  if (!text) return 0;

  let score = 0;
  const includeIndex = text.indexOf(query);
  if (includeIndex !== -1) {
    score = Math.max(
      score,
      Math.min(
        1,
        0.7 + (1 - includeIndex / Math.max(text.length, query.length)) * 0.3
      )
    );
  }

  if (isLooseSubsequence(text, query)) {
    score = Math.max(
      score,
      Math.min(
        1,
        0.5 + Math.min(0.4, (query.length / Math.max(text.length, query.length)) * 0.4)
      )
    );
  }

  const maxLen = Math.max(query.length, Math.min(text.length, query.length));
  if (maxLen > 0) {
    score = Math.max(score, Math.max(0, 1 - bestSubstringDistance(text, query) / (maxLen + 1)));
  }

  if (tokens.length > 1) {
    let tokenAccumulator = 0;
    for (const token of tokens) {
      if (!token) continue;
      const tokenIndex = text.indexOf(token);
      if (tokenIndex !== -1) {
        tokenAccumulator += 1;
        continue;
      }
      const tokenMaxLen = Math.max(token.length, Math.min(text.length, token.length));
      if (tokenMaxLen === 0) continue;
      const tokenScore = 1 - bestSubstringDistance(text, token) / (tokenMaxLen + 1);
      if (tokenScore > 0.5) tokenAccumulator += tokenScore;
    }
    if (tokenAccumulator > 0) {
      score = Math.max(score, Math.min(1, tokenAccumulator / tokens.length));
    }
  }

  return Math.max(0, Math.min(1, score));
};

const deriveScoreThreshold = (queryLength: number): number => {
  if (queryLength <= 2) return 0.65;
  if (queryLength <= 4) return 0.55;
  if (queryLength <= 6) return 0.5;
  if (queryLength <= 8) return 0.45;
  return 0.4;
};

function scoreTracks(tracks: Track[], query: string): { track: Track; score: number }[] {
  const normalizedQuery = query ? normalizeSearchText(query.trim()) : "";
  const tokens = normalizedQuery ? normalizedQuery.split(/\s+/).filter(Boolean) : [];
  const hasQuery = normalizedQuery.length > 0;
  const threshold = hasQuery ? deriveScoreThreshold(normalizedQuery.length) : 0;

  return tracks
    .map((track) => {
      const fields = [
        track.id,
        track.title,
        track.artist ?? "",
        track.album ?? "",
      ].map(normalizeSearchText);
      const score = hasQuery
        ? fields.reduce(
            (best, field) =>
              Math.max(best, computeMatchScore(field, normalizedQuery, tokens)),
            0
          )
        : 1;
      return { track, score };
    })
    .filter(({ score }) => score >= threshold)
    .sort((a, b) => (hasQuery ? b.score - a.score : 0));
}

function cacheAppleMusicTracks(tracks: Track[]): void {
  if (tracks.length === 0) return;
  const state = useIpodStore.getState();
  if (state.librarySource !== "appleMusic") return;

  const merged = new Map(state.appleMusicTracks.map((track) => [track.id, track]));
  for (const track of tracks) {
    merged.set(track.id, {
      ...merged.get(track.id),
      ...track,
      source: "appleMusic",
    });
  }
  state.setAppleMusicTracks(Array.from(merged.values()));
}

export function findIpodTrackMatches(
  tracks: Track[],
  identifiers: IpodTrackIdentifiers
): Track[] {
  const { id, title, artist } = identifiers;
  const idFilteredTracks = id
    ? tracks.filter((track) => track.id === id)
    : tracks;

  const primaryCandidates = idFilteredTracks.filter((track) => {
    const titleMatches = title ? ciIncludes(track.title, title) : true;
    const artistMatches = artist ? ciIncludes(track.artist, artist) : true;
    return titleMatches && artistMatches;
  });

  if (primaryCandidates.length > 0) return primaryCandidates;
  if (!title && !artist) return [];

  return idFilteredTracks.filter((track) => {
    const titleInArtistMatches = title ? ciIncludes(track.artist, title) : false;
    const artistInTitleMatches = artist ? ciIncludes(track.title, artist) : false;
    if (title && artist) return titleInArtistMatches || artistInTitleMatches;
    if (title) return titleInArtistMatches;
    if (artist) return artistInTitleMatches;
    return false;
  });
}

export function createAppleMusicLookupQuery(
  identifiers: IpodTrackIdentifiers
): string {
  const title = identifiers.title?.trim();
  const artist = identifiers.artist?.trim();
  const titleArtistQuery = [title, artist].filter(Boolean).join(" ").trim();
  if (titleArtistQuery) return titleArtistQuery;
  return identifiers.id?.replace(/^am:/, "").trim() ?? "";
}

export async function searchAndCacheAppleMusicTracks(
  query: string,
  searchAppleMusicTracks: SearchAppleMusicTracksFn = defaultSearchAppleMusicTracks
): Promise<Track[]> {
  const term = query.trim();
  if (!term || useIpodStore.getState().librarySource !== "appleMusic") {
    return [];
  }

  try {
    const tracks = await searchAppleMusicTracks(term, "library");
    cacheAppleMusicTracks(tracks);
    return tracks;
  } catch (err) {
    console.warn("[ipod tools] Apple Music lookup failed", err);
    return [];
  }
}

export async function listActiveIpodMusicLibrary({
  query,
  limit,
  searchAppleMusicTracks,
}: {
  query?: string;
  limit?: number;
  searchAppleMusicTracks?: SearchAppleMusicTracksFn;
}): Promise<IpodMusicListResult> {
  const trimmedQuery = query?.trim() ?? "";
  const maxResults = limit ? Math.min(Math.max(limit, 1), 50) : 25;
  let ipodStore = useIpodStore.getState();
  let matchingTracks = scoreTracks(getActiveIpodTracks(ipodStore), trimmedQuery);

  if (
    ipodStore.librarySource === "appleMusic" &&
    trimmedQuery &&
    matchingTracks.length === 0
  ) {
    await searchAndCacheAppleMusicTracks(trimmedQuery, searchAppleMusicTracks);
    ipodStore = useIpodStore.getState();
    matchingTracks = scoreTracks(getActiveIpodTracks(ipodStore), trimmedQuery);
  }

  const entries = matchingTracks.slice(0, maxResults).map(({ track }) => ({
    path: `/Music/${track.id}`,
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    source: track.source ?? ipodStore.librarySource,
  }));

  return {
    entries,
    totalMatches: matchingTracks.length,
    libraryName: ipodStore.librarySource === "appleMusic" ? "Apple Music" : "iPod",
  };
}
