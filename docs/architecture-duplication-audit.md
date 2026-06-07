# ryOS Architecture Duplication Audit

**Date:** 2026-06-07  
**Scope:** Frontend apps/components/hooks/stores, API routes/utilities, cross-cutting shared boundaries  
**Goal:** Identify duplicated code paths and unnecessary complexity that could be simplified without changing product behavior.

---

## Executive Summary

ryOS is mid-migration toward consolidation. Strong foundations exist (`apiHandler`, `AppWindowShell`, `MediaControlsMenu`, cloud-sync utilities imported from `src/utils/` into `api/`). The highest-cost debt clusters in:

1. **Media domain** — parallel iPod/Karaoke/Video/TV playback stacks and megastore/megahook files
2. **Cross-layer type drift** — AI models, chat rooms, listen sessions duplicated across frontend and API
3. **AI tool dual execution** — browser client handlers vs server executors for the same tool contracts
4. **Cloud sync choke point** — `sync/domains.ts` (~2,350 lines) touches every app store
5. **One immediate data-integrity bug** — `ryos:pc` localStorage key collision between `usePcStore` and `useInfinitePcStore`

This document ranks findings by ROI, proposes target architectures, and sequences migration phases.

---

## Top 10 Concrete Findings

### 1. `ryos:pc` localStorage key collision (P0 — data integrity)

| File | Role |
|------|------|
| `src/stores/usePcStore.ts` L90 | Persists jsDOS game library (`{ games: Game[] }`) under `ryos:pc` |
| `src/stores/useInfinitePcStore.ts` L379 | Also uses `ryos:pc` with `partialize: () => ({})` — can clobber game data on rehydrate |

**Action:** Remove useless persist from `useInfinitePcStore` (nothing was persisted anyway) or rename to `ryos:infinite-pc`. **Fixed in this PR.**

---

### 2. iPod ↔ Karaoke parallel media stacks (P1 — ~8k+ lines)

| Layer | iPod | Karaoke | Overlap |
|-------|------|---------|---------|
| Logic hook | `useIpodLogic.ts` (~5,458 lines) | `useKaraokeLogic.ts` (~1,900 lines) | Playback, lyrics, listen sessions, fullscreen |
| Library store | `useIpodStore.ts` (~2,640 lines) | `useKaraokeStore.ts` reads same library | `loopAll`, `isShuffled`, `isPlaying`, `displayMode` FSM |
| Menu bars | `ipod-menu-bar/*` | `karaoke-menu-bar/*` | Both use `MediaControlsMenu`, `MediaLyricsViewMenuItems` |
| Visual layers | `IpodScreenMediaOverlay.tsx` | `KaraokeVisualLayers.tsx` | Identical `DisplayMode` → background switch |
| AI tools | `chats/tools/ipodHandler.ts` | `chats/tools/karaokeHandler.ts` | ~80% shared; karaoke re-implements fuzzy search |
| Fullscreen | `FullScreenPortal.tsx` | imports iPod portal | Karaoke depends on iPod path |

**Consolidation target:** `useMediaPlayback` hook + `MediaVisualLayers` component + shared fullscreen shell. Lyrics prefs should live in a dedicated store slice, not embedded in `useIpodStore`.

---

### 3. AI model registry duplicated (P0 — documented drift risk)

| Location | Contents |
|----------|----------|
| `src/types/aiModels.ts` | `AI_MODELS`, `SUPPORTED_AI_MODELS`, `DEFAULT_AI_MODEL`, `AI_MODEL_METADATA` |
| `api/_utils/_aiModels.ts` L7–8 | Comment: *"duplicated from src/types/aiModels.ts"* + `getModelInstance` provider factory |

Adding a model today requires editing both files. API avoids cross-dir imports due to Vite build concerns.

**Consolidation target:** `shared/contracts/ai-models.ts` (dependency-light package) imported by both layers.

---

### 4. YouTube search implemented 3× on server (P1 — API)

| File | Pattern |
|------|---------|
| `api/youtube-search.ts` | Key rotation, quota handling, snippet mapping |
| `api/tv/create-channel.ts` (`searchOneQuery`) | Same pattern |
| `api/chat/tools/executors.ts` (`executeSearchSongs`) | Same pattern |

**Consolidation target:** `api/_utils/youtube-client.ts` with shared `searchVideos()`.

---

### 5. Dual AI tool execution paths (P1 — web vs Telegram)

| Client (browser) | Server (Telegram/sync) |
|------------------|------------------------|
| `src/apps/chats/tools/calendarHandler.ts` | `api/chat/tools/executors.ts` `executeCalendarControl` |
| `stickiesHandler.ts` | `executeStickiesControl` |
| `contactsHandler.ts` | `executeContactsControl` |
| `useAiChat.ts` — parallel `switch` dispatch | `api/chat/tools/index.ts` Telegram profile |

Additionally, `src/apps/chats/tools/index.ts` defines `registerToolHandler` / `executeToolHandler` registry with **zero callers** outside that file — handlers are registered but `useAiChat` bypasses the registry.

**Consolidation target:** Shared pure action cores in `shared/` + thin client/server adapters. Wire registry or delete it.

---

### 6. Chat room types in 5+ places (P0 — cross-cutting)

| Concept | API canonical | Frontend duplicates |
|---------|---------------|---------------------|
| `RoomType`, `Room`, `Message`, `User` | `api/rooms/_helpers/_types.ts` | `src/types/chat.ts`, `src/api/rooms.ts`, admin local types |
| IRC metadata fields | `_types.ts` | Copy-pasted across all above |

**Consolidation target:** `shared/contracts/chat-rooms.ts`.

---

### 7. `sync/domains.ts` god module (P1 — ~2,350 lines)

Directly calls 15+ Zustand stores for serialize/apply across all cloud-sync domains. Any sync bug can corrupt unrelated apps. Parallel server paths in `api/chat/tools/executors.ts` write same Redis keys.

**Consolidation target:** Per-domain modules (`sync/domains/{files,ipod,settings,...}.ts`) + shared snapshot types in `shared/contracts/sync-snapshots.ts`.

---

### 8. VFS split across four layers (P1 — Finder)

| Layer | File | ~Lines |
|-------|------|--------|
| Metadata | `useFilesStore.ts` | ~1,750 |
| Action/routing | `useFileSystem.ts` | ~2,242 |
| Window/nav UI | `useFinderStore.ts` + `useFinderLogic.ts` | ~1,657 |
| Per-app content | `useTextEditStore.ts`, IndexedDB | — |

**Consolidation target:** `lib/vfs/` with Finder as UI-only client. Document metadata vs content vs routing boundary.

---

### 9. Burst/daily rate-limit copy-paste (P2 — API)

Same `BURST_WINDOW`/`DAILY_WINDOW`/`makeKey`/`checkCounterLimit` pattern in:

- `api/speech.ts`, `api/parse-title.ts`, `api/audio-transcribe.ts`
- `api/youtube-search.ts`, `api/tv/create-channel.ts`
- `api/iframe-check.ts`, `api/ie-generate.ts`, `api/applet-ai.ts`

**Consolidation target:** `checkBurstDailyLimits(req, { prefix, burst, daily })` in `api/_utils/_rate-limit.ts`.

---

### 10. Apple token endpoints + PEM parsing duplicated (P2 — API)

| Duplication | Files |
|-------------|-------|
| JWT handler shape | `api/mapkit-token.ts`, `api/musickit-token.ts` — nearly identical |
| PEM private-key parsing | `api/_utils/_mapkit-jwt.ts`, `api/_utils/_musickit-jwt.ts` — MusicKit reimplements ~80 lines |

**Consolidation target:** `api/_utils/apple-dev-token-handler.ts` + reuse `parseMapKitPrivateKey` in MusicKit.

---

## Additional Notable Findings

### Frontend

- **Playback FSM duplicated** across `useVideoStore`, `useKaraokeStore`, `useIpodStore`, `useTvStore` (~200–400 lines each)
- **Infinite Mac ↔ Infinite PC twins** — parallel preset catalogs, logic hooks, UI components (~300–500 lines recoverable)
- **Two fullscreen portals** — `FullScreenPortal.tsx` (iPod/Karaoke) vs `VideoFullScreenPortal.tsx` (Videos/TV)
- **28 Zustand stores** with inconsistent persist key naming (`ryos:*` vs `*-storage`)
- **Naming collisions:** `useAppStore` (window manager) vs `apps/applet-viewer/.../useAppStore.ts` (Applet Store VM); `DisplayMode` in `types/lyrics.ts` vs `utils/displayMode.ts`
- **Dead/legacy paths:** `apps/pc/` (no app component, consumed only by infinite-pc), Minesweeper local `useLongPress` shadowing shared hook, `utils/chunkedStream.ts` deprecated aliases

### API

- **`api/songs/[id].ts`** (~1,725 lines) — metadata, lyrics, translate/furigana/soramimi streaming in one file
- **`api/chat/tools/executors.ts`** (~2,140 lines) — server-side god module
- **Double auth resolution** in `admin.ts`, `share-applet.ts`, listen routes despite `apiHandler` auth options
- **Redundant Redis** — airdrop/presence routes call `createRedis()` despite `apiHandler` injecting `redis`
- **Four admin-gate expressions** — `username === "ryo"`, `isAdmin`, `validateAdminAuth`, `CURSOR_REPO_AGENT_OWNER`
- **`CHAT_USERS_PREFIX`** defined in `api/_utils/auth/_constants.ts`, `api/rooms/_helpers/_constants.ts`, `scripts/seed-dev-users.ts`
- **Memory pipeline overlap** — `api/ai/extract-memories.ts` and `api/ai/process-daily-notes.ts` share consolidation schema
- **Possibly unused:** `api/auth/tokens.ts` (no `src/` references found)

### Cross-cutting (already partially shared — good pattern)

API imports from `src/utils/`: `cloudSyncShared`, `cloudSyncVersion`, `cloudSyncFileMerge`, `cloudSyncSettingsMerge`, `contacts`, `furigana`, `syncLogicalDomains`. Formalize as `shared/` package with inverted dependency direction.

---

## Paths That Can Be Deleted or Consolidated

| Path / pattern | Action | Risk |
|----------------|--------|------|
| `useInfinitePcStore` persist on `ryos:pc` | Remove persist (empty `partialize`) | Low — **done** |
| Duplicate admin `Skeleton.tsx` | Single `admin/components/shared/Skeleton.tsx` | Low — **done** |
| Chat tool registry (`executeToolHandler` etc.) | Wire into `useAiChat` or delete registry | Low |
| `api/_utils/_musickit-jwt.ts` PEM parser | Delete; use `parseMapKitPrivateKey` | Low |
| `mapkit-token.ts` + `musickit-token.ts` bodies | Replace with shared handler | Low |
| YouTube search in 3 files | Single `youtube-client.ts` | Low |
| Burst/daily rate-limit blocks | Single helper | Low |
| `parseStoredJson` in cursor-run-status | Use `parseJSON` from redis-helpers | Low |
| `useInfiniteMacLogic` local `useReducer` | Use zustand store only | Low–medium |
| Minesweeper local `useLongPress` | Import shared `@/hooks/useLongPress` | Low |
| `apps/pc/` directory | Fold into `apps/infinite-pc/` | Medium |
| `src/apps/chats/tools/karaokeHandler.ts` fuzzy search | Extract shared with ipodHandler | Medium |
| iPod/Karaoke visual layer switch | `MediaVisualLayers` component | Medium |
| Playback FSM in 4 stores | `createPlaylistStore<T>()` | Medium |
| `api/songs/[id].ts` | Split by concern (metadata, lyrics, streams) | Medium |
| `sync/domains.ts` | Per-domain modules | Medium–high |
| `useIpodLogic.ts` | Feature sub-hooks | High |
| Dual calendar/contacts/stickies tool implementations | Shared action core | High |

---

## Proposed Target Architecture

### Frontend shell (thin)

```
AppManager · MenuBar/Dock · WindowFrame · AppWindowShell
useAppStore (instances only) · useThemeStore · useDockStore
```

### Domain modules

```
┌─────────────┐  ┌──────────────────┐  ┌─────────────────┐
│ Settings     │  │ Media domain      │  │ VFS domain       │
│ theme/display│  │ library (tracks)  │  │ files metadata   │
│ audio/cloud  │  │ playback FSM      │  │ indexedDB blobs  │
│ sync UI      │  │ lyrics prefs      │  │ finder nav state │
└─────────────┘  │ visual layers     │  └─────────────────┘
                 └──────────────────┘
```

**App convention:** `metadata` + `*AppComponent` + `use*AppController` + optional `use*MenuBar` — no logic hooks > ~800 lines.

### API layer (thin routes → domain services → infrastructure)

```
Route handlers (thin, 100% apiHandler)
    ↓
api/services/  — youtube, apple-auth, memory, songs, sync-domains, cursor-agent, ai-generate
    ↓
api/_utils/    — redis, storage, realtime, request-auth, rate-limit (trimmed)
    ↓
Integrations   — AI SDK, @cursor/sdk, YouTube, Apple APIs, OpenAI/ElevenLabs
```

**Tool execution split (explicit registry):**

- Browser-required tools → client handlers (`src/apps/chats/tools/*`)
- Data/sync tools → `api/services/*` called from executors
- Hybrid (e.g. TV createChannel) → single service used by route + future server executor

### Shared package (`@ryos/shared`)

```
shared/
├── contracts/     # Pure types + const arrays (ai-models, chat-rooms, listen, songs, sync-snapshots)
├── validation/    # Zod schemas (chat-rooms, songs, tools/*)
├── normalization/ # lyrics-parse, cover-art, youtube-id, language-detection
└── sync/          # Relocate cloudSync* from src/utils (re-export during migration)
```

**Import rules:** `shared/` imports nothing from `src/` or `api/`. Provider factories (`getModelInstance`) stay in `api/_utils/`.

---

## Risk Levels and Migration Sequence

### Phase 0 — Baseline (immediate)

- Run `bun run test:unit` + `bun run test:api`
- Fix `ryos:pc` collision ✅
- Document findings (this file) ✅

### Phase 1 — Quick wins (days, low risk)

| Item | Files | Tests |
|------|-------|-------|
| AI model shared contract | `src/types/aiModels.ts`, `api/_utils/_aiModels.ts` | `bun run test:ai` |
| YouTube client extraction | 3 API files | `bun run test:media` |
| Apple token handler + PEM reuse | mapkit/musickit token + jwt utils | smoke token endpoints |
| Burst/daily rate-limit helper | 8 API files | existing API tests |
| Chat tool registry wire-or-delete | `tools/index.ts`, `useAiChat.ts` | `bun run test:ai` |
| Admin skeleton dedup ✅ | admin panels | visual only |
| `requireRyoAdmin` helper | admin, cursor-run-status | `bun run test:admin` |
| Use `ctx.redis` in airdrop/presence | 4 routes | `bun run test:new-api` |

### Phase 2 — Contract unification (1–2 weeks, medium risk)

| Item | Risk | Tests |
|------|------|-------|
| `shared/contracts/chat-rooms.ts` | Low–medium | `bun run test:new-api` |
| `shared/contracts/listen.ts` | Medium | `bun run test:listen-security` |
| `shared/contracts/songs.ts` | Medium | `bun run test:song` |
| Split `api/chat/tools/schemas.ts` by domain | Low | `bun run test:ai` |
| Extract pure helpers from `executors.ts` | Low | `test-web-fetch`, `test-server-app-state-tools` |
| `MediaVisualLayers` + playback store abstraction | Medium | `test-ipod-*`, manual playback |
| Unified fullscreen portal | Medium | manual iPod/Karaoke/Video/TV |

### Phase 3 — Sync modularization (1–2 weeks, medium–high risk)

| Item | Risk | Tests |
|------|------|-------|
| Per-domain `sync/domains/*.ts` | Medium | `test-cloud-sync-*` |
| `shared/contracts/sync-snapshots.ts` | High | full sync suite |
| Shared tool-action core (calendar/contacts/stickies) | Medium–high | Telegram + chat tests |
| Thin `useAutoCloudSync` | Medium | sync regression |

### Phase 4 — VFS + settings (1 week each, medium risk)

| Item | Risk | Tests |
|------|------|-------|
| `lib/vfs/` extraction from Finder | Medium | `test-finder-*` |
| Split `useControlPanelsLogic` by tab | Medium | `test-control-panels-*` |
| Slice `useChatsStore` (auth/rooms/ai) | Medium | `test-chat-*` |

### Phase 5 — Media god modules (2–3 weeks, high risk — do last)

| Item | Risk | Tests |
|------|------|-------|
| Split `useIpodStore` (library, lyrics, Apple Music) | High | `test-ipod-*` |
| Decompose `useIpodLogic` into sub-hooks | Very high | full iPod manual matrix |
| Emulator framework (Mac + PC) | Medium | manual emulator smoke |
| Split `api/songs/[id].ts` | Medium | `bun run test:song` |

---

## Quick Wins vs Larger Refactors

### Quick wins (hours–days)

1. ✅ Fix `ryos:pc` storage collision
2. ✅ Deduplicate admin `Skeleton.tsx`
3. Shared `youtube-client.ts`, `apple-dev-token-handler.ts`, rate-limit helper
4. Wire or delete chat tool registry
5. Re-export AI models from single source
6. Minesweeper → shared `useLongPress`
7. Remove `useInfiniteMacLogic` redundant local reducer
8. Consolidate `CHAT_USERS_PREFIX` to one export

### Larger refactors (weeks)

1. Media domain module (iPod/Karaoke/Video/TV)
2. `sync/domains.ts` per-domain split
3. VFS extraction from Finder
4. Dual tool execution unification
5. `useIpodLogic` / `useIpodStore` decomposition
6. `shared/` package with full contract migration
7. `api/songs/[id].ts` + `executors.ts` splits

---

## Tests and Smoke Checks

### Baseline commands (run before/after each phase)

```bash
bun run test:unit
bun run dev:api   # terminal 1
bun run test:api  # terminal 2
```

### Per-area gates

| Area | Command / check |
|------|-----------------|
| Chat + AI | `bun run test:ai`, `bun run test:chat-regression` |
| Sync | `bun test tests/test-cloud-sync-utils.test.ts` |
| iPod/media | `bun run test:song`, `bun test tests/test-ipod-*.test.ts` |
| VFS | `bun test tests/test-finder-trash-store.test.ts` |
| Listen | `bun run test:listen-security` |
| Admin | `bun run test:admin` |

### Manual smoke (before iPod/VFS/AI refactors)

1. Chats → AI → `launchApp`, `ipodControl`, `list /Music`, TextEdit document create
2. Finder: create/rename/trash/restore; empty trash
3. Control Panels: wallpaper, sync toggle, sign out/in
4. iPod: YouTube ↔ Apple Music, play, lyrics
5. Two-browser cloud sync: stickies change on A → apply on B

### Test gaps to fill before major refactors

| Module | Gap | Suggested test |
|--------|-----|----------------|
| `useAiChat` | No direct test | Golden tests for `onToolCall` routing |
| `useFileSystem` | Almost none | Path open/trash/move matrix with mocked IDB |
| `useIpodLogic` | No hook tests | Extract pure menu/wheel handlers first |
| `sync/domains.ts` | Indirect only | Per-domain round-trip serialize/apply |
| `useControlPanelsLogic` | One account test | Factory reset, manual sync flows |

---

## Dead Code and Obsolete Paths

| Item | Location | Notes |
|------|----------|-------|
| Chat tool registry | `src/apps/chats/tools/index.ts` | Zero callers for `executeToolHandler` |
| Legacy auth token localStorage | `useChatsStore` | httpOnly cookies replaced; migration still runs |
| `apps/pc/` | No app component | Legacy; aliased to `infinite-pc` in registry |
| `utils/chunkedStream.ts` | `@deprecated` aliases | Still exported |
| `api/auth/tokens.ts` | No src references | Verify admin UI before removal |
| `bun run dev:vercel` | AGENTS.md | Optional parity; Bun API is primary |
| Stale comment | `api/songs/_constants.ts` | References nonexistent `krcParser.ts` on client |
| Dual tool paths | client handlers + executors | Required for Telegram; maintenance burden |

---

## Priority Matrix

| Priority | Item | Effort | Risk |
|----------|------|--------|------|
| 🔴 Now | `ryos:pc` collision | Hours | Low |
| 🔴 Now | AI model registry unification | Days | Low |
| 🟠 High | YouTube/Apple/rate-limit API dedup | Days | Low |
| 🟠 High | Media playback + visual layers | 1–2 weeks | Medium |
| 🟠 High | Chat/listen type contracts | Days–week | Low–medium |
| 🟡 Medium | Sync domain modularization | 1–2 weeks | Medium–high |
| 🟡 Medium | VFS layer clarification | 1 week | Medium |
| 🟡 Medium | Tool registry + dual execution | 1 week | Medium–high |
| 🟢 Low | Admin skeleton, naming cleanup | Hours | Low |
| 🔴 Last | `useIpodLogic` decomposition | 2–3 weeks | Very high |

---

## References

- Existing architecture docs: `docs/1.1-architecture.md`, `docs/3.2-state-management.md`, `docs/1.2-api-architecture.md`, `docs/8.10-api-design-guide.md`
- Cloud sync shared utilities: `src/utils/cloudSync*.ts` (already imported by `api/sync/`)
- API handler baseline: `api/_utils/api-handler.ts`
