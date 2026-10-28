# Karaoke queue, key change, and vocal removal

## 摘要

現有 Karaoke 用 YouTube iframe 播放，網頁碰不到原始音訊，升降 key 和去人聲沒辦法加在這條路徑上
點歌可以純網頁做：先做本機佇列，派對再接到 Listen Together 的遠端指令
不建議在伺服器抓 YouTube 音檔；升降 key 和去人聲只處理使用者自己提供的音檔
這次在 4 核上實測 htdemucs，30 秒合成音約 7.5 秒（RTF 0.25）；同一類資料中心 IP 連 YouTube 播放資訊就被擋住

## Verdict

| Feature | Verdict |
| --- | --- |
| 點歌 (request queue) | Do it on the web. The YouTube player can stay. A local queue is the MVP. A shared party queue belongs on the existing Listen Together session, not on the personal library. |
| 升降 key (pitch, −6 to +6 semitones, tempo unchanged) | Impossible on the current player. Possible later, in the page, on audio the page itself decodes (a file the user supplies). Do not build an iOS-native player to process YouTube or Apple Music. |
| 去人聲 (vocal reduction + level slider) | Same gate as pitch. A center-channel cancel is the only cheap slider, and it sounds poor. ML separation is a later, optional pass over a file the user already provided. Do not precompute stems from YouTube on the Coolify box. |

Recommended MVP: a Karaoke-only queue (up next, reorder, remove, 插播) that plays through the existing YouTube iframe. Leave pitch and vocal removal out of that release.

A later pass measured both vocal-removal paths. The numbers and the recommendation are in [Vocal-removal paths, measured](#vocal-removal-paths-measured). Short version: local separation only works on audio the page or a native player already decodes, and it is a prepare step, not a live effect. Server-side YouTube extraction is fast enough on CPU once you have the file, and a datacenter address failed YouTube’s bot check before any audio was fetched.

This document is a plan. It does not change playback.

## Current architecture

Karaoke and iPod share one YouTube library and two independent players. Karaoke does not play Apple Music.

### What actually plays

The audible source for Karaoke is a YouTube IFrame inside `react-player` 2.16.1 (`package.json`). `src/components/shared/YouTubePlayer.tsx` sets `enablejsapi: 1` and `origin` to the page origin, then renders the player. The media element lives in a cross-origin `youtube.com` frame. The page can call `playVideo`, `pauseVideo`, `seekTo`, `getCurrentTime`, and `playbackRate` on the IFrame API. It cannot read samples.

Karaoke mounts that component twice:

- Window player in `src/apps/karaoke/components/karaoke-app/KaraokeWindowContent.tsx` (`playing` is `playbackRequested && !isFullScreen && !isListenSessionRemoteOnly`).
- Fullscreen player in `src/apps/karaoke/components/karaoke-app/KaraokeFullscreenView.tsx`.

`src/apps/karaoke/hooks/useKaraokeLogic.ts` copies `getCurrentTime()` across those two players when fullscreen toggles. Progress is polled every 200 ms (`PLAYER_PROGRESS_INTERVAL_MS` in `src/apps/ipod/constants.ts`) and stored as `elapsedTime` on `useKaraokeStore`.

There is no `<audio>` element, no HLS manifest, no MediaSource buffer, and no `AudioContext` node on this path. `docs/6-audio-system.md` shows the same split: UI sounds, the synth, and TTS use `src/lib/audioContext.ts`; iPod, Karaoke, and Winamp send YouTube audio straight to the speakers. Winamp’s backend (`src/apps/winamp/utils/youtubeMedia.ts`) is another YouTube IFrame, not a decoded file.

Volume is the YouTube player’s own volume, fed from `ipodVolume` in `useAudioSettingsStore`. TTS ducking (`src/lib/audioDucking.ts`, factor `0.35`, skipped on iOS) multiplies that setting. A future Web Audio graph would not hear that ducking unless it read the same flag.

### Library vs playback state

`useMediaLibraryStore` is an alias of `useIpodStore` (`src/stores/useMediaLibraryStore.ts`). The YouTube list is `tracks`. Apple Music lives in separate arrays (`appleMusicTracks`, playlists, favorites) and is played by `src/apps/ipod/components/AppleMusicPlayerBridge.tsx`, which calls MusicKit JS `setQueue`. MusicKit owns a private `<audio>` element that is not in the React tree.

Karaoke’s current song is `useKaraokeStore.currentSongId`. `getCurrentTrack()` looks up that id in `useIpodStore.tracks` only (`src/stores/useKaraokeStore.ts`). Admin hides “Play in Karaoke” for Apple Music ids for this reason (`src/apps/admin/components/song-detail-panel/SongDetailPanelActions.tsx`).

Next and previous do not walk a request list. They walk the whole YouTube library via `computeNextNavigation` with `KARAOKE_NAVIGATION` (`src/shared/media/transport.ts`): sequential order, optional shuffle, `loopCurrent` / `loopAll`. Shuffle history is `playbackHistory` on the karaoke store (not persisted). The closest existing “queue” is iPod-only: `appleMusicPlaybackQueue` scopes Apple Music next/previous to the album, artist, or playlist the user tapped (`setAppleMusicPlaybackQueue` in `src/stores/useIpodStore.ts`, set from `playTrackFromMenu` in `src/apps/ipod/hooks/useIpodLogic.ts`). Karaoke never reads it.

Adding a song today inserts a `Track` into the shared library and usually starts it immediately (`addTrackFromVideoId` in `useIpodStore`, `handleSongSearchSelect` / `handlePlayTrack` in `useKaraokeLogic`). The library order is cloud-synced. A karaoke queue must not reorder `tracks`.

### What the server stores

`api/_utils/_song-service.ts` writes Redis documents only:

- `media:song:meta:{id}` — title, artist, album, cover, timestamps
- `media:song:content:{id}` — KuGou lyrics, translations, furigana, soramimi

Ids are YouTube video ids (`docs/8.2-song-api.md`). Nothing in `api/` extracts, proxies, or caches audio. There is no `yt-dlp`, ffmpeg, or stem pipeline.

The user’s copy of the library syncs through Cloud Sync v2 as `songs/track:{id}` plus `songs/lib` (order and library version) in `src/sync/codecs.ts`. Karaoke playback (`currentSongId`, loop, shuffle, display mode) is local persisted state under `ryos:karaoke` and is not a sync document.

### Lyrics clock

Word timings are KuGou KRC data: each line has `startTimeMs`, and each word has `startTimeMs` / `durationMs` relative to the line (`src/types/lyrics.ts`). Furigana is not a second clock. `mapWordTimingsToFurigana` (`src/apps/ipod/components/lyrics-display/furiganaWordMapping.ts`) aligns readings to those words by character offset. Highlighting then follows `currentTimeMs`.

Karaoke computes that time as player seconds plus the per-track offset:

```text
currentTimeMs = (elapsedTime + lyricOffset / 1000) * 1000
```

See `KaraokeWindowLyricsOverlay.tsx` and `karaoke-lyrics-playback/context.tsx`. `lyricOffset` lives on the `Track` (`src/shared/media/library.ts`). Changing it debounces a write to `/api/songs/{id}` (`saveLyricOffsetToServer` in `useIpodStore.ts`) and rides along in cloud sync. A positive offset means lyrics earlier. A negative offset auto-seeks the player so lyric time 0 is not before 0 (`getLyricOffsetSeekTarget` in `src/shared/media/useLyricOffsetTrackChange.ts`).

`WordTimingHighlight.tsx` interpolates between the 200 ms progress ticks. The lyric clock and the YouTube clock are the same timeline. Anything that changes tempo (playback rate) or delays the audible output (a pitch worklet) without moving `getCurrentTime()` will desync the words.

### Listen Together and the remote command bridge

Sessions are Redis records with a 4-hour idle TTL and a cap of 10 people (`api/listen/_helpers/_constants.ts`). The wire shape is one current track, play/pause, and `positionMs` (`src/shared/contracts/listen.ts`). There is no queue field.

The DJ broadcasts position about every 3 s (`useListenSync` in `src/hooks/useListenSync.ts`). Listeners within 0.5–3 s are nudged by setting the YouTube `playbackRate` to `1.05` or `0.95`. Larger gaps seek. Logged-in non-DJ clients are remote-only: `listenRemoteOnly` in `useKaraokeLogic.ts` is `session && !isDj && !anonymous`. They do not run a player. They advance a virtual `elapsedTime` from the sync payload so lyrics still move. Anonymous listeners do play the YouTube video locally.

Remote commands (`POST /api/listen/sessions/{id}/remote-command`, applied in `useKaraokeLogic.ts`) are `play`, `pause`, `seek`, `next`, `previous`, and `playTrack`. The DJ is rejected if they try to send one (`api/listen/sessions/[id]/remote-command.ts`). `playTrack` adds the id to the library if needed and **starts it now**. Several error toasts say “Could not queue track”; nothing is queued.

Chat’s `mediaControl` tool (`src/apps/chats/tools/mediaHandler.ts`) and the dashboard iPod widget in karaoke mode (`src/components/layout/dashboard/IpodWidget.tsx`) call the same `nextTrack` / `previousTrack` / `setCurrentSongId` actions. A queue has to live behind those actions or the widget, the chat tool, and the menu will skip it.

### iOS shell

`ios/ryOS/ShellWebView.swift` is a `WKWebView` pointed at `https://os.ryo.lu`. It allows inline playback and does not require a user gesture (`allowsInlineMediaPlayback`, `mediaTypesRequiringUserActionForPlayback = []`). The native bridge (`DesktopBridge.swift`, `window.ryosDesktop`) covers notifications, haptics, location, and auth sheets. It has no audio tap and no player.

`ios/ryOS/AudioSessionController.swift` sets `AVAudioSession` category `.playback` and reactivates it on foreground and after interruptions, because WebKit does not. The comment in that file is the important constraint: WebKit owns the session for web media. The shell never sees the PCM YouTube is playing, so `AVAudioUnitTimePitch` cannot be inserted in front of it.

Two web behaviors matter for a later player:

- Closing the Karaoke window sets `isPlaying` false (`useKaraokeLogic.ts`, “Window closed; stopping playback”). The YouTube iframe is inside the React tree, so `playing={false}` is what stops it. Minimized windows stay mounted (`keepMountedWhenMinimized: true` in `KaraokeAppComponent.tsx`) and keep playing.
- `KaraokeIosAutoplayWatchdog.tsx` waits 1.2 s. If `playbackRequested` is set, the user has not gestured, and `elapsedTime` has not moved, it forces pause and shows ⏸. A new player that is slow to emit the first progress tick will trip this.
- Apple Music has a separate stop-on-unmount (`inst.stop()` in `AppleMusicPlayerBridge.tsx`) because MusicKit’s `<audio>` is outside React. Karaoke does not mount that bridge.

There is no `navigator.mediaSession` / Now Playing integration in the web app. Lock-screen controls, if any, are whatever WebKit exposes for the iframe.

## Can the page reach the samples?

No, not from the player Karaoke uses today.

| Source | Samples reachable? | Why |
| --- | --- | --- |
| YouTube IFrame (`YouTubePlayer`) | No | Cross-origin frame. `MediaElementSource`, `captureStream()`, and Web Audio cannot see inside it. The IFrame API does not return a buffer. |
| MusicKit JS (`AppleMusicPlayerBridge`) | No | FairPlay. The element is private to MusicKit. Capturing or tapping it violates the media and the developer terms. Apple Music Sing’s vocal slider is inside the Apple Music app only. MusicKit and the Apple Music API expose catalog, library, and playback, not stems or a pitch unit ([Apple’s Sing support page](https://support.apple.com/en-us/127940), [MusicKit](https://developer.apple.com/musickit/)). Partner TTML delivery is how songs qualify for Sing; it is not an API. |
| Winamp YouTube backend | No | Same iframe. |
| User file, or a same-origin URL the page is allowed to fetch | Yes | `decodeAudioData` or an `<audio>` element the page created, then Web Audio. |
| iOS `AVAudioEngine` around the WKWebView | No | WebKit’s audio graph is not the app’s engine. A native unit only sees audio the native player decodes itself. |

So every pitch or vocal design starts with a new source. The queue does not.

### Ways to get processable audio

**1. Keep the YouTube embed.** Legal and already shipped. No processing. This is the right source for 點歌.

**2. Server-side extraction (yt-dlp or a stream proxy) and a cache of audio files.** Technically routine: one worker, one object per video id, the page plays a same-origin URL through Web Audio. This is the wrong default for os.ryo.lu.

- YouTube’s terms prohibit downloading content except where YouTube itself offers a download. The IFrame API terms do not grant a copy or a derivative.
- A public site that stores or restreams catalog recordings is making copies and derivatives (instrumentals, pitched renders). That is a copyright problem even if each user “already streamed it”.
- The extractor breaks whenever YouTube changes the player. It becomes an ops dependency of the Coolify app.
- Cost of the bytes is small. Cost of the legal exposure is the whole feature. Do not put this behind a flag “just for Ryo’s account” on the production origin; the same binary serves every user.

**3. User-provided files.** The page decodes a file the user picked. Processing stays in the tab. The server stores nothing. This is the only source that is both processable and acceptable. Lyrics still come from the existing KuGou pipeline if the user attaches the file to a library song (or picks a YouTube id whose lyrics should follow the file). The file’s `currentTime` replaces `ReactPlayer.getCurrentTime()` as the lyric clock.

**4. Apple Music / MusicKit.** Already integrated for iPod playback and metadata. It does not yield PCM, and Sing is not callable. Treat it as unavailable for key and vocal, including in the iOS shell. A native `ApplicationMusicPlayer` has the same wall.

**5. On-device or server ML over a copy we do not have.** Demucs cannot run on an iframe. It runs on a file from (2) or (3). Only (3) is in bounds.

### Infra cost, if extraction were ever reconsidered

Deployment is a Coolify Dockerfile on a VPS, with Redis and the existing object-storage bucket (`docs/1.3-self-hosting-vps.md`). There is no GPU in that setup.

Rough orders of magnitude, to be rechecked before any spend:

- A 4-minute instrumental at ~128 kbps is about 4 MB. Ten thousand songs are tens of gigabytes. Hetzner object storage is the cheap part (euros per terabyte-month, not a new server).
- One HTDemucs vocal pass on a laptop-class CPU is on the order of 20 seconds for a 3-minute song (published ONNX CPU numbers on an M4 Pro). A small shared VPS is several times slower. Budget one to five minutes of CPU per song, on a worker, never inside the request that serves `/api`.
- A dedicated Hetzner GPU box is hundreds of euros per month. It is not justified for a cache that should not be built from YouTube in the first place.
- In-browser Demucs avoids that bill and moves the wait onto the phone. See the vocal section.

## Pitch shift

Independent pitch with unchanged tempo is not a Web Audio primitive. `playbackRate` and `AudioBufferSourceNode.detune` change pitch and speed together. Listen Together already writes `playbackRate` (`0.95` / `1.05`) for soft sync, so a rate-based “key change” would fight the session and would also slide the lyric clock relative to the beat.

| Approach | Tempo held? | Quality on a full mix | Latency | Fits ryOS? |
| --- | --- | --- | --- | --- |
| YouTube `playbackRate` | No | The song speeds up | None | No. Breaks lyrics and listen-sync. |
| `tone` `PitchShift`, already a dependency | Yes | Poor. It is two delay lines driven by a sawtooth (`node_modules/tone/build/esm/effect/PitchShift.js`: “speeding up or slowing down the delayTime of a DelayNode”). Polyphonic music sounds metallic and chorused, especially past a couple of semitones. | Tens of ms, plus the delay window | No for a karaoke key control. Fine only as a synth effect, which is what the app uses Tone for. |
| SoundTouch (JS port or AudioWorklet) | Yes | Usable at ±6. Time-domain: kicks can double or drop, bass gets woolly. Acceptable for a first slider, not studio-grade. | About one processing block, typically 50–150 ms | Yes, on a buffer the page owns. LGPL-style upstream; the JS port’s license has to be checked before shipping. |
| Rubber Band WASM (R2 realtime, or R3 draft) | Yes | Best of the open options. R3 is clearly better on mixes and vocals; R2 is the realtime default and is already better than SoundTouch. | Realtime mode is lock-free; still a block of latency, larger if the window grows for quality | Web: yes, on a file the page owns. License: GPL-2.0-or-later. ryOS is AGPL-3.0-only, which can combine with “GPL-2 or later” on the website. Breakfast Quay states that GPL Rubber Band may not be shipped through the Apple App Store without a commercial license. Loading a WASM file from os.ryo.lu into the existing WKWebView does not link it into the iOS binary. Compiling Rubber Band into `ios/ryOS` would. |
| Hand-written phase-vocoder AudioWorklet | Yes | Easy to make it worse than SoundTouch. A good one is a research project. | FFT size. 4096 samples at 48 kHz is ~85 ms, plus overlap | Not worth writing. |
| iOS `AVAudioUnitTimePitch` on `AVAudioEngine` | Yes | Apple’s unit is strong, realtime, and the latency is small and queryable. | Low | Only for audio the native player decodes. It does not attach to WKWebView YouTube or to MusicKit. A native player would duplicate seek, ended, fullscreen handoff, listen-sync, and the lyric clock. |

Recommendation: if key change is built, do it in an AudioWorklet on a user-file player, with SoundTouch first (smaller, good enough to learn the UX) and Rubber Band R2 as the upgrade if the artifacts bother people. Range −6 to +6 semitones, step of 1. Keep tempo at 1. Compensate lyric time in the player adapter, not in `track.lyricOffset` (that field is saved to Redis and synced). Subtract the worklet latency from the lyric clock so the highlight does not lead the voice. Do not start an iOS player unless that worklet is actually unusable on Safari. Modern Safari has AudioWorklet; the missing piece is the samples, not the DSP API.

`KaraokeIosAutoplayWatchdog` must ignore a player that is still decoding its first block. The 1.2 s test should key off “no time advance and no pending decode”, or a file player will pause itself on first tap.

## Vocal removal

| Approach | Quality | Cost | When it is honest |
| --- | --- | --- | --- |
| Center-channel cancel (mid/side: keep the sides, scale down the mid) | Poor. Centered vocals drop, but so do kick, bass, and snare. Stereo vocals and reverb leak back. Mono sources collapse. | A few adds per sample. A level slider is natural: `mid * (1 - amount)`. Latency under 1 ms. | The only vocal control that belongs in an MVP of the audio features. Ship it as “reduce center”, not as “studio instrumental”. |
| HTDemucs / HTDemucs-FT (ONNX) | The open-source quality bar for karaoke stems. Vocals specialist is the relevant model. | Model download is large. Published browser notes: `htdemucs_ft_vocals` fp16-weights ONNX is about 166 MB; a 4-stem file is similar; the fine-tune bag is four of those. Single-thread WASM on an M-series laptop is slower than realtime per 7.8 s chunk; phones are slower still (several seconds per chunk). WebGPU builds exist and can run faster than realtime on a desktop GPU, but many stock ONNX exports fail on the WebGPU execution provider until STFT is pulled out of the graph. | Optional, after a file player exists. Preprocess the file once, cache the instrumental in memory (or IndexedDB) for the session, then the vocal slider crossfades dry mix and instrumental. Not live on the first beat of a song. |
| Spleeter, older MDX | Worse than HTDemucs, smaller, unmaintained. | Still a big download and a wait. | Skip. The quality gap is the whole feature. |
| Server precompute, cache stems in object storage | Same model quality, faster if a GPU exists, otherwise a queue. | CPU time on the VPS plus storage. The bytes are cheap. The legal problem is unchanged if the input was YouTube. A user-uploaded master is a moderation and copyright-hosting problem. | Do not build this for the YouTube library. Revisit only if users upload files and the phone cannot finish a song in a tolerable wait. |
| iOS Core ML Demucs | Feasible as an offline conversion of the same model, on a file the app has. Neural Engine can beat WASM. | A native pipeline, a model in the app or a download, and still no access to WKWebView audio. | Same trigger as `AVAudioUnitTimePitch`: only if the web path cannot finish a user file on device. |
| Apple Music Sing | Best UX in the market, and not ours. | No public API. | Do not plan on it. |

In-browser Demucs also collides with the current page. Multi-thread WASM needs `SharedArrayBuffer`, which needs `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`. ryOS does not send those (`api/_utils/_security-headers.ts` only adds `frame-ancestors`). Turning them on site-wide breaks the YouTube iframe and MusicKit’s `window.open` sign-in. A Demucs worker would need its own origin, the way `IE_PROXY_ORIGIN` is isolated, or it stays single-threaded and slow. Either way it is not the first vocal slider.

Recommendation: on the user-file player, ship a center-cancel amount slider (0–100%). Leave Demucs as a later “prepare instrumental” action on that same file, in-browser, single-threaded, with an explicit wait. Do not add a GPU service.

## Feasibility matrix

| Feature | Web, current YouTube player | Web, user-file player | iOS shell, current WKWebView | iOS, new native player | Server |
| --- | --- | --- | --- | --- | --- |
| 點歌, local queue | Yes | Yes | Yes (same page) | Unnecessary | No |
| 點歌, party queue | Yes, extend Listen Together | Yes | Yes | Unnecessary | Small: new fields on the session and new remote actions |
| 點歌, same user on another device | Only if the queue is added to Cloud Sync | Same | Same | Unnecessary | Sync document, not required for MVP |
| 升降 key | No | Yes (SoundTouch, then Rubber Band) | No while audio is the YouTube iframe | Yes, but only for a file that native code decodes | Possible and out of bounds for YouTube sources |
| 去人聲, center slider | No | Yes | No on the iframe | Yes, for a native-decoded file | No need |
| 去人聲, Demucs | No | Possible, slow, large download | No on the iframe | Possible offline on a file | Possible, and the wrong place to copy YouTube audio |
| Lyrics stay locked | Already true | True if the lyric clock uses the file’s timeline minus processor latency, and `lyricOffset` is left alone | True | Must reimplement the clock | n/a |

## Recommended architecture

Two playback modes, one queue. Do not fork the YouTube player.

### Queue (both modes)

Keep `tracks` as the library. Add a karaoke queue that the library order does not know about.

```text
KaraokeQueueItem
  entryId        stable id for reorder (not the track id; the same song can be requested twice)
  trackId        YouTube id, or a local-file id
  requestedBy    username or null
  addedAt
```

State on `useKaraokeStore`, not on `useIpodStore`:

- `queue: KaraokeQueueItem[]` — upcoming only. The current song stays `currentSongId`.
- Actions: `enqueue`, `enqueueNext` (插播, insert at index 0), `move`, `remove`, `clear`.
- `nextTrack` plays `queue[0]` and shifts it off when the queue is non-empty. If the queue is empty, keep today’s library navigation (`KARAOKE_NAVIGATION`) so shuffle and loop-all still work for people who never queue.
- `previousTrack` keeps `shouldRestartTrackOnPrevious` behavior, then the history it already has. Do not invent a “played” stack in the MVP unless 插播 makes “back” ambiguous. Open question below.
- Play-from-library and the song search dialog gain two outcomes: “Play now” (today’s behavior, and the current song is not lost: it becomes the head of the queue or is left as “now” with the old now pushed) and “Add to queue”.
- The dashboard widget, chat `mediaControl`, keyboard next/previous, and listen-together `next` / `playTrack` all go through these actions. `playTrack` from a remote stays “play this now” and pushes the interrupted song to the front (插播), which matches a DJ grabbing a request. A new `enqueue` action appends.

Persistence for the MVP is the existing `ryos:karaoke` persist list. It is this browser only. That matches how playback itself works today.

Party queue, second step: store `queue` on the listen session next to `currentTrackId`. New remote actions `enqueue`, `enqueueNext`, `moveQueue`, `removeQueue`. The DJ applies them and broadcasts the queue on the sync payload (or a dedicated event) so every phone shows the same up-next list. Logged-in non-DJ phones already do not play audio; they are the request remotes. Cap stays 10 people, TTL stays 4 hours, queue dies with the session. Do not write the party queue into `songs/lib`.

Same-user multi-device sync of a personal queue is optional and later. If it is added, it is a new sync key (for example `songs/karaoke-queue`), not a rewrite of `tracks` order.

Local files in the queue use an id that cannot collide with a YouTube id (`file:` plus a random id). They are not written to Redis song metadata and not cloud-synced as bytes. Losing them on refresh is acceptable if the UI says the file is session-only. The blob can sit in IndexedDB if we want refresh to survive; that is part of the file-player phase, not the queue MVP.

### Key and vocal (file mode only)

A small player adapter with the same imperative surface Karaoke already uses (`seekTo`, `getCurrentTime`, `playing`, `onProgress`, `onEnded`). `useKaraokeLogic` already branches on fullscreen refs; it should branch on source instead of growing a third YouTube-specific path.

```text
file -> AudioBuffer or MediaElement
     -> vocal stage (dry, or mid scaled by the slider)
     -> pitch stage (semitones, rate = 1)
     -> gain (ipodVolume, including TTS ducking)
     -> destination
```

`getCurrentTime()` reports the file timeline. Lyric `currentTimeMs` subtracts a fixed processor latency from that report and then adds `lyricOffset` exactly as today. Latency is not persisted.

When the current item is a YouTube id, the key and vocal controls render disabled, with a short reason, not a silent no-op.

Listen Together: the DJ is the only machine that would run the graph. Anonymous listeners play their own unprocessed YouTube copy and would be in a different key. While a processed file is the current item, force remote-only for everyone who is not the DJ (including anonymous), or refuse to start a session. Processed audio is not what the sync protocol distributes.

## Phased plan

Effort is scope, not a schedule. Each phase is shippable alone.

### Phase 1 — Local queue (MVP)

Touched: `useKaraokeStore.ts` (queue state, and `nextTrack` / `previousTrack` when the queue is non-empty), `useKaraokeLogic.ts` (search, library play, cover flow, remote `playTrack` semantics for the local case), a queue panel in the karaoke window, menu entries, the dashboard widget and `mediaHandler.ts` only so they keep calling the store (they should not learn a second navigation path), i18n strings, unit tests around the queue reducer and next/previous.

Not touched: `YouTubePlayer`, the song Redis schema, `songs/lib` order, the iOS shell.

Out of scope on purpose: drag-reorder polish can be up/down buttons first; persistence across reload; empty-queue fallback to the library.

This is a contained store and UI change. It is the release to ship.

### Phase 2 — Party queue on Listen Together

Touched: `src/shared/contracts/listen.ts`, session Redis read/write, `remote-command.ts` action list, the Pusher payload, `useListenSync` / the karaoke command loop, the queue panel’s “who asked” line.

Need a decision on `playTrack` vs `enqueue` before coding (see open questions). Tests belong next to the existing listen-session suites.

Crosses the API and the client. Do it after the local reducer exists so the DJ applies the same functions.

### Phase 3 — User-file player, no effects yet

A file item in the queue. One `<audio>` or buffer source behind the adapter above. Lyric clock, fullscreen handoff, ended → `nextTrack`, volume and TTS ducking, offline behavior (a local file should play offline; YouTube still must not), and the iOS autoplay watchdog. No pitch, no vocal.

This is the large phase. It is a second transport, and every caller of `getActivePlayer()` in karaoke has to accept it. iPod can stay on YouTube. Do not start it until the queue is in use and still wanted.

### Phase 4 — Key slider

AudioWorklet pitch, −6…+6, tempo 1, lyric latency compensation, disabled on YouTube items. Listen-together policy from the architecture section. SoundTouch first.

Medium, and only after phase 3. Rubber Band is a follow-up inside this phase if SoundTouch’s kicks are too obvious, after a license pass.

### Phase 5 — Center vocal slider

The mid/side amount control on the same graph, in front of the pitch stage so the slider and the key commute. Label it honestly.

Small once phase 3 exists. Can ship in the same release as phase 4.

### Not scheduled

- YouTube download, proxy, or stem cache on Coolify. CPU cost was measured afterward and is not the blocker. See [Path B](#path-b--server-extracts-separates-client-plays-the-stem).
- Demucs in the browser or on a GPU box, until a user-file player exists. The native CPU timing below is an upper bound, not a phone timing.
- An iOS `AVAudioEngine` player for WKWebView audio.
- Apple Music Sing.
- Writing processor latency into `lyricOffset`.

## Vocal-removal paths, measured

Two ways to get real vocal removal, looked at again after the first plan. Prototype code stayed on the VM. Nothing in this repo plays or separates audio.

### Path A — local or on-device

The samples have to already be in a process we control. Capturing the speakers is a different problem from decoding the file, and it does not line up with the lyric clock.

#### Browser, user-supplied file

This is the path the first plan already allows. The page decodes a file the user picked, then runs a separator in that tab.

What was measured here is the native model, not the browser port. `demucs` 4.1.0 on PyTorch 2.14.1+cpu, `shifts=0`, `overlap=0.25`, `split=True`, `jobs=0` (so the only parallelism is Torch’s own threads):

| Run | Threads | Wall | Audio | RTF (wall / audio) | Times realtime | CPU time / wall | Peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `htdemucs` warmup | 4 | 8.03 s | 30.00 s | 0.268 | 3.7× | 3.75 | 1196 MB |
| `htdemucs` measured | 4 | 7.50 s | 30.00 s | 0.250 | 4.0× | 3.83 | 1203 MB |
| `htdemucs` | 2 | 14.33 s | 30.00 s | 0.478 | 2.1× | 1.92 | 1188 MB |
| `htdemucs_ft` (4-model bag) | 4 | 28.41 s | 30.00 s | 0.947 | 1.1× | 3.82 | 1800 MB |

The clip is synthetic: 30.00 s, 44.1 kHz, stereo, two sines plus white noise from ffmpeg. It is not a song, and the run was not scored for vocal quality. RTF is the network’s cost. Each `htdemucs` checkpoint on disk is 84,025,440 bytes (about 80 MiB). The fine-tune bag is four of those.

Scaling from 4 threads to 2 was almost linear on this CPU. A 4-minute file is eight times the clip, so about 60 s on 4 threads and about 115 s on 2 threads for plain `htdemucs`. The fine-tune bag is about 3.8× slower (about 3.8 minutes for a 4-minute file on 4 threads) for a quality bump that is not worth a first server or a phone.

This host is not a phone and not a Hetzner VPS. It is a KVM guest with 4 vCPUs of an Intel Xeon (CPUID family 6, model 207, AVX-512). Treat 0.25 as a fast-desktop ceiling. Published browser ONNX notes put single-thread WASM at several seconds per 7.8 s chunk on a recent iPhone, and the model download for an `htdemucs` fp16-weights ONNX is on the order of 166 MB. A browser session should be planned as a gigabyte-class allocation: the native process peaked near 1.2 GB. That fits a desktop tab. It is a bad bet for a phone tab that is also showing lyrics and a video.

MDX-Net was not timed. Those ONNX files are often smaller and faster than HTDemucs and worse on vocals. They have the same gate: the page still needs the file.

The browser can keep up with a live stream only when RTF stays under 1 and you accept the model’s chunk delay. HTDemucs splits into segments of about 7.8 s with overlap. The algorithmic delay is seconds, not a buffer of a few tens of milliseconds. On a phone, where RTF is above 1, the separator falls behind a live stream. The honest UX is a “prepare instrumental” action with a progress bar, then a crossfade against the dry file. The center-channel slider remains the thing that can move during playback.

`SharedArrayBuffer` for multi-thread WASM still wants COOP/COEP on the app origin, which breaks the YouTube iframe and MusicKit sign-in (`api/_utils/_security-headers.ts`). A desktop ONNX session should stay single-threaded, or run on a separate origin. Neither belongs in the queue MVP.

#### iOS native

`AVAudioEngine` and a Core ML Demucs only see audio the native player decodes. This VM has no Apple GPU or Neural Engine, so no Core ML timing was taken. A converted `htdemucs` is a plausible on-device model (the PyTorch file is 80 MiB; a Core ML package is the same order), and an iPhone will beat mobile WASM. It is still a prepare step over a file or a download the app owns, in chunks, with seconds of delay before the first separated audio. It does not attach to the WKWebView’s YouTube player. `AudioSessionController.swift` only reactivates the session WebKit already owns.

There is no system API that returns Apple Music Sing stems to a third-party app.

#### macOS capture, and Chrome tab audio

ryOS already has an Electron shell (`electron/main.ts`). It does not call ScreenCaptureKit or `desktopCapturer`. A macOS-only addition could use ScreenCaptureKit to record another app’s audio after a Screen Recording prompt. That records the other app. Karaoke’s lyric clock is the YouTube iframe inside this app (`getCurrentTime()` in `useKaraokeLogic.ts`). Capturing Chrome while the lyrics live in ryOS does not give you one clock. Capturing the Electron process itself includes every sound that process plays, including a processed copy you send back to the speakers.

`excludesCurrentProcessAudio` (the ScreenCaptureKit switch for “don’t record myself”) does not help when the YouTube iframe is in-process. Excluding the current process excludes the song.

Chrome’s `getDisplayMedia` can include tab audio, and that mix does include a cross-origin iframe, because the capture is the tab’s audio output rather than a handle on the frame. Checked against the Screen Capture spec and Chrome’s own description of `suppressLocalAudioPlayback` (Chrome 109+):

- The call always shows a permission prompt. `preferCurrentTab` is a hint. It is not a silent, persistent grant. There is no equivalent on iOS, and Firefox and Safari do not implement this constraint.
- It is Chromium on desktop only.
- Muting the iframe is not viable. `player.mute()` / `setVolume(0)` on the IFrame API turns the volume down inside YouTube, before the samples are mixed into the tab. The capture then records silence. You cannot mute the player and still harvest its audio from the tab mix.
- `suppressLocalAudioPlayback: true` is the API that keeps the captured stream intact while stopping local speaker playback of the captured surface. It is the wrong shape for a same-tab karaoke page. The processed audio you play back is also in that tab, so it is either silenced with everything else or fed back into the capture.
- A popup or second window that contains only the iframe, captured from the main window, avoids the feedback. The user must pick that surface, the video is no longer in the karaoke window, and the capture clock is not `getCurrentTime()`. Tab-capture buffering is commonly on the order of 100–300 ms and is not stable. HTDemucs then adds seconds. The iframe’s picture would lead the instrumental by the whole pipeline, and the lyric highlight, which follows the iframe clock, would lead the voice you hear.

So Chrome tab capture is a real way to *hear* the iframe. It is not a way to replace that audio in sync with the lyrics. It should not be a product phase. A one-afternoon spike on desktop Chrome could confirm the same-tab echo, and that result would not change the architecture.

### Path B — server extracts, separates, client plays the stem

This is the path that would also unlock key shift, because the client would finally have a timeline it can put through an AudioWorklet. It is also the path that copies YouTube audio onto infrastructure we run.

#### Extraction from a datacenter address

Measured from this VM, which is AWS us-east-1 (AS14618), not a Hetzner address. `yt-dlp` 2026.10.21, metadata only (`--simulate`, no media file written), against a public watch URL:

```text
ERROR: [youtube] jNQXAC9IVRw: Sign in to confirm you’re not a bot.
```

That failed before a format URL existed, so a PO token was never in play. yt-dlp’s maintainers have said the same thing about datacenter addresses: a PO token can help a residential address avoid getting blocked, and it does not unblock an address YouTube has already classed as a bot (see yt-dlp issue 16773, May 2026, and the PO Token guide). Tokens are bound to the video id and to the client that minted them, they expire, and they have to be minted per video by a provider plugin. They are an ongoing breakage surface, not a config flag.

The error text also suggests passing browser cookies. Doing that with a real YouTube account risks the account (yt-dlp’s own cookie warning). Cookies from a home browser do not transfer cleanly onto a server IP, and they rotate. This probe did not try cookies.

Hetzner’s egress is the same class of address as this AWS guest: a datacenter IP with no browser reputation. The production Coolify host should be assumed to hit this wall until someone runs the same logged-out metadata request from that host and sees a format list. I did not have a Hetzner shell to do that.

#### Separation cost

Once a wav exists, separation is the cheap and predictable part.

On the 4-vCPU Xeon above, plain `htdemucs` at `shifts=0` is RTF 0.25 (about one minute for a 4-minute song) and about 1.2 GB RSS. Two threads are RTF 0.48 (about two minutes for a 4-minute song). `htdemucs_ft` is RTF 0.95 and 1.8 GB, which is the wrong default for a batch worker. The default `shifts=1` in Demucs averages a second pass and would roughly double these times; a server should pin `shifts=0`.

Do not run it inside the request process that serves `/api`. Peak RSS of 1.2 GB on a small VPS will stall the app. A worker, one song at a time, is the shape.

This VM has no GPU, so no GPU timing was taken. Hetzner’s current entry GPU box, fetched from the public GEX44 page on 22 Oct 2026, is now the GEX45: NVIDIA RTX PRO 4000 Blackwell, 24 GB, €214 per month excluding VAT (€0.3429 per hour, €209 setup), Helsinki, provisioned as a dedicated Robot server rather than a Coolify cloud VM. It is a standing bill, not a per-song function. A GPU would turn a one-minute CPU job into a few seconds. It would not make YouTube answer a datacenter IP. Skip it unless a queue of already-legal files is waiting on CPU, which a single 4-core worker at RTF 0.25 will not see from karaoke traffic.

#### Cache size and storage

Store an encoded instrumental, not four PCM stems.

A 4-minute stereo file at 44.1 kHz, 16-bit PCM is about 40 MB. Opus or AAC around 128 kbps is about 3.7 MB. Keeping the dry mix as well, so a slider can crossfade, is another 3.7 MB. Ten thousand songs at 4 MB are about 40 GB.

Hetzner Object Storage’s published base price is €6.49 per month excluding VAT and includes 1 TB of storage and 1 TB of egress (page fetched 22 Oct 2026). Forty gigabytes and the occasional play sit inside that quota. Egress beyond it is €1 per TB. Storage is not the cost that matters. The GPU box and the legal exposure are.

#### Playback and the lyric clock

The iframe stays for the picture. Its audio is muted with the IFrame API, and a same-origin instrumental is what the user hears. That mute is safe here because nothing is trying to capture the iframe. It is the opposite of path A.

The lyric clock must stay on one timeline. `currentTimeMs` is iframe `elapsedTime` plus `lyricOffset` (`KaraokeWindowLyricsOverlay.tsx`). The instrumental player seeks to the same `getCurrentTime()` the iframe reports, and user seeks move both. `lyricOffset` stays the per-track calibration already saved to Redis. Any constant decoder delay is subtracted in the player adapter only.

Listen Together can keep broadcasting `positionMs` from that shared clock. The DJ is the one who fetched the stem. Other clients who still play the YouTube audio locally (anonymous listeners do) would hear the original vocal under a transposed or vocal-stripped DJ. Same rule as the first plan: a processed item forces everyone except the DJ into remote-only mode, or the session refuses the effect.

First-play delay is the sum of a successful download and the separation of whatever prefix you refuse to start without. A full-file wait on this CPU is about a minute for four minutes of audio, plus whatever yt-dlp spent, and that is only after YouTube agreed to give you the file. Overlap-add means you could start after the first ~8 s segment (about 2 s of compute here) if the downloader streams, which the normal yt-dlp temp-file flow does not. Building a streaming pipeline is extra work on top of an extractor that already failed the bot check. Plan the UX as “preparing this song”, not as a gapless next-track.

Key shift then uses the same file and the same worklet as path A. Tempo stays 1. Lyrics do not move.

#### Legal risk and the mitigations that do not remove it

Downloading the audio breaks YouTube’s terms. Keeping an instrumental is a derivative copy of the recording and the composition. Doing it for every logged-in user of os.ryo.lu is a library of those copies. The embed we already ship is the path YouTube actually offers.

| Mitigation | What it changes | What it does not change |
| --- | --- | --- |
| Ryo’s account only | One person’s requests, easiest to turn off | The download is still against YouTube’s terms |
| Any logged-in user | Stops anonymous scraping of the stem URL | The user base is still the public, and each play is still a copy you made |
| No public cache, auth on the URL | Stops a random visitor hotlinking a stem | The browser still receives the bytes |
| On-demand, TTL of a few hours | Limits how long the copy sits on disk | You still create it, and a short TTL means popular songs are re-fetched, which is how an IP gets blocked faster |
| PO token provider, or cookies | Sometimes restores formats on a residential IP | Maintainers say it does not clear a datacenter IP that is already failing the bot check. Cookies put an account at risk of a ban |

Recommendation: do not build path B. The CPU math is fine. The extractor is not, on the kind of address Coolify uses, and the license is not there even if a future probe from Hetzner succeeds. Restricting the feature to Ryo is a way to run a private experiment he would be personally responsible for. It is not a way to ship 去人聲 on os.ryo.lu.

#### Phased plan, if the recommendation is overridden

1. From the production host, logged out, run a metadata-only extractor request. If it returns the bot wall, stop. Do not add cookies to get past it.
2. A worker beside the API, not in it. One song at a time, `htdemucs`, `shifts=0`, delete the source wav after the encode. Auth required. Object key scoped to the user. TTL of hours. No list endpoint, no share URL.
3. Client: mute the iframe, play the instrumental on the iframe clock, keep `lyricOffset` untouched. First play shows a preparing state. YouTube items with no ready stem keep today’s player.
4. A GPU server only after that worker has a backlog of files we are allowed to process. Karaoke traffic will not create that backlog. The GEX45 is the wrong purchase for this feature.

### What to do instead

Ship the queue. When vocal removal comes back, do it as a prepare step on a file the user supplied, on desktop first, with the center slider as the live control. Use the native RTF above as a ceiling: a browser or a phone will be slower than 4.0× realtime, and a 4-minute song should be presented as a wait, not as an effect knob.

## Open questions

1. When the queue is empty, should Next keep walking the library (this plan) or stop at the end of the queue like a KTV machine? Stopping is clearer once people use 點歌. Keeping library-next avoids a behavior change for today’s users.
2. 插播 while a song is playing: start the new song immediately, or insert it and finish the current one? KTV 插播 usually starts now. That should be the default, and the interrupted song goes to the front of up-next.
3. Remote `playTrack` today means “play now”. Should party mode keep that for the host and make everyone else `enqueue` only? Recommendation: yes. A guest tap appends. 插播 is an explicit button, and only the playback device (or the host) can use it.
4. Is the party queue something Ryo wants in the first release, or is solo 點歌 enough? The local queue is useful alone. The session work is a second project.
5. Should a personal queue follow the account via Cloud Sync? Recommendation: no, until someone actually runs Karaoke on two devices and misses the list. The library already syncs.
6. For a user file, how are lyrics chosen? Recommendation: the user picks an existing library song to bind, and the file replaces only the audio. Unbound files play with no lyrics.
7. May pitch and vocal be used during Listen Together? Recommendation: only on the DJ, and only if every other client is remote-only for that item. Otherwise disable the controls while a session is active.
8. Rubber Band’s GPL and the App Store. Confirm with counsel before any native link. The web-only WASM path is the one that matches AGPL. A commercial Rubber Band license is the alternative if the iOS binary ever vendors it.
9. Is a “reduce center” slider worth the support cost if people expect Apple Music Sing? Recommendation: ship it only together with a one-line description of what it actually does, and do not market it as vocal removal.
10. Path B is not recommended. The remaining decision is whether a private, Ryo-only experiment is worth a metadata probe from the production Hetzner egress. If that probe hits the bot wall, the experiment is over.

## Risks

**Legal.** Server-side YouTube audio is the risk that dominates the other two features. Embedding via the IFrame player is the licensed path the app already uses. Copies, proxies, and cached instrumentals of those videos are not. User-picked files processed locally stay on the right side of that line as long as the server does not retain the bytes. Apple Music DRM is not a workaround.

**Cost.** A queue is Redis and UI, inside the current Coolify app. A stem cache is object storage (cheap) plus CPU or GPU (not cheap, and idle GPUs dominate). In-browser Demucs is a 100 MB+ download and a long wait on a phone, paid by the user in battery. None of that is required for the MVP.

**Quality.** Tone’s `PitchShift` will be rejected by anyone singing to it. SoundTouch is the minimum that should be demoed. Center cancel will be called “broken” on any track whose vocal is not dead-center; the UI has to say so. Demucs is the quality people mean by 去人聲, and it is not realtime on a phone.

**Performance.** The YouTube path stays as it is for queued YouTube songs: no extra memory, no change to the 200 ms lyric tick. A file graph has to stay off the React render path (worklet or element, with `elapsedTime` still throttled by `shouldUpdatePlaybackTime`). Demucs on the main thread would stall the desktop. COEP for threaded WASM would break YouTube and MusicKit sign-in if it were applied to the app origin.

**Product interactions.**

- Lyric offset is a shared, persisted calibration. Processor latency must not be saved into it, or every other device’s lyrics jump.
- Furigana follows word timings. It stays correct if the lyric timeline is still the file timeline.
- Listen-together soft sync writes YouTube `playbackRate`. A file player must not implement that nudge as a rate change or the key will drift. Hard-seek only, or run the nudge as a tiny tempo change inside the pitch library with pitch compensated back.
- The iOS autoplay watchdog and the window-close `setIsPlaying(false)` assume progress events and a player that honors `playing`. A file player has to do both, including on the WKWebView.
- Minimized Karaoke keeps playing (`keepMountedWhenMinimized`). Queue advancement must keep running while minimized.
- iPod and Karaoke can be open together and play different songs. The queue must not retarget `useIpodStore` transport.
- Anonymous listen-together clients play their own YouTube copy. A transposed DJ will not match them.

## What was checked

Code as in this tree: Karaoke and iPod stores, `YouTubePlayer`, `AppleMusicPlayerBridge`, listen-session contracts and the remote-command route, lyrics types and the karaoke lyric clock, cloud-sync `songs` codec, song Redis layout, the iOS WKWebView and `AudioSessionController`, `electron/main.ts`, and security headers. Tone’s `PitchShift` was read from the installed `tone` package.

The follow-up measured `demucs` 4.1.0 / PyTorch 2.14.1+cpu on a 30 s synthetic clip (ffmpeg sines plus noise), `htdemucs` at 4 and 2 threads and `htdemucs_ft` at 4 threads. No GPU was available. A logged-out `yt-dlp` 2026.10.21 metadata request was made from this VM’s AWS us-east-1 address and was rejected as a bot; no media file was saved and no cookies were supplied. That address is not Hetzner. Hetzner GEX45 and Object Storage prices were read from Hetzner’s public pages on 22 Oct 2026. Browser ONNX sizes were not re-downloaded. No separation library was added to the app.
