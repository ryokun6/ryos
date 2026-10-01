# Bridge methods: native playback handover (build 10, web-side spec)

## Why

On modern iOS the webview cannot keep its own media alive in the background:
WebKit suspends the page (and its media process cannot take a background
assertion), regardless of the app's audio session. The shell therefore plays
the audio itself through `AVPlayer`. The web client stays the queue owner —
it decides what plays next — it just stops being the thing making the sound.

Scope line (Ato, confirmed): **direct media only** — sources served from ryOS
itself (own music library files, karaoke backing tracks). YouTube-backed
audio stays web-rendered: its streams are ephemeral and pulling media out of
YouTube's player is against their terms. For those, background playback is
documented as not achievable; do not hand them to the shell.

## New bridge calls (same `window.ryosDesktop` invoke surface)

### `playNativeMedia({ source })`

Hands a source to the shell. The shell starts `AVPlayer` on `source.url`,
takes over the audio session, and installs lock-screen controls itself.

```
source: {
  url: string,              // absolute https URL of the media file
  title: string,            // lock-screen title
  artist?: string,
  album?: string,
  durationSeconds?: number, // known duration; lock screen shows it if given
  artworkUrl?: string,      // https artwork (shell sanitizes)
  startAtSeconds?: number   // resume offset
}
```

Rules for the web side when handing over:

1. **Mute/skip the web element for that source.** Never play the same audio
   twice; the shell's player is now the sound.
2. Keep updating the queue from your stores as today — but for handed-over
   sources, do NOT send `setNowPlaying`/`updatePlayback`; the shell owns the
   lock screen and its elapsed-time clock while a source is handed over.
3. React to shell events (below) to sync play/pause state in your UI.

### `stopNativeMedia()`

Stops native playback and releases the session (e.g. user stops playback,
window closes, or you switch back to a YouTube-backed source).

### `nativePlaybackCommand({ command, positionSeconds? })`

Transport you send to the shell for handed-over media:
`"play"` | `"pause"` | `"seek"` (with `positionSeconds`).

## Shell → web events

The shell evaluates `window.__ryosNativePlaybackEvent(payload)` with:

```
{ state: "playing" | "paused" | "ended" | "stopped" | "seeked",
  positionSeconds?: number, durationSeconds?: number }
```

On `ended`, advance your queue and call `playNativeMedia` with the next
track — the shell handles each handover the same way. On
`playing`/`paused`, sync your player UI. Payload is a JSON string.

## Lock-screen behavior (shell-side, no web work needed)

While a source is handed over: play/pause acts on the native player
directly; next/previous still forward to the page via
`window.__ryosDesktopRemoteCommand` as today.

## Suggested wiring priority

1. Karaoke backing tracks (the reported failing case) — hand over on play.
2. iPod/music library direct files.
3. Leave YouTube embeds as-is; they play in foreground only, and the
   UI should not promise background for them.
