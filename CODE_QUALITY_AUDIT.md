# ryOS Code Quality Audit

**Date:** 2026-03-10  
**Scope:** Full codebase — API, React components, Zustand stores, hooks, utilities, TypeScript config, tests, security  
**Baseline:** Build passes, lint has 2 pre-existing issues, 88 unit tests pass

---

## Executive Summary

| Area | Critical | High | Medium | Low | Total |
|------|----------|------|--------|-----|-------|
| API Layer | 3 | 4 | 5 | 5 | 17 |
| React Components | 2 | 4 | 5 | 4 | 15 |
| Zustand Stores | 2 | 4 | 5 | 4 | 15 |
| Hooks & Utilities | 3 | 5 | 7 | 7 | 22 |
| TypeScript & Types | 2 | 5 | 5 | 3 | 15 |
| Tests | 0 | 3 | 3 | 1 | 7 |
| Security & Deps | 0 | 2 | 3 | 3 | 8 |
| **Totals** | **12** | **27** | **33** | **27** | **99** |

**Top priorities:** Fix memory leaks (BatteryIndicator, IpodWheel), fail-closed rate limiting, broken `useElementSize` hook, unsafe `JSON.parse` in API handlers, enable `strict: true` in `api/tsconfig.json`.

---

## 1. API Layer

### CRITICAL

**1.1 SSRF — unvalidated blob URL fetch**  
`api/sync/state.ts:152-161` — `readLegacyFilesDocumentsData` fetches a `blobUrl` from Redis without SSRF validation. The URL originates from client metadata and could target internal hosts.  
**Fix:** Validate with `validatePublicUrl` before fetching.

**1.2 Prompt injection in AI system prompt**  
`api/ai/ryo-reply.ts:115-123` — `recentMessages` and `mentionedMessage` are interpolated into the system prompt without sanitization. Crafted chat messages could manipulate AI behavior.  
**Fix:** Sanitize/validate these fields (length, format, disallow XML-like tags) before prompt inclusion.

**1.3 Rate limit bypass on error (fail-open)**  
`api/applet-ai.ts:322-325`, `api/ie-generate.ts:209-213`, `api/speech.ts:192-195`, `api/audio-transcribe.ts:132-135`, `api/youtube-search.ts:101-104` — Rate limit checks are inside `try/catch` blocks that log and continue on failure. If `checkCounterLimit` throws, requests proceed without rate limiting.  
**Fix:** Fail closed — return 503 or 429 if rate limiting cannot be checked.

### HIGH

**1.4 Duplicate `getClientIp` implementations**  
`api/auth/login.ts:29-38`, `api/auth/register.ts:33-42` — Both define local `getClientIp` instead of using the shared implementation from `api/_utils/_rate-limit.ts`, missing headers like `cf-connecting-ip`.  
**Fix:** Replace with the shared `getClientIp`.

**1.5 Unsafe `JSON.parse` without try/catch**  
`api/admin.ts` (lines 76, 98, 109, 124, 163, 176, 200, 219), `api/sync/state.ts:160`, `api/sync/auto.ts:102` — Malformed data causes uncaught exceptions and 500 responses.  
**Fix:** Wrap in try/catch and return structured error responses.

**1.6 Admin `targetUsername` not validated**  
`api/admin.ts:413-419` — `targetUsername` is used without format validation. Malicious values could affect Redis keys.  
**Fix:** Validate with username format checks before use.

**1.7 `audio-transcribe` doesn't use `apiHandler`**  
`api/audio-transcribe.ts` — Implements CORS, origin checks, and logging manually instead of using the centralized `apiHandler`.  
**Fix:** Refactor to use `apiHandler` for consistency.

### MEDIUM

**1.8 Inconsistent error response shapes** — Some endpoints return `{ error: string }`, others `{ error, details }`, some use `res.send()` vs `res.json()`.  
**1.9 Chat handler nested try/catch and duplicated IP logic** — `api/chat.ts:56-362`.  
**1.10 Link-preview metadata not escaped** — `api/link-preview.ts:176-266` — metadata from HTML could enable XSS if client renders it unsafely.  
**1.11 Rooms POST weak `members` validation** — `api/rooms/index.ts:84-95` — no length, format, or size constraints.  
**1.12 Inconsistent body parsing** — Some endpoints use `parseJsonBody`, others rely on `req.body` directly.

### LOW

**1.13** Deprecated `getClientIpFromVercel` still exported (`api/_utils/_rate-limit.ts:208-209`).  
**1.14** Repeated rate limit configuration across 6+ files — extract shared config.  
**1.15** `rooms/index.ts` POST uses `req.body` without explicit `parseJsonBody`.  
**1.16** Empty interface in `api/sync/auto.ts:41` (caught by linter).  
**1.17** Potential XSS in `iframe-check.ts:534-537` via `pageTitle`.

---

## 2. React Components

### CRITICAL

**2.1 Memory leak: BatteryIndicator event listeners never cleaned up**  
`src/apps/ipod/components/screen/BatteryIndicator.tsx:13-42` — `getBattery()` is async; the cleanup function from the Promise is never returned by `useEffect`. `levelchange` and `chargingchange` listeners accumulate on every mount.

**2.2 Memory leak: IpodWheel window listeners on unmount during drag**  
`src/apps/ipod/components/IpodWheel.tsx:296-373` — `mousemove`/`mouseup` listeners added to `window` in `handleMouseDown` are only removed in `handleMouseUp`. If the component unmounts during a drag, listeners persist indefinitely.

### HIGH

**2.3 No list virtualization for large lists**  
`src/apps/chats/components/ChatMessages.tsx`, `src/apps/finder/components/FileList.tsx` — Long lists rendered with `.map()` can cause jank with hundreds of items.

**2.4 12+ `eslint-disable react-hooks/exhaustive-deps`**  
Across `useAiChat.ts`, `ChatsAppComponent.tsx`, `AppStore.tsx`, `AppStoreFeed.tsx`, `useAdminLogic.ts`, `useAiGeneration.ts`, `WinampAppComponent.tsx`, `WindowFrame.tsx`, `useSound.ts`, `useFurigana.tsx`, `TranslationWidget.tsx`, `DictionaryWidget.tsx`. Each suppression risks stale closures.

**2.5 Stale `previousUserMessages` memoization**  
`src/apps/chats/components/ChatsAppComponent.tsx:476-480` — Memoized with `[aiMessageCount]` instead of `[aiMessages]`; if messages change without count changing, the value is stale.

**2.6 TextEdit effect re-subscribes on every edit**  
`src/apps/textedit/components/TextEditAppComponent.tsx:120-151` — The subscription effect depends on `hasUnsavedChanges`, causing re-subscribe on every keystroke.

### MEDIUM

**2.7 Very large files** — `useInternetExplorerLogic.ts` (~2044 lines), `useIpodLogic.ts` (~1880), `LyricsDisplay.tsx` (~1931), `PaintCanvas.tsx` (~1834), `WindowFrame.tsx` (~1671), `ControlPanelsAppComponent.tsx` (~1589), `HtmlPreview.tsx` (~1499).  
**2.8 Only 4 components use `React.memo`** — List items, chat messages, sidebar, and similar hot-path components are not memoized.  
**2.9 `Dial` effect churn from unstable `onChange`** — `src/components/ui/dial.tsx:134`.  
**2.10 No `useReducer` anywhere** — Complex state in chats, iPod, Internet Explorer would benefit from reducers.  
**2.11 Error boundaries only at app level** — No component-level boundaries inside `HtmlPreview`, `PaintCanvas`, `LyricsDisplay`.

### LOW

**2.12** Accessibility gaps — inconsistent ARIA labels, keyboard navigation, focus management across modals.  
**2.13** Inline function definitions in render — `IpodWheel`, `ChatMessages`, menu bars create new refs each render.  
**2.14** `useReducer` not used anywhere for complex local state.  
**2.15** Some dialogs missing close button ARIA labels.

---

## 3. Zustand Stores

### CRITICAL

**3.1 Direct state mutation in `onRehydrateStorage`**  
- `src/stores/useAppStore.ts:570-605` — Mutates `state.instanceOrder`, `state.nextInstanceId`, `state.instances[id]` directly.
- `src/stores/useChatsStore.ts:1817-1866` — Mutates `state.username` and `state.authToken`.
- `src/stores/useSoundboardStore.ts:237-265` — Mutates `state.activeBoardId` and `state.playbackStates`.
- `src/stores/useFinderStore.ts:138-165` — Mutates `state.instances`.

**3.2 Direct state mutation in `migrate`**  
`src/stores/useIpodStore.ts:1440-1441` — `state.displayMode = "water"` mutates before spreading.

### HIGH

**3.3 Stores too large — need splitting**  
- `useChatsStore.ts` (~1,463 lines) — auth, AI, rooms, messages, UI, password, token refresh.
- `useIpodStore.ts` (~1,211 lines) — tracks, playback, lyrics, romanization, library sync.
- `useFilesStore.ts` (~1,049 lines) — file system, lazy loading, caching, IndexedDB.
- `useInternetExplorerStore.ts` (~718 lines) — favorites, timeline, dialogs, navigation.

**3.4 Async actions without loading/error state**  
`useChatsStore` (fetchRooms, sendMessage, createUser, etc.), `useIpodStore` (addTrackFromVideoId, syncLibrary), `useListenSessionStore` (fetchSessions, createSession), `useSoundboardStore`, `useFilesStore`.

**3.5 Side effects in actions**  
`useAppStore.createAppInstance` calls `window.dispatchEvent` + analytics. `useChatsStore.setUsername` uses `setTimeout`. `useThemeStore.setTheme` does DOM manipulation + `localStorage`.

**3.6 `as any` in migrations**  
`src/stores/useIpodStore.ts:1437`, `src/stores/useKaraokeStore.ts:215`.

### MEDIUM

**3.7** No exported selectors — consumers often pull entire store state.  
**3.8** No devtools middleware — debugging and time-travel disabled.  
**3.9** `useThemeStore` uses manual `localStorage` instead of `persist` middleware.  
**3.10** Deeply nested state in `useChatsStore` (`roomMessages: Record<string, ChatMessage[]>`).  
**3.11** `useSynthStore` persists `Set<string>` — not JSON-serializable.

### LOW

**3.12** No Immer for complex nested updates.  
**3.13** Inconsistent persist storage patterns across stores.  
**3.14** `useCloudSyncStore` uses loose type assertions (`candidate as Record<string, unknown>`).  
**3.15** Store-to-store imports create implicit coupling (no circular deps found).

---

## 4. Hooks & Utilities

### CRITICAL

**4.1 `useChatSynth` crash on invalid preset**  
`src/hooks/useChatSynth.ts:189-195` — When preset key is invalid, `presetKey` falls back to `"classic"` but `preset` stays `undefined`. Lines 197-212 access `preset.effects`, causing a crash.

**4.2 `useElementSize` returns 0x0 always**  
`src/hooks/useResizeObserver.ts:144-186` — `forceUpdate` is a no-op; dimensions never trigger re-render. The hook is effectively broken.

**4.3 `useSound` stale closure**  
`src/hooks/useSound.ts:90-117` — Setup effect uses `[]` deps but captures `volume`, `uiVolume`, `masterVolume`. Gain node uses initial values only.

### HIGH

**4.4 `useStreamingFetch` refs in dependency array**  
`src/hooks/useStreamingFetch.ts:267-282` — Refs are stable and shouldn't be deps; `biome-ignore` hides issues.

**4.5 `useFurigana` multiple exhaustive-deps disables**  
`src/hooks/useFurigana.tsx:171-173, 346-348, 375-376, 562-564` — Several effects suppress deps warnings.

**4.6 `useChatSynth` inconsistent dependency comment**  
`src/hooks/useChatSynth.ts:379-388` — Comment says `changePreset` is omitted from deps, but it's included.

**4.7 `useBackgroundChatNotifications` subscription cleanup implicit**  
`src/hooks/useBackgroundChatNotifications.ts:274-291` — New room channels added without explicit full teardown.

**4.8 6 large hooks >500 lines** — `useTerminalSounds.ts` (1033), `useAutoCloudSync.ts` (628), `useFurigana.tsx` (592), `useChatSynth.ts` (584), `useSpotlightSearch.ts` (574), `useWindowManager.ts` (550).

### MEDIUM

**4.9** `cloudSync.ts` (1385 lines) has many `as` type assertions without runtime validation.  
**4.10** `useAuth.ts` (309 lines) manages too many dialog states and auth flows.  
**4.11** `useAutoCloudSync.ts` tears down all subscriptions when `enabledDomainsKey` changes.  
**4.12** `useTtsQueue` odd dependency choices — refs in deps that shouldn't be.  
**4.13** ResizeObserver logic duplicated between `useResizeObserver` and `useResizeObserverWithRef`.  
**4.14** `contacts.ts` (949 lines), `prefetch.ts` (838 lines), `chunkedStream.ts` (858 lines) — very large utility files.  
**4.15** `songMetadataCache.ts` (727 lines) — could be split.

### LOW

**4.16** Comment/code mismatch in `useChatSynth.ts:382`.  
**4.17** `useEventListener` — `options` object reference changes can cause extra subscriptions.  
**4.18** `useInterval` restarts on `immediate` change.  
**4.19** Mixed hook-style and `getState()` usage in `useBackgroundChatNotifications`.  
**4.20** `abortableFetch.ts` — well-structured; no issues (positive note).  
**4.21** No major duplication across utility files.  
**4.22** Good error handling in `chunkedStream.ts`.

---

## 5. TypeScript & Type Safety

### CRITICAL

**5.1 `api/tsconfig.json` has `strict: false`**  
The entire API layer lacks `strictNullChecks`, `noImplicitAny`, and `useUnknownInCatchVariables`. Combined with extensive use of `!` non-null assertions in API handlers, this is a significant safety gap.

**5.2 IndexedDB `db!.transaction` pattern**  
`src/utils/indexedDBOperations.ts:33,58,83,107,135,165`, `src/stores/useFilesStore.ts:326,357,438,446,472` — `db` may be null if initialization fails; `!` assertion hides the failure.

### HIGH

**5.3** `persistedState as any` in store migrations — `useIpodStore.ts:1437`, `useKaraokeStore.ts:215`.  
**5.4** Unsafe JSON response assertions — `src/api/core.ts:78,119,122`, `src/api/songs.ts:116` — external data asserted as typed without validation.  
**5.5** Non-null assertions in auth paths — `api/rooms/_helpers/_tokens.ts`, `api/presence/switch.ts:29,82`, `api/chat/tools/executors.ts:728,1190+`, `api/applet-ai.ts:383,548`.  
**5.6** `@ts-expect-error` for internal library property — `src/hooks/useChatSynth.ts:532` — `_voices` on Tone.js.  
**5.7** Missing discriminated unions — `src/apps/base/types.ts:137-150` — `AnyInitialData` includes `| unknown`, making the union meaningless.

### MEDIUM

**5.8** Many `as` type assertions for DOM events and external data.  
**5.9** `@ts-ignore` in `useTerminalSounds.ts:765`, `useChatSynth.ts:271,341`, `audioContext.ts:60`.  
**5.10** Missing explicit return types on most exported hook/utility functions.  
**5.11** `useFileSystem.ts:45` — `data?: any` on virtual file metadata.  
**5.12** Synthetic events fabricated with `as` casts in `ChatInput.tsx`, `FileList.tsx`.

### LOW

**5.13** Pre-existing Winamp `any` (per AGENTS.md, do not fix).  
**5.14** WebGL non-null assertions in `webglFilterRunner.ts` — low-risk but could fail on unsupported hardware.  
**5.15** `ScrollBehavior` cast in `IpodScreen.tsx` — harmless.

---

## 6. Test Quality

### HIGH

**6.1 Tests pass without assertions on early return**  
`test-new-api.test.ts` (20+ tests), `test-admin.test.ts`, `test-auth-extra.test.ts`, `test-rooms-extra.test.ts`, `test-listen-security.test.ts`, `test-song.test.ts`, `test-share-applet.test.ts` — When setup variables are null or responses are 429, tests `return` early with no `expect()` calls.  
**Fix:** Use `test.skip()` or `expect.assertions(N)` to make skips visible.

**6.2 Order-dependent tests with shared mutable state**  
`test-new-api.test.ts` — `Login - success` depends on `Register - success` having run first. Shared `testUsername`, `testToken`, `testRoomId` variables create ordering fragility.

**6.3 Rate limit responses silently accepted**  
Multiple test files treat `429` as a pass condition (`if (res.status === 429) return`), meaning rate limiting behavior is never actually asserted.

### MEDIUM

**6.4** Missing edge case coverage — expired tokens, malformed auth headers, concurrent token refresh, deletion of non-existent resources, IndexedDB flows, streaming edge cases.  
**6.5** Implementation-coupled tests — `test-server-app-state-tools.test.ts` tightly coupled to tool executor internals.  
**6.6** Duplicated test setup — admin setup, user registration repeated across files instead of shared fixtures.

### LOW

**6.7** Long test files — `test-ai.test.ts` (~668 lines), `test-server-app-state-tools.test.ts` (~589 lines), `test-telegram-webhook.test.ts` (~421 lines).

---

## 7. Security & Dependencies

### HIGH

**7.1 Rate limit bypass for `ryo` user**  
`api/applet-ai.ts:322` — Authenticated user `"ryo"` skips rate limits. If credentials are compromised, unlimited AI usage is possible.  
**Fix:** Use an explicit admin flag in Redis instead of hardcoding the username.

**7.2 `audio-transcribe` unauthenticated**  
`api/audio-transcribe.ts` — Anyone on allowed origins can transcribe audio. Rate limits reduce abuse but cost exposure remains.  
**Fix:** Consider requiring auth or stricter rate limits.

### MEDIUM

**7.3** `API_ALLOWED_ORIGINS=*` allows all origins — document as unsafe for production.  
**7.4** Admin username hardcoded as `"ryo"` — less flexible, higher impact if compromised.  
**7.5** Listen session anonymous leave uses `anonymousId` only — ensure strong PRNG generation.

### LOW

**7.6** `innerHTML` usage in `Waveform.tsx` and `usePcLogic.ts` — only clearing elements, not user input.  
**7.7** Seed script has hardcoded dev password — guarded by `NODE_ENV=development`.  
**7.8** No `bun audit` in CI — should be added for automated vulnerability scanning.

---

## Positive Observations

- **SSRF protection** in `link-preview` and `iframe-check` via `validatePublicUrl` and `safeFetchWithRedirects`
- **Centralized `apiHandler`** provides auth, CORS, logging for most endpoints
- **Zod validation** in songs API
- **DOMPurify** used in `HtmlPreview` for AI-generated HTML
- **Redis-backed atomic rate limiting** across API
- **Good test infrastructure** — `test-utils.ts` with shared helpers, 88 unit tests passing, 49 test suites total
- **Clean build** — TypeScript compiles without errors
- **Proper error boundaries** at desktop and app levels
- **Clean event listener cleanup** in most components (Paint, Stickies, PhotoBooth)
- **No hardcoded secrets** in source code
- **No command injection** vectors — all `exec`/`spawn` use fixed commands
- **No path traversal** vulnerabilities found
- **Bearer + header auth model** eliminates need for CSRF tokens

---

## Recommended Priority Actions

### Immediate (Critical)

1. Fix `BatteryIndicator.tsx` async cleanup to properly wire `useEffect` return
2. Fix `IpodWheel.tsx` to clean up window listeners on unmount
3. Fix `useElementSize` in `useResizeObserver.ts` — currently returns 0x0 always
4. Fix `useChatSynth.ts:189-195` crash when preset is invalid
5. Make rate limit failures fail-closed (5 files)
6. Add SSRF validation to `api/sync/state.ts` blob URL fetch
7. Wrap all `JSON.parse` in `api/admin.ts` with try/catch

### Short-term (High)

8. Enable `strict: true` in `api/tsconfig.json` and fix resulting errors
9. Replace duplicate `getClientIp` in auth files with shared implementation
10. Add `expect.assertions()` or `test.skip()` to tests that early-return
11. Add list virtualization to ChatMessages and FileList
12. Audit and fix all `eslint-disable react-hooks/exhaustive-deps` suppressions
13. Fix direct state mutations in store `onRehydrateStorage` callbacks
14. Replace `as any` in store migrations with proper typed migrations

### Medium-term

15. Split large stores: `useChatsStore`, `useIpodStore`, `useFilesStore`
16. Split large hooks: `useTerminalSounds`, `useAutoCloudSync`, `useFurigana`
17. Split large components: `useInternetExplorerLogic`, `WindowFrame`, `PaintCanvas`
18. Add loading/error states to async store actions
19. Standardize error response shapes across API
20. Add `React.memo` to list item components and hot-path renders
21. Export selectors from frequently-used stores
22. Add devtools middleware to stores in development
23. Add `bun audit` to CI pipeline

### Long-term

24. Add discriminated unions to `AnyInitialData` type
25. Migrate `useThemeStore` to use `persist` middleware
26. Consider Immer for complex nested state updates
27. Add component-level error boundaries in `HtmlPreview`, `PaintCanvas`, `LyricsDisplay`
28. Reduce `as` type assertions by adding runtime validation (Zod) for external data
29. Add edge case test coverage for auth, streaming, IndexedDB
