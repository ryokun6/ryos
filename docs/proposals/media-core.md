# MediaCore — Playback Engine & Media Control Consolidation

Status: **proposal** (not started)

ryOS ships five media apps — iPod, Karaoke, Videos, TV, Winamp — that share one
product concept (pick media, play it, show lyrics/transport) but implement it
five times. This proposal consolidates the domain into a shared engine
(**MediaCore**), a unified library model, and a single AI `mediaControl` tool,
while keeping every retro app shell and icon exactly as it is today.

Companion to `next-improvements.md` §2.1 (iPod decomposition, started),
§2.5 (media menu factory), and §5.4 (cross-device handoff, which this unblocks).

- [1. Current state](#1-current-state)
- [2. Goals and non-goals](#2-goals-and-non-goals)
- [3. Target architecture](#3-target-architecture)
- [4. Phased plan](#4-phased-plan)
- [5. Risks](#5-risks)
- [6. Test strategy](#6-test-strategy)
- [7. Success criteria](#7-success-criteria)

---

## 1. Current state

### 1.1 Five transports, one tiny shared layer

Each app hand-rolls the same transport state machine on its own store:

| App | Store | Transport fields (duplicated) | Player |
|-----|-------|-------------------------------|--------|
| iPod | `useIpodStore` (2,700 lines, persist v42) | `currentSongId`, `playbackRequested`, `isPlaying`, `loopCurrent/loopAll/isShuffled`, `playbackHistory`, `elapsedTime/totalTime` | `YouTubePlayer` (ReactPlayer) + `AppleMusicPlayerBridge` (MusicKit) |
| Karaoke | `useKaraokeStore` (v3) | same set, independent copy | `YouTubePlayer` |
| Videos | `useVideoStore` (v8) | same set minus history | `YouTubePlayer` |
| TV | `useTvStore` (v5) | `currentChannelId`, `playbackRequested`, `isPlaying`, `playedSeconds` | `YouTubePlayer` |
| Winamp | local React state | `isPlaying` | Webamp + `utils/youtubeMedia.ts` (raw IFrame API) |

The only shared pieces are `src/shared/media/` (7 files, ~264 lines:
`confirmedPlayback.ts`, `previousTrackBehavior.ts`, lyrics policy helpers) and
`src/components/shared/YouTubePlayer.tsx`. Everything else — next/previous
logic, track-switch guards, window-close pause, progress handling, fullscreen —
is copied per app inside `useIpodLogic.ts` (~5,500 lines), `useKaraokeLogic.ts`
(~2,000), `useVideosLogic.ts` (~1,040), `useTvLogic.ts` (~560).

There is **no cross-app arbitration**: nothing pauses the iPod when Videos
starts playing. Each app only pauses itself when its own window closes.

### 1.2 Three library silos plus projections

- iPod `tracks: Track[]` (plus the Apple Music sidecar) is the canonical music
  library; Karaoke, Winamp, and TV's MTV channel all read it directly from
  `useIpodStore`.
- `useVideoStore.videos: Video[]` is a separate library with a `Video` type
  that is a strict subset of `Track` (`id`, `url`, `title`, `artist?`).
- TV `customChannels[].videos` embeds `Video[]` copies inside channel objects.
- `useMediaLibraryStore` is already an alias of `useIpodStore` — the rename
  target exists, but there is no unified store behind it.

### 1.3 Three AI tools with a fourth already half-shared

`ipodControl`, `karaokeControl`, and `tvControl` have parallel client handlers
(`src/apps/chats/tools/ipodHandler.ts` 472 lines, `karaokeHandler.ts` 470,
`tvHandler.ts` 687). On the server, `api/chat/tools/schemas.ts` already shares
`createMediaControlSchema()` between iPod and Karaoke — the consolidation is
half-done at the schema layer and not started at the handler layer. Videos and
Winamp have **no** AI control at all.

### 1.4 Listen Together is Karaoke-only

`usePlaybackListenSync` / `broadcastListenState` (in
`src/shared/media/playbackListenSync.ts`) are wired only into
`useKaraokeLogic`. iPod merely joins sessions from deep links; Videos and TV
have nothing. Any future "continue on another device" feature hits the same
wall: playback state has no app-agnostic shape to serialize.

---

## 2. Goals and non-goals

**Goals**

1. One transport state machine, instantiated per app from a factory — delete
   four hand-rolled copies.
2. One `MediaItem` library model with `kind: "song" | "video"`, one real
   `useMediaLibraryStore`, no wire-format change to Cloud Sync v2.
3. One `mediaControl` AI tool covering iPod, Karaoke, Videos, TV, and Winamp —
   delete ~1.6k lines of parallel client handlers and close the Videos/Winamp
   coverage gap.
4. Single-active-playback arbitration and a now-playing bus (replaces the
   precedence hacks in `useNowPlayingCover` / `useNowPlayingLyrics`).
5. Leave playback state serializable so §5.4 handoff and generalized Listen
   Together become small follow-ups instead of rewrites.

**Non-goals**

- No app merging. iPod, Karaoke, Videos, TV, and Winamp keep their shells,
  icons, themes, and registry entries. Winamp stays a Webamp wrapper.
- No visual redesign of any app.
- No sync schema migration. `songs/*`, `videos/*`, `tv/*` namespaces keep their
  exact key shapes and payloads (see §4 Phase 3).
- Apple Music stays an iPod-scoped source adapter; no attempt to expose it in
  Videos/TV/Karaoke.
- The iPod wheel/menu UI (`rebuildMenuItems`, cover flow, games — roughly
  lines 753–3785 and 4137–4750 of `useIpodLogic.ts`) is iPod chrome and stays
  in the app. Only transport, lyrics wiring, and library access move out.

---

## 3. Target architecture

```
src/shared/media/                      (grows from ~264 lines into MediaCore)
├── transport.ts        createTransportSlice() — zustand slice factory:
│                       currentId, playbackRequested, isPlaying, loop*,
│                       isShuffled, playbackHistory, elapsed/total time,
│                       next/previous/togglePlay/confirmPlayback
├── adapters/
│   ├── types.ts        MediaSourceAdapter: load(item), play, pause, seekTo,
│   │                   getCurrentTime, events (onPlay/onEnded/onProgress/onError)
│   ├── youtube.ts      wraps YouTubePlayer/ReactPlayer refs (iPod, Karaoke,
│   │                   Videos, TV)
│   ├── appleMusic.ts   wraps AppleMusicPlayerBridge (iPod only)
│   └── webamp.ts       wraps utils/youtubeMedia.ts (Winamp)
├── nowPlaying.ts       useNowPlayingStore: { appId, item, transport } — the
│                       single answer to "what is playing right now"
├── arbitration.ts      single-active-playback policy: starting transport A
│                       pauses transport B (opt-out per app if ever needed)
├── library.ts          MediaItem (kind: "song" | "video"), selectors,
│                       artist/album grouping (moves from useIpodLogic memos)
└── (existing files stay: confirmedPlayback, previousTrackBehavior,
    lyrics* policy modules, playbackListenSync)

src/stores/useMediaLibraryStore.ts     becomes a real store owning
                                       songs + videos; useIpodStore keeps
                                       Apple Music sidecar + iPod UI prefs
```

Apps keep their own stores for chrome/prefs (backlight, LCD filter, KTV FX,
channel lineup) but compose their transport from `createTransportSlice()` and
play through an adapter. The AI layer talks to `nowPlaying` + transports, not
to app internals.

---

## 4. Phased plan

Every phase is independently shippable and lands as its own PR (or small PR
series). Ordering minimizes risk: pure extraction first, the invasive library
move in the middle guarded by tests, deletions last.

### Phase 0 — Guardrails (small, do first)

Add regression tests that pin current behavior before anything moves:

- Transport parity tests: for each of the four stores, assert the
  `playbackRequested → confirmPlayback → isPlaying` lifecycle, next/previous
  with shuffle/loop/history, and the previous-restarts-after-3s rule
  (extends `test-confirmed-playback-state`, `test-ipod-playback-navigation`).
- Snapshot the three AI tool schemas (`ipodControl`, `karaokeControl`,
  `tvControl`) action enums so Phase 5 aliasing is provably compatible
  (extends `test-tv-control-schema`).
- Listen Together contract test for the DJ/listener flow through
  `usePlaybackListenSync` (extends `test-listen-sync-adapter`).

Subsystems touched: `tests/` only.

### Phase 1 — Transport slice factory

Extract the duplicated transport state machine into
`src/shared/media/transport.ts` as a zustand slice factory, then adopt it in
`useVideoStore` and `useKaraokeStore` first (smallest, no Apple Music), then
`useTvStore` (channel-indexed variant), then `useIpodStore` (dual-source:
YouTube + Apple Music queue).

- Persist versions bump per store with a trivial migrate (field names are kept
  identical, so most stores need no data migration at all).
- `confirmedPlayback.ts` folds into the factory; its exports remain for the
  transition.
- No behavior change; the parity tests from Phase 0 must pass unmodified.

Subsystems touched: 4 stores, `src/shared/media/`. Invasiveness: mechanical,
medium surface, low semantic risk.

### Phase 2 — Source adapters, now-playing bus, arbitration

1. Define `MediaSourceAdapter` and wrap the three engines
   (ReactPlayer refs, `AppleMusicPlayerBridge`, Winamp's `youtubeMedia.ts`).
   The per-app `getActivePlayer` ref juggling in `useIpodPlayback` /
   `useKaraokeLogic` / `useVideosLogic` collapses into adapter instances.
2. Ship `useNowPlayingStore` and rewrite `useNowPlayingCover` /
   `useNowPlayingLyrics` / `DesktopLyricsWallpaperLayer` to read it instead of
   probing iPod-then-Karaoke precedence.
3. Ship `arbitration.ts`: starting playback in any transport pauses the
   others. This is the first user-visible improvement (today two apps can play
   over each other) and it needs the bus to exist.

Subsystems touched: `src/shared/media/`, `src/hooks/useNowPlaying*`,
playback wiring in 5 apps. Invasiveness: medium; the Apple Music adapter is
the risky corner (see §5).

### Phase 3 — Unified library (the invasive one)

Make `useMediaLibraryStore` a real store owning `MediaItem`s of both kinds.
`Track` extends `MediaItem` (song-specific fields: `album`, `cover`,
`lyricOffset`, `lyricsSource`, `appleMusic*`, …); `Video` maps 1:1 onto the
base type.

Wire-format rule: **sync keys and payloads do not change.** `songsCodec` and
`videosCodec` in `src/sync/codecs.ts` keep emitting `songs/track:{id}`,
`songs/lib`, `videos/video:{id}`, `videos/lib` exactly as today — only their
collect/apply bindings repoint to the new store. `test-sync-v2-codecs` and
`test-songs-tombstone-sync` guard this; add a fixture asserting byte-identical
codec output before/after.

Consumers to repoint (complete list from the domain map):

- `src/sync/codecs.ts` (`songsCodec`, `videosCodec`) and the
  `songTrackIds` deletion-marker path in `useCloudSyncStore`
- `src/services/vfs/virtualTrees.ts` + `useFileSystem.ts` (`/Music`,
  `/Videos` virtual folders)
- Karaoke library reads (`getCurrentTrack()` against iPod `tracks`)
- Winamp playlist build in `WinampAppComponent.tsx`
- TV's MTV projection (`trackToVideo()` in `useTvLogic.ts`)
- `api/_utils/song-library-state.ts` (imports `Track` from `useIpodStore` —
  move the type to `src/shared/media/library.ts` and repoint)
- iPod library grouping memos (move artist/album grouping into
  `library.ts` selectors; iPod menus consume selectors)

`useIpodStore` keeps: Apple Music sidecar state, lyrics/display prefs, iPod UI
state, and re-exports (`getIpodTracksForLibrary` etc.) as thin wrappers until
Phase 6 deletes them. Repo precedent favors direct cutover (Cloud Sync v2)
over long compatibility windows, so wrappers live for one phase only.

Subsystems touched: 2 stores, sync codecs, VFS, 4 apps, 1 server util.
Invasiveness: high — this is the phase to split into 2–3 PRs (store + codecs
first, consumers second).

### Phase 4 — Move generic logic out of the app hooks

With transport, adapters, and library shared, strip the generic clusters out
of the god hooks:

- `useIpodLogic.ts`: playback handlers (~lines 3974–4135), track-change
  effects (~1354–1421), library grouping memos (~1423–2100) move to MediaCore;
  the hook keeps wheel/menu/games/Apple Music UI. Continues
  `next-improvements.md` §2.1 with a concrete destination for each cluster.
- `useKaraokeLogic.ts`: transport + track-switch guard + library update
  checker come from MediaCore; the hook keeps KTV FX, fullscreen lyrics UX,
  and Listen Together DJ logic (until Phase 7).
- `useVideosLogic.ts` / `useTvLogic.ts`: same treatment; TV keeps channel
  lineup + shuffle-cache logic.
- Extract the media menu factory (§2.5): one `createMediaMenuBar()` view-model
  consumed by the four `use*MenuBar.ts` files, built on the already-shared
  `MediaControlsMenu` / `LibraryTrackBrowser` / `MediaLyricsViewMenuItems`.

Subsystems touched: 4 app logic hooks, 4 menu bars. Invasiveness: medium,
highly parallelizable (one app per PR).

### Phase 5 — Unified `mediaControl` AI tool

Server:

- Add a `mediaControl` tool in `api/chat/tools/schemas.ts` with
  `target: "music" | "karaoke" | "videos" | "tv" | "winamp"` plus the existing
  action enum from `createMediaControlSchema` and TV's channel actions
  (`tune`, `createChannel`, `addVideo`, …) as a target-gated union.
- Keep `ipodControl` / `karaokeControl` / `tvControl` registered as aliases
  that normalize into `mediaControl` calls for one release, then remove (the
  system prompt and `docs/4-ai-system.md` switch to `mediaControl`
  immediately, so aliases only serve stale cached prompts).
- `songLibraryControl` (Telegram profile, server-side) is unchanged.

Client:

- One `src/apps/chats/tools/mediaHandler.ts` dispatching to
  `useNowPlayingStore` + transports + library selectors. Delete
  `ipodHandler.ts`, `karaokeHandler.ts`, `tvHandler.ts` (~1.6k lines) and the
  three dispatch branches in `useAiChat.ts`.
- New coverage for free: `target: "videos"` and `target: "winamp"` work
  because they are just transports on the bus.

Subsystems touched: `api/chat/tools/`, `src/apps/chats/tools/`, `useAiChat.ts`,
`docs/4-ai-system.md`. Invasiveness: medium; fully guarded by
`test-chat-tools-songs`, `test-tv-control-schema` snapshots, and `test:ai`.

### Phase 6 — Deletions and cleanup

- Remove the Phase 3 compatibility wrappers on `useIpodStore`.
- Remove per-app copies of window-close-pause, track-switch guards, progress
  throttling superseded by MediaCore.
- Remove legacy `/Music Library`, `/Video Library` flat paths in
  `useFileSystem.ts` (already unused by menu shortcuts).
- Update `docs/2-apps.md`, `docs/4-ai-system.md`, `docs/5-file-system.md`.

### Phase 7 (follow-up bets, out of scope but unblocked)

- **Listen Together generalization**: `usePlaybackListenSync` targets a
  transport interface instead of Karaoke internals → works for iPod/Videos/TV.
- **Cross-device handoff** (`next-improvements.md` §5.4): serialize
  `useNowPlayingStore` + transport state through the existing sync ops
  channel; "continue on this device" becomes a small affordance.
- **TV channels as playlists** over the unified library, removing embedded
  `Video[]` copies inside `customChannels`.

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| **Apple Music playback races** — the recurring bug class in this area lives in `AppleMusicPlayerBridge` + dual-queue logic in `useIpodStore`. Wrapping it in an adapter can reintroduce races. | Adapter wraps the bridge without changing its internals in Phase 2; dual-source queue unification is explicitly deferred. Add race regression tests before wrapping (Phase 0). |
| **iPod is the most-touched user-facing app.** | iPod adopts each phase **last**, after Karaoke/Videos/TV prove the seam. `test-ipod-*` suites gate every PR. |
| **Sync corruption on the library move** (Phase 3) — tombstones (`songTrackIds`), `songs/lib` ordering, and the suspicious-mass-delete guard in `src/sync/engine.ts` all key off current store shapes. | Byte-identical codec fixture test; phase lands behind `test:sync-v2` + `test-songs-tombstone-sync`; store move and codec repoint in the same PR so no intermediate state exists. |
| **Deep links and share URLs** (`processVideoId`, `listenSessionId` joins, `/Music/{id}` VFS opens) route through app-specific entry points. | Enumerate entry points in Phase 3 PR description; add wiring tests per link type. |
| **AI prompt regressions** — models may keep calling `ipodControl` from cached instructions. | Alias window in Phase 5; server normalizes old names; `test:ai` covers both names during the window. |
| **Winamp/Webamp impedance** — Webamp owns its own UI event loop. | Winamp adapter is read-mostly (report state to the bus, accept play/pause); full transport adoption is optional and can be dropped without affecting other phases. |

---

## 6. Test strategy

- **Unit/wiring (no server):** transport factory parity, adapter contract
  tests, now-playing precedence, arbitration policy, menu factory view-models.
  Run per-suite in isolation (known aggregate-run pollution, see AGENTS.md).
- **Sync:** `bun run test:sync-v2` plus the new byte-identical codec fixture.
- **API/AI:** `bun run dev:api` + `bun run test:ai` and
  `bun test tests/test-chat-tools-songs.test.ts` for the tool consolidation.
- **Manual:** each phase that touches playback gets a manual pass — play in
  iPod, switch to Videos (arbitration pauses iPod), Karaoke fullscreen lyrics,
  TV tune, Winamp playlist load, AI `mediaControl` round-trips via Chats.

## 7. Success criteria

- Net LOC: the five-app media cluster (~45k lines incl. stores and tool
  handlers) shrinks by roughly 6–9k lines; `useIpodLogic.ts` drops below
  ~3k; `ipodHandler/karaokeHandler/tvHandler` are deleted.
- One transport implementation; zero copies of the confirm-playback lifecycle
  outside `src/shared/media/`.
- `Ryo, play <x> in Videos` and Winamp control work (currently impossible).
- Starting playback in one app pauses the others.
- Sync wire format provably unchanged (fixture test).
- All existing `test-ipod-*`, `test-karaoke-*`, `test-tv-*`, listen, and sync
  suites pass unmodified except where behavior intentionally improved
  (arbitration).
