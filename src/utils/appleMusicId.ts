import { generateAppleMusicSongShareUrl } from "./sharedUrl";

/**
 * Apple Music songs are namespaced in the shared song cache with an `am:`
 * prefix (see `api/songs/_constants.ts`). These helpers parse those ids so the
 * admin UI can render Apple Music URLs, cover art and metadata instead of the
 * YouTube-centric defaults used for plain video ids.
 */

export const APPLE_MUSIC_ID_PREFIX = "am:";

export function isAppleMusicId(id: string | undefined | null): id is string {
  return typeof id === "string" && id.startsWith(APPLE_MUSIC_ID_PREFIX);
}

export type AppleMusicIdKind = "song" | "library" | "station" | "playlist";

export interface ParsedAppleMusicId {
  kind: AppleMusicIdKind;
  /** Id without the `am:` prefix (and without the sub-namespace, if any). */
  rawId: string;
}

export function parseAppleMusicId(
  id: string | undefined | null
): ParsedAppleMusicId | null {
  if (!isAppleMusicId(id)) return null;
  const body = id.slice(APPLE_MUSIC_ID_PREFIX.length);
  if (body.startsWith("station:")) {
    return { kind: "station", rawId: body.slice("station:".length) };
  }
  if (body.startsWith("playlist:")) {
    return { kind: "playlist", rawId: body.slice("playlist:".length) };
  }
  // Library songs use an `i.` prefixed id (e.g. `i.uUZAkT3`); catalog songs are
  // numeric (e.g. `1616228595`).
  if (body.startsWith("i.")) {
    return { kind: "library", rawId: body };
  }
  return { kind: "song", rawId: body };
}

const APPLE_MUSIC_KIND_LABELS: Record<AppleMusicIdKind, string> = {
  song: "Catalog song",
  library: "Library song",
  station: "Station",
  playlist: "Playlist",
};

export function appleMusicIdKindLabel(kind: AppleMusicIdKind): string {
  return APPLE_MUSIC_KIND_LABELS[kind];
}

function normalizeStorefront(storefrontId: string | null | undefined): string {
  return storefrontId?.trim().toLowerCase() || "us";
}

/**
 * Build the best public `music.apple.com` URL we can for a given Apple Music
 * song id. Catalog songs link straight to the song page; library songs (which
 * have no public page) fall back to an Apple Music search; stations and
 * playlists link to their respective pages.
 */
export function generateAppleMusicWebUrlForId(opts: {
  id: string;
  title?: string;
  artist?: string;
  storefrontId?: string | null;
}): string {
  const parsed = parseAppleMusicId(opts.id);
  const storefront = normalizeStorefront(opts.storefrontId);

  if (parsed?.kind === "station") {
    return `https://music.apple.com/${storefront}/station/_/${encodeURIComponent(
      parsed.rawId
    )}`;
  }
  if (parsed?.kind === "playlist") {
    return `https://music.apple.com/${storefront}/playlist/_/${encodeURIComponent(
      parsed.rawId
    )}`;
  }

  // Catalog + library songs: reuse the share-url logic, which links catalog
  // songs directly and searches for library songs by title/artist.
  return generateAppleMusicSongShareUrl(
    { id: opts.id, title: opts.title, artist: opts.artist },
    opts.storefrontId
  );
}
