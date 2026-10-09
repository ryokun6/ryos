/**
 * Apple Music under AirPlay (`src/utils/musicKitAirPlay.ts`).
 *
 * MusicKit's `<audio id="apple-music-player">` must carry WebKit's
 * `x-webkit-wirelessvideoplaybackdisabled` attribute so iOS keeps decoding the
 * FairPlay stream locally instead of handing it to the AirPlay receiver. Each
 * test runs against its own happy-dom window, appending the element the way
 * MusicKit does (pooled, then added straight to `<body>`).
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import {
  LOCAL_PLAYBACK_ATTRIBUTE,
  MUSICKIT_PLAYER_ELEMENT_ID,
  keepMusicKitPlaybackLocal,
} from "../../../src/utils/musicKitAirPlay";

const windows: Window[] = [];

function freshDocument(): { win: Window; doc: Document } {
  const win = new Window({ url: "https://os.ryo.lu/" });
  windows.push(win);
  return { win, doc: win.document as unknown as Document };
}

function musicKitPlayer(doc: Document, tag: "audio" | "video" = "audio"): HTMLMediaElement {
  const element = doc.createElement(tag);
  element.load();
  element.id = MUSICKIT_PLAYER_ELEMENT_ID;
  return element;
}

afterEach(async () => {
  for (const win of windows.splice(0)) {
    await win.happyDOM.close();
  }
});

describe("keepMusicKitPlaybackLocal", () => {
  test("tags MusicKit's player when MusicKit appends it to <body>", async () => {
    const { win, doc } = freshDocument();
    keepMusicKitPlaybackLocal(doc);

    const player = musicKitPlayer(doc);
    doc.body.appendChild(player);
    await win.happyDOM.waitUntilComplete();

    expect(player.hasAttribute(LOCAL_PLAYBACK_ATTRIBUTE)).toBe(true);
  });

  test("tags a player that is already on the page", () => {
    const { doc } = freshDocument();
    const player = musicKitPlayer(doc);
    doc.body.appendChild(player);

    keepMusicKitPlaybackLocal(doc);

    expect(player.hasAttribute(LOCAL_PLAYBACK_ATTRIBUTE)).toBe(true);
  });

  test("tags a re-appended player from MusicKit's pool once", async () => {
    const { win, doc } = freshDocument();
    keepMusicKitPlaybackLocal(doc);
    const player = musicKitPlayer(doc, "video");
    const setAttribute = spyOn(player, "setAttribute");

    doc.body.appendChild(player);
    await win.happyDOM.waitUntilComplete();
    player.remove();
    doc.body.appendChild(player);
    await win.happyDOM.waitUntilComplete();

    expect(player.hasAttribute(LOCAL_PLAYBACK_ATTRIBUTE)).toBe(true);
    expect(setAttribute).toHaveBeenCalledTimes(1);
  });

  test("leaves the rest of the page's media alone", async () => {
    const { win, doc } = freshDocument();
    keepMusicKitPlaybackLocal(doc);

    const video = doc.createElement("video");
    video.id = "tv-player";
    const audio = doc.createElement("audio");
    const lookalike = doc.createElement("div");
    lookalike.id = MUSICKIT_PLAYER_ELEMENT_ID;
    doc.body.append(video, audio, lookalike);
    await win.happyDOM.waitUntilComplete();

    for (const element of [video, audio, lookalike]) {
      expect(element.hasAttribute(LOCAL_PLAYBACK_ATTRIBUTE)).toBe(false);
    }
  });

  test("installs one observer per document", () => {
    const { win, doc } = freshDocument();
    const Base = win.MutationObserver;
    let created = 0;
    (win as unknown as { MutationObserver: unknown }).MutationObserver = class extends Base {
      constructor(callback: ConstructorParameters<typeof Base>[0]) {
        super(callback);
        created += 1;
      }
    };

    keepMusicKitPlaybackLocal(doc);
    keepMusicKitPlaybackLocal(doc);

    expect(created).toBe(1);
  });

  test("warns if the player still ends up on an AirPlay receiver", async () => {
    const { win, doc } = freshDocument();
    keepMusicKitPlaybackLocal(doc);
    const player = musicKitPlayer(doc);
    doc.body.appendChild(player);
    await win.happyDOM.waitUntilComplete();
    const warn = spyOn(console, "warn").mockImplementation(() => {});

    try {
      Object.defineProperty(player, "webkitCurrentPlaybackTargetIsWireless", { value: true });
      player.dispatchEvent(
        new win.Event("webkitcurrentplaybacktargetiswirelesschanged") as unknown as Event
      );

      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[1])).toContain("AirPlay receiver");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("useMusicKit wiring", () => {
  test("starts watching for MusicKit's player before configure()", () => {
    const source = readFileSync(
      join(import.meta.dir, "../../../src/hooks/useMusicKit.ts"),
      "utf8"
    );
    const install = source.indexOf("keepMusicKitPlaybackLocal();");
    const configure = source.indexOf("window.MusicKit!.configure(");

    expect(install).toBeGreaterThan(-1);
    expect(configure).toBeGreaterThan(install);
  });
});
