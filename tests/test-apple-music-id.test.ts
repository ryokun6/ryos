import { describe, expect, test } from "bun:test";
import {
  appleMusicIdKindLabel,
  appleMusicPlayParamsFromId,
  generateAppleMusicWebUrlForId,
  isAppleMusicId,
  parseAppleMusicId,
} from "@/utils/appleMusicId";
import { resolveAppleMusicArtworkUrl } from "@/utils/coverArt";

describe("isAppleMusicId", () => {
  test("detects am: prefixed ids", () => {
    expect(isAppleMusicId("am:1616228595")).toBe(true);
    expect(isAppleMusicId("am:i.uUZAkT3")).toBe(true);
  });

  test("rejects YouTube ids and empty values", () => {
    expect(isAppleMusicId("dQw4w9WgXcQ")).toBe(false);
    expect(isAppleMusicId("")).toBe(false);
    expect(isAppleMusicId(undefined)).toBe(false);
    expect(isAppleMusicId(null)).toBe(false);
  });
});

describe("parseAppleMusicId", () => {
  test("parses catalog songs", () => {
    expect(parseAppleMusicId("am:1616228595")).toEqual({
      kind: "song",
      rawId: "1616228595",
    });
  });

  test("parses library songs", () => {
    expect(parseAppleMusicId("am:i.uUZAkT3")).toEqual({
      kind: "library",
      rawId: "i.uUZAkT3",
    });
  });

  test("parses stations and playlists", () => {
    expect(parseAppleMusicId("am:station:ra.todays-hits")).toEqual({
      kind: "station",
      rawId: "ra.todays-hits",
    });
    expect(parseAppleMusicId("am:playlist:pl.favorites-mix")).toEqual({
      kind: "playlist",
      rawId: "pl.favorites-mix",
    });
  });

  test("returns null for non Apple Music ids", () => {
    expect(parseAppleMusicId("dQw4w9WgXcQ")).toBeNull();
  });
});

describe("appleMusicIdKindLabel", () => {
  test("returns human readable labels", () => {
    expect(appleMusicIdKindLabel("song")).toBe("Catalog song");
    expect(appleMusicIdKindLabel("library")).toBe("Library song");
    expect(appleMusicIdKindLabel("station")).toBe("Station");
    expect(appleMusicIdKindLabel("playlist")).toBe("Playlist");
  });
});

describe("generateAppleMusicWebUrlForId", () => {
  test("links catalog songs directly to the song page", () => {
    expect(
      generateAppleMusicWebUrlForId({ id: "am:1616228595", storefrontId: "us" })
    ).toBe("https://music.apple.com/us/song/1616228595");
  });

  test("defaults storefront to us", () => {
    expect(generateAppleMusicWebUrlForId({ id: "am:1616228595" })).toBe(
      "https://music.apple.com/us/song/1616228595"
    );
  });

  test("uses the provided storefront", () => {
    expect(
      generateAppleMusicWebUrlForId({ id: "am:1616228595", storefrontId: "JP" })
    ).toBe("https://music.apple.com/jp/song/1616228595");
  });

  test("falls back to search for library songs", () => {
    expect(
      generateAppleMusicWebUrlForId({
        id: "am:i.uUZAkT3",
        title: "Bohemian Rhapsody",
        artist: "Queen",
        storefrontId: "us",
      })
    ).toBe(
      "https://music.apple.com/us/search?term=Bohemian%20Rhapsody%20Queen"
    );
  });

  test("links stations and playlists to their pages", () => {
    expect(
      generateAppleMusicWebUrlForId({
        id: "am:station:ra.todays-hits",
        storefrontId: "us",
      })
    ).toBe("https://music.apple.com/us/station/_/ra.todays-hits");
    expect(
      generateAppleMusicWebUrlForId({
        id: "am:playlist:pl.favorites-mix",
        storefrontId: "us",
      })
    ).toBe("https://music.apple.com/us/playlist/_/pl.favorites-mix");
  });
});

describe("appleMusicPlayParamsFromId", () => {
  test("derives catalog song play params", () => {
    expect(appleMusicPlayParamsFromId("am:1616228595")).toEqual({
      catalogId: "1616228595",
      kind: "songs",
    });
  });

  test("derives library song play params", () => {
    expect(appleMusicPlayParamsFromId("am:i.uUZAkT3")).toEqual({
      libraryId: "i.uUZAkT3",
      kind: "library-songs",
    });
  });

  test("derives station and playlist play params", () => {
    expect(appleMusicPlayParamsFromId("am:station:ra.todays-hits")).toEqual({
      stationId: "ra.todays-hits",
      kind: "stations",
    });
    expect(appleMusicPlayParamsFromId("am:playlist:pl.favorites-mix")).toEqual({
      playlistId: "pl.favorites-mix",
      kind: "playlists",
    });
  });

  test("returns null for non Apple Music ids", () => {
    expect(appleMusicPlayParamsFromId("dQw4w9WgXcQ")).toBeNull();
  });
});

describe("resolveAppleMusicArtworkUrl", () => {
  test("resolves the {w}/{h} template", () => {
    expect(
      resolveAppleMusicArtworkUrl(
        "https://example.com/art/{w}x{h}bb.jpg",
        300
      )
    ).toBe("https://example.com/art/300x300bb.jpg");
  });

  test("upgrades http to https", () => {
    expect(
      resolveAppleMusicArtworkUrl("http://example.com/art/600x600bb.jpg")
    ).toBe("https://example.com/art/600x600bb.jpg");
  });

  test("returns null when no cover provided", () => {
    expect(resolveAppleMusicArtworkUrl(undefined)).toBeNull();
  });
});
