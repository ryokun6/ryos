import { describe, expect, test } from "bun:test";
import {
  buildMusicArtistFolder,
  buildMusicArtistRoot,
  buildVideosArtistFolder,
  buildVideosArtistRoot,
  filterItemsForArtistFolder,
  listVirtualMusicOrVideosPath,
  parseArtistFolderSegment,
} from "../../../src/services/vfs/virtualTrees";

const tracks = [
  {
    id: "song-1",
    title: "Song One",
    artist: "AC/DC",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    cover: "http://imge.kugou.com/stdmusic/{size}/cover.jpg",
  },
  {
    id: "song-2",
    title: "Unknown Song",
    url: "https://www.youtube.com/watch?v=9bZkp7q19f0",
  },
];

const videos = [
  {
    id: "video-1",
    title: "Video One",
    artist: "Pixar",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  },
  {
    id: "video-2",
    title: "Unknown Video",
    url: "https://www.youtube.com/watch?v=9bZkp7q19f0",
  },
];

describe("virtual media trees", () => {
  test("builds artist root folders with encoded artist paths and unknown folder", () => {
    expect(buildMusicArtistRoot(tracks).map((item) => item.path)).toEqual([
      "/Music/AC%2FDC",
      "/Music/Unknown Artist",
    ]);
    expect(buildVideosArtistRoot(videos).map((item) => item.path)).toEqual([
      "/Videos/Pixar",
      "/Videos/Unknown Artist",
    ]);
  });

  test("parses and filters artist folder segments", () => {
    expect(parseArtistFolderSegment("/Music", "/Music/AC%2FDC")).toBe("AC/DC");
    expect(filterItemsForArtistFolder(tracks, "Unknown Artist")).toHaveLength(1);
    expect(filterItemsForArtistFolder(tracks, "AC/DC")).toHaveLength(1);
  });

  test("builds music and video leaves with stable file shapes", () => {
    expect(buildMusicArtistFolder(tracks, "/Music/AC%2FDC")).toEqual([
      expect.objectContaining({
        name: "Song One.mp3",
        path: "/Music/song-1",
        appId: "ipod",
        type: "Music",
        data: { songId: "song-1" },
        contentUrl: "https://imge.kugou.com/stdmusic/100/cover.jpg",
      }),
    ]);

    expect(buildVideosArtistFolder(videos, "/Videos/Pixar")).toEqual([
      expect.objectContaining({
        name: "Video One.mov",
        path: "/Videos/video-1",
        appId: "videos",
        type: "Video",
        data: { videoId: "video-1" },
      }),
    ]);
  });

  test("routes only virtual media paths", () => {
    expect(listVirtualMusicOrVideosPath("/Music", tracks, videos)?.kind).toBe("root");
    expect(listVirtualMusicOrVideosPath("/Music/AC%2FDC", tracks, videos)?.kind).toBe("artist");
    expect(listVirtualMusicOrVideosPath("/Documents", tracks, videos)).toBeNull();
  });
});
