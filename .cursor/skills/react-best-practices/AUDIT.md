# ryOS React Best Practices Audit

**Date:** 2026-07-09  
**Skill source:** [vercel-labs/agent-skills/skills/react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)  
**Stack context:** Vite + React SPA + Bun API (not Next.js App Router). Most `server-*` / RSC rules do not apply; `async-*` still applies to `api/` handlers. Prefer `React.lazy` over `next/dynamic`.

---

## Scorecard

| Priority | Category | Overall | Notes |
|----------|----------|---------|-------|
| 1 | Eliminating Waterfalls (`async-*`) | Mixed | Strong parallel Redis in join/bulk/auth; gaps in room teardown, `/api/chat` context, stocks chart |
| 2 | Bundle Size (`bundle-*`) | Strong shell, weak icons | Excellent app lazy-loading + prefetch; Phosphor barrel is the main CRITICAL gap |
| 3 | Server-Side (`server-*`) | N/A | SPA — skip RSC/`React.cache`/`after()` |
| 4 | Client Fetching (`client-*`) | Mixed | Custom in-flight dedup is good; no SWR; applet catalog duplicated |
| 5 | Re-render (`rerender-*`) | Strong | Narrow Zustand selectors in hot paths; Finder search/storage init gaps |
| 6 | Rendering (`rendering-*`) | Strong chats, weak Finder grid | Chat rows use `content-visibility`; Finder grid unbounded |
| 7–8 | JS / Advanced | Incremental | Passive listeners mostly good; minor gaps |

---

## Priority fixes

Status as of 2026-07-09 follow-up PR commits:

1. **Phosphor Icons barrel** (`bundle-barrel-imports`) — **FIXED** via `vite/optimizePhosphorImports.ts` (named CSR subpath rewrite).
2. **Decouple Finder from desktop shell** (`bundle-dynamic-imports`) — **FIXED** via `OsIconLabel` + `DesktopIconGrid` switch.
3. **Parallelize room teardown Redis** (`async-parallel`) — **FIXED** (`Promise.all` in delete/leave).
4. **Dedupe applet catalog fetches** (`client-swr-dedup`) — **FIXED** via `fetchAppletCatalog` helper.
5. **Finder grid virtualization** (`rendering-content-visibility`) — **ALREADY PRESENT** (`contentVisibility: auto` on `GridItem`).
6. **Lazy `useState` for storage calc** (`rerender-lazy-state-init`) — **FIXED** + deferred Finder search.
7. **Shorten `/api/chat` pre-stream waterfall** (`async-api-routes`) — **FIXED** (geo∥tz, memory∥attachments).
8. **Lazy Three.js in IE Time Machine** (`bundle-dynamic-imports`) — **FIXED** (`React.lazy` GalaxyBackground).

---

## CRITICAL / HIGH findings

### Bundle

| Finding | Rule | Severity | Evidence | Fix |
|---------|------|----------|----------|-----|
| Phosphor Icons from package barrel | `bundle-barrel-imports` | CRITICAL | 134 files: `from "@phosphor-icons/react"` | Vite optimize-package-imports or `@phosphor-icons/react/dist/csr/*` |
| Finder `FileIcon` in desktop boot path | `bundle-dynamic-imports` | HIGH | `DesktopIconGrid.tsx` → `@/apps/finder/components/FileIcon` | Move thin icon renderer to `src/components/` |
| IE Time Machine eager Three.js | `bundle-dynamic-imports` | HIGH | `TimeMachineViewPortal` → `GalaxyBackground` → `three` | `React.lazy` when shader enabled |
| Karaoke CoverFlow eager vs iPod lazy | `bundle-dynamic-imports` | HIGH | `KaraokeWindowContent.tsx` static import | Reuse `ipodLazyImports` |

### Async / API

| Finding | Rule | Severity | Evidence | Fix |
|---------|------|----------|----------|-----|
| Room teardown sequential Redis deletes | `async-parallel` | HIGH | `api/rooms/[id].ts` L115–118; `leave.ts` | `Promise.all` independent deletes |
| `/api/chat` sequential context build | `async-api-routes` | MEDIUM–HIGH | `api/chat.ts` geo → tz → memory → attachments | Start independent promises early |
| Stocks chart after quotes | `async-api-routes` | MEDIUM | `api/stocks.ts` | Start chart with quotes |
| Share-applet auth before GET branch | `async-defer-await` | MEDIUM | `api/share-applet.ts` | Auth only for mutating methods |

### Client fetching

| Finding | Rule | Severity | Evidence | Fix |
|---------|------|----------|----------|-----|
| Applet list fetched from many sites | `client-swr-dedup` | MEDIUM–HIGH | App Store, feed, updates, viewer, chats VFS | Shared cache / in-flight promise or SWR |
| Per-room message fetch no in-flight dedup | `client-swr-dedup` | MEDIUM | `useChatsStore.fetchMessagesForRoom` | Per-room promise map (like `roomsFetchPromise`) |

### Re-render / rendering

| Finding | Rule | Severity | Evidence | Fix |
|---------|------|----------|----------|-----|
| Finder grid no virtualization | `rendering-content-visibility` | HIGH | `FileListGridView.tsx` full `.map` | Virtualize or `content-visibility` on cells |
| `calculateStorageSpace()` eager in `useState` | `rerender-lazy-state-init` | MEDIUM | `useFinderLogic.ts` L208 | `useState(() => calculateStorageSpace())` |
| Finder search sync on keystroke | `rerender-use-deferred-value` | MEDIUM | `useFinderLogic` filter | `useDeferredValue(searchQuery)` |
| Mobile chat dropdown full unread map | `rerender-defer-reads` | MEDIUM | `ChatRoomDropdown.tsx` | Per-row unread selectors (match sidebar) |

---

## Good patterns (keep)

- **App code splitting:** every app via `createLazyComponent` + literal `import()` in `appRegistry.tsx`; metadata split from components.
- **Prefetch:** dock hover/focus, desktop pointer, spotlight, MRU (`prefetchAppChunk`).
- **Conditional heavy deps:** Pusher, MapKit, MusicKit, media core, dynamic wallpapers, screen savers, dashboard widgets.
- **Vite `manualChunks`:** three / tiptap / webamp / ai-sdk isolated; avoids shared-helper → vendor-into-entry pitfall.
- **API parallel I/O:** auth session, room join, bulk messages, songs cover batches + Redis pipelines.
- **Client dedup:** weather store, MusicKit, chats `roomsFetchPromise`, lyrics/song metadata caches.
- **Zustand granularity:** Dock signatures, Spotlight `getState()` actions, chat sidebar per-room unread, `aiMessageCount` vs full array.
- **List performance:** Finder list virtualization (120+), iPod menus + CoverFlow windowing, chat `messageRenderLimit` + `content-visibility` on rows.

---

## Out of scope / N/A

- Next.js RSC, `React.cache`, `after()`, server actions, `next/dynamic`, `optimizePackageImports` (Vite needs an equivalent plugin).
- Full `js-*` / `advanced-*` sweep — incremental; no systemic issues found in hot paths.
- Automated bundle size measurement — recommend `bun run build` + rollup visualizer when fixing Phosphor / Finder shell coupling.
