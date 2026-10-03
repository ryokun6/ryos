import { createClientLogger } from "@/utils/logger";

/**
 * Keeps Apple Music decoding on this device while AirPlay is on.
 *
 * iOS WebKit plays MusicKit's `<audio>` through an AVPlayer that allows
 * AirPlay "external playback" by default: with a receiver that can take a
 * stream (Apple TV, a Mac, AirPlay TVs) it hands the receiver the stream URL
 * and lets it play the song itself. MusicKit's songs are FairPlay streams
 * whose license this page negotiates, and handed off like that they stop as
 * soon as they start (MusicKit reports `paused` right after `play()`).
 * WebKit's `x-webkit-wirelessvideoplaybackdisabled` attribute turns external
 * playback off for the element (`AVPlayer.allowsExternalPlayback = false`),
 * so the song is decrypted here and only its audio goes to the AirPlay
 * device, the way any app's audio does.
 *
 * MusicKit takes the element from its own pool and appends it to `<body>`
 * under this id before giving it a source, so the attribute is set from a
 * `<body>` observer rather than at creation.
 */
export const MUSICKIT_PLAYER_ELEMENT_ID = "apple-music-player";
export const LOCAL_PLAYBACK_ATTRIBUTE = "x-webkit-wirelessvideoplaybackdisabled";

const ELEMENT_NODE = 1;
const log = createClientLogger("MusicKit");
const watchedDocuments = new WeakSet<Document>();

type WebKitMediaElement = HTMLMediaElement & {
  webkitCurrentPlaybackTargetIsWireless?: boolean;
};

function keepElementLocal(node: Node): void {
  if (node.nodeType !== ELEMENT_NODE) return;
  const element = node as WebKitMediaElement;
  if (element.id !== MUSICKIT_PLAYER_ELEMENT_ID) return;
  if (element.localName !== "audio" && element.localName !== "video") return;
  if (element.hasAttribute(LOCAL_PLAYBACK_ATTRIBUTE)) return;

  element.setAttribute(LOCAL_PLAYBACK_ATTRIBUTE, "");
  element.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", () => {
    if (element.webkitCurrentPlaybackTargetIsWireless) {
      log.warn("MusicKit playback moved to an AirPlay receiver anyway", {
        hasLocalPlaybackAttribute: element.hasAttribute(LOCAL_PLAYBACK_ATTRIBUTE),
      });
    }
  });
  log.debug("Kept MusicKit playback local for AirPlay", { tag: element.localName });
}

/** Idempotent per document; call before MusicKit creates its player. */
export function keepMusicKitPlaybackLocal(doc: Document = document): void {
  if (watchedDocuments.has(doc)) return;
  const Observer = doc.defaultView?.MutationObserver;
  if (!doc.body || !Observer) return;
  watchedDocuments.add(doc);

  const existing = doc.getElementById(MUSICKIT_PLAYER_ELEMENT_ID);
  if (existing) keepElementLocal(existing);

  new Observer((records) => {
    for (const record of records) {
      record.addedNodes.forEach(keepElementLocal);
    }
  }).observe(doc.body, { childList: true });
}
