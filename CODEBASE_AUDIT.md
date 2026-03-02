# ryOS Codebase Audit & Roadmap

**Date:** March 2, 2026
**Branch:** `cursor/codebase-audit-roadmap-c18b`
**Scope:** Full codebase — architecture, code quality, security, performance, testing, DX

---

## Executive Summary

ryOS is a feature-rich web-based desktop environment (20 apps, 40+ API routes, 433 source files) built on React 19 + Zustand + Vite + Bun. The architecture is well-organized with clear separation between apps, stores, and API handlers. The build passes cleanly, lint passes with zero errors, and there is a solid test suite of 23 test files covering API integration and unit/wiring concerns.

The audit identifies **35 actionable items** across 8 categories, ranked by priority.

---

## Table of Contents

1. [Critical — Security](#1-critical--security)
2. [High — Code Architecture](#2-high--code-architecture)
3. [High — Type Safety](#3-high--type-safety)
4. [Medium — Performance](#4-medium--performance)
5. [Medium — Testing](#5-medium--testing)
6. [Medium — API Layer](#6-medium--api-layer)
7. [Low — Developer Experience](#7-low--developer-experience)
8. [Low — Build & Dependencies](#8-low--build--dependencies)
9. [Future Roadmap](#9-future-roadmap)

---

## 1. Critical — Security

### 1.1 XSS via `innerHTML` in HTML entity decoding

**Risk: High** — User-supplied chat messages and song titles are decoded using `innerHTML`, which executes embedded HTML/scripts.

**Affected files:**
| File | Pattern |
|------|---------|
| `src/apps/chats/hooks/useChatRoom.ts` | `txt.innerHTML = str` → `txt.value` |
| `src/apps/chats/components/ChatMessages.tsx` | Same decode pattern with message content |
| `src/hooks/useBackgroundChatNotifications.ts` | Same pattern |
| `src/components/dialogs/SongSearchDialog.tsx` | `textarea.innerHTML = text` |
| `src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts` | `txt.innerHTML = loadedTitle` |

**Recommendation:** Replace all `innerHTML`-based entity decoding with a safe utility:
```ts
function decodeHtmlEntities(text: string): string {
  const doc = new DOMParser().parseFromString(text, "text/html");
  return doc.documentElement.textContent ?? text;
}
```
Or use a lightweight library like `he`. Extract to a shared utility in `src/utils/` to eliminate the duplicated implementations (see §2.2).

### 1.2 `dangerouslySetInnerHTML` in HtmlPreview

**Risk: Mitigated** — `src/components/shared/HtmlPreview.tsx` uses `dangerouslySetInnerHTML` but sanitizes via DOMPurify and renders inside a sandboxed iframe. Current implementation is acceptable but should be documented and periodically reviewed.

### 1.3 Environment variable access with `!` assertions

**Risk: Medium** — Several API handlers (Pusher broadcast, some auth routes) access env vars with `!` non-null assertions. Missing vars will throw at runtime with unhelpful errors.

**Recommendation:** Add startup validation in the API server entry point (`scripts/api-standalone-server.ts`) that checks required env vars and fails fast with clear messages.

---

## 2. High — Code Architecture

### 2.1 Oversized files need decomposition

8 files exceed 1,500 lines; the largest is 2,530 lines. These are maintenance bottlenecks and increase merge conflict risk.

| File | Lines | Suggested decomposition |
|------|-------|------------------------|
| `src/apps/chats/hooks/useAiChat.ts` | 2,530 | Extract tool handlers, streaming logic, message formatting |
| `src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts` | 2,045 | Split navigation, history, time-machine, AI generation |
| `src/apps/ipod/components/LyricsDisplay.tsx` | 1,931 | Extract sync-mode renderer, translation panel, controls |
| `src/apps/finder/hooks/useFileSystem.ts` | 1,894 | Separate IndexedDB layer, CRUD operations, virtual files |
| `src/apps/ipod/hooks/useIpodLogic.ts` | 1,876 | Split playback, library, UI state, YouTube integration |
| `src/apps/paint/components/PaintCanvas.tsx` | 1,866 | Extract tool handlers, selection logic, filter pipeline |
| `src/apps/control-panels/hooks/useControlPanelsLogic.ts` | 1,692 | One hook per settings panel |
| `src/apps/terminal/hooks/useTerminalLogic.ts` | 1,653 | Separate command parser, builtin commands, AI integration |

**Target:** No single file exceeds ~800 lines. Extract sub-hooks, sub-components, and utility modules.

### 2.2 Duplicated patterns across apps

- **`decodeHtmlEntities`** — implemented separately in 4+ files (see §1.1). Extract to `src/utils/decode.ts`.
- **App metadata boilerplate** — each app repeats the same `metadata` + `helpItems` + `WindowFrame` + `MenuBar` wiring. Consider a `createApp()` factory or documented template.
- **Store migration helpers** — migration functions in `useKaraokeStore`, `useIpodStore`, `useAppStore` share identical `as any` cast patterns. Extract a typed `createMigration<TOld, TNew>()` helper.
- **Chat tool handlers** — `ipodHandler`, `stickiesHandler`, `karaokeHandler`, etc. share the same dispatch-and-respond structure; could share a base abstraction.

### 2.3 Large Zustand stores

| Store | Lines | Notes |
|-------|-------|-------|
| `useChatsStore` | 1,864 | Rooms, presence, notifications, messages, AI state |
| `useIpodStore` | 1,532 | Library, playback, queue, lyrics, YouTube |
| `useAppStore` | 858 | Instances, order, foreground, recent items |

**Recommendation:** Split along domain boundaries. For example, `useChatsStore` could become `useRoomsStore` + `usePresenceStore` + `useChatMessagesStore`. This also improves selector granularity and reduces unnecessary re-renders.

---

## 3. High — Type Safety

### 3.1 `any` and unsafe casts

The codebase has ~30+ instances of `any`, `as any`, `as unknown as`, and `@ts-expect-error` outside of test files.

**Highest-impact fixes:**
| Location | Issue | Fix |
|----------|-------|-----|
| `src/apps/terminal/types/index.ts` | `files: any[]`, `moveToTrash: (file: any)`, `launchApp: (appId: any)` | Define `FileItem`, app ID union types |
| `src/apps/finder/hooks/useFileSystem.ts` | `data?: any` on virtual files | Type the data discriminated union per file kind |
| `src/stores/useChatsStore.ts` | `message as unknown as { content?: string }` (×2) | Define proper message type variants |
| `src/apps/synth/hooks/useSynthLogic.ts` | `(Tone.context as any).lookAhead` | Use module augmentation or `@ts-expect-error` with comment |
| `src/lib/pusherClient.ts` | `PusherNamespace as unknown` | Properly type the Pusher ESM/CJS interop |

### 3.2 Missing strict checks

- `tsconfig.app.json` has `strict: true` — good.
- `noUncheckedIndexedAccess` is not enabled. Enabling it would catch undefined-access bugs on arrays and records.
- Consider enabling `exactOptionalPropertyTypes` for stricter optional property handling.

---

## 4. Medium — Performance

### 4.1 Almost zero `React.memo` usage

Only **1 component** in the entire codebase uses `memo()` (`LyricLineItem`). For an app with list-heavy UIs (chat messages, file lists, song lists, applet grids), this is a significant gap.

**Priority memoization candidates:**
- Chat message items in `ChatMessages.tsx`
- File list items in `FileList.tsx`
- Song list items in iPod/Karaoke
- Applet cards in `AppletViewer`
- Dock items in `Dock.tsx`
- Window frames (if props are stable)

### 4.2 Webamp not code-split

`webamp` (~2MB) is a production dependency that isn't in the `manualChunks` config and isn't dynamically imported. It loads as part of whatever chunk includes the Winamp app.

**Recommendation:** Add `webamp` to `manualChunks` or ensure it's loaded via dynamic `import()` only when the Winamp app opens.

### 4.3 Service worker precache is large

The PWA precaches 53 entries totaling ~2.6 MB. While runtime caching is well-configured, the precache list should be periodically audited to ensure it only includes critical shell resources.

### 4.4 Bundle analysis

Build output is 212 MB (including Vercel serverless function bundles). Several Vercel function bundles are ~780 KB each due to bundling Pusher server-side. Consider:
- Sharing a common layer for Pusher/Redis across serverless functions
- Evaluating if the listen-session functions can share a single endpoint

---

## 5. Medium — Testing

### 5.1 Current state

| Metric | Value |
|--------|-------|
| Test files | 23 |
| Test runner | `bun:test` |
| Coverage | API routes, chat wiring, notifications, error boundaries |
| Unit test command | Currently broken (`test:unit` filter doesn't match) |

**Issue:** `bun run test:unit` exits with code 1 — the filter pattern `notification|wiring|refcount|constructor|batching|memory|boundary` doesn't match any files because test file names use `test-` prefix, not the patterns in the filter. The `package.json` script needs to be updated.

### 5.2 Coverage gaps

| Area | Test coverage | Priority |
|------|--------------|----------|
| Frontend components | None | Medium — add component tests for critical flows |
| Zustand stores | Partial (via wiring tests) | Medium — direct store logic tests |
| File system (IndexedDB) | None | High — complex logic, many edge cases |
| Paint canvas tools | None | Low — hard to unit test |
| Window manager (useAppStore) | None | Medium — instance lifecycle, z-ordering |
| i18n completeness | Script exists but not in CI | Low |
| Accessibility | None | Medium |

### 5.3 Recommendations

1. **Fix `test:unit` script** — update the filter pattern to match actual test file names.
2. **Add store tests** — `useAppStore` (instance management), `useFileSystem` (CRUD operations), `useChatsStore` (message handling).
3. **Add component smoke tests** — at minimum, render tests for the 5 most-used apps.
4. **Add a11y linting** — integrate `eslint-plugin-jsx-a11y`.
5. **Add i18n completeness check to CI** — run `i18n:find-untranslated` as a CI step.

---

## 6. Medium — API Layer

### 6.1 Inconsistent handler patterns

Most routes use the centralized `apiHandler()` wrapper, but a few custom handlers bypass it:

| Route | Uses `apiHandler` | Has rate limiting | Has CORS |
|-------|-------------------|-------------------|----------|
| `auth/login` | ❌ | ✅ | ✅ |
| `auth/register` | ❌ | ✅ | ✅ |
| `audio-transcribe` | ❌ | ✅ | ✅ |
| `pusher/broadcast` | ❌ | ❌ | ❌ |

**Recommendation:** Migrate remaining custom handlers to `apiHandler` for consistent error handling, logging, and CORS. The recent PR #796 already migrated 17 endpoints — finish the remaining 4.

### 6.2 Missing rate limiting on most routes

Only auth and audio-transcribe routes have rate limiting. AI endpoints have per-user message counting, but no burst protection.

**Recommendation:** Add optional rate-limit config to `apiHandler`:
```ts
apiHandler({ methods: ["POST"], auth: "required", rateLimit: { burst: 20, window: 60 } }, handler)
```

### 6.3 No request logging / observability

API handlers log errors via `console.error` but have no structured request logging, latency tracking, or error aggregation.

**Recommendation:** Add lightweight request logging middleware to `apiHandler` (method, path, status, duration). Consider integrating with Vercel's observability or a lightweight logger.

### 6.4 Serverless function size

Listen-session functions (`join`, `leave`, `sync`, `reaction`) each bundle at ~780 KB due to duplicating Pusher + Redis. Consolidating into fewer endpoints or using Vercel's shared layers could reduce cold start times.

---

## 7. Low — Developer Experience

### 7.1 No Prettier / formatting config

ESLint handles linting but there's no auto-formatter configured. This can lead to inconsistent formatting across contributors.

**Recommendation:** Add Prettier with a minimal config, or configure ESLint's formatting rules. Add a `format` script and pre-commit hook.

### 7.2 Deep relative imports

Several files use deeply nested relative imports like `../../../../src/types/chat`. The `@/*` path alias exists in `tsconfig.app.json` but isn't used consistently.

**Recommendation:** Lint for deep relative imports (`eslint-plugin-no-relative-import-paths` or similar) and migrate existing deep imports to use `@/` aliases.

### 7.3 Legacy package name

`package.json` still uses `"name": "soundboard"` and `"version": "0.0.0"`. Update to `"ryos"` with a meaningful version.

### 7.4 No pre-commit hooks

No `husky`, `lint-staged`, or similar tooling for pre-commit checks. Linting and formatting could be enforced before commits reach CI.

### 7.5 Missing JSDoc on public APIs

Zustand store actions, API utility functions, and shared hooks lack JSDoc documentation. The most critical stores (`useAppStore`, `useChatsStore`, `useFileSystem`) would benefit from documented public interfaces.

---

## 8. Low — Build & Dependencies

### 8.1 Dependency hygiene

| Issue | Package | Action |
|-------|---------|--------|
| Prod dep used only for deploy CLI | `vercel` | Move to `devDependencies` |
| Pinned build tool | `esbuild@0.27.0` | Remove if Vite brings its own; otherwise update |
| Type def version mismatch | `@types/dompurify@^3.2.0` vs `dompurify@^3.3.1` | Align versions |
| Locale detection | `i18next-browser-languagedetector` | Verify it's wired in i18n init |

### 8.2 Tailwind v4 migration

Tailwind is at `4.1.18` using `@tailwindcss/vite`. Verify the migration from v3 config-based approach is complete (no leftover `tailwind.config.js` with v3 patterns that v4 ignores).

### 8.3 React 19 compatibility

React 19 is used (`19.2.3`). Verify all Radix UI and TipTap packages are React 19 compatible — some older Radix packages may log warnings.

---

## 9. Future Roadmap

### Phase 1: Hardening (1–2 weeks)

| # | Item | Category | Effort |
|---|------|----------|--------|
| 1 | Fix XSS in `innerHTML` entity decoding (§1.1) | Security | S |
| 2 | Add env var startup validation (§1.3) | Security | S |
| 3 | Fix broken `test:unit` script (§5.1) | Testing | XS |
| 4 | Migrate remaining API handlers to `apiHandler` (§6.1) | API | S |
| 5 | Add `React.memo` to list-heavy components (§4.1) | Performance | M |
| 6 | Extract shared `decodeHtmlEntities` utility (§2.2) | Architecture | S |

### Phase 2: Architecture Improvements (2–4 weeks)

| # | Item | Category | Effort |
|---|------|----------|--------|
| 7 | Decompose top 4 largest files (§2.1) | Architecture | L |
| 8 | Split `useChatsStore` into domain stores (§2.3) | Architecture | M |
| 9 | Type the `any` hotspots in terminal, finder, chats (§3.1) | Type Safety | M |
| 10 | Add rate limiting to `apiHandler` (§6.2) | API | M |
| 11 | Add Zustand store unit tests (§5.2) | Testing | M |
| 12 | Code-split Webamp (§4.2) | Performance | S |

### Phase 3: Developer Experience (2–4 weeks)

| # | Item | Category | Effort |
|---|------|----------|--------|
| 13 | Add Prettier + pre-commit hooks (§7.1, §7.4) | DX | S |
| 14 | Migrate deep relative imports to `@/` aliases (§7.2) | DX | M |
| 15 | Add `eslint-plugin-jsx-a11y` (§5.3) | Accessibility | S |
| 16 | Add request logging to API layer (§6.3) | Observability | M |
| 17 | Add i18n completeness check to CI (§5.3) | i18n | S |
| 18 | Update package name and version (§7.3) | DX | XS |

### Phase 4: Polish & Scale (ongoing)

| # | Item | Category | Effort |
|---|------|----------|--------|
| 19 | Add component smoke/render tests (§5.2) | Testing | L |
| 20 | Enable `noUncheckedIndexedAccess` in tsconfig (§3.2) | Type Safety | M |
| 21 | Audit and reduce PWA precache list (§4.3) | Performance | S |
| 22 | Consolidate serverless function bundles (§6.4) | Performance | M |
| 23 | JSDoc on public store/hook APIs (§7.5) | DX | L |
| 24 | Accessibility audit across all apps (§5.2) | Accessibility | L |
| 25 | Extract typed store migration helpers (§2.2) | Architecture | S |

**Effort key:** XS = hours, S = 1–2 days, M = 3–5 days, L = 1–2 weeks

---

## Appendix: Codebase Stats

| Metric | Value |
|--------|-------|
| Source files (`.ts` + `.tsx`) | 433 |
| Apps | 20 |
| API routes | 40+ |
| Zustand stores | 25 |
| Test files | 23 |
| Build output | 212 MB (incl. Vercel functions) |
| PWA precache | 53 entries / 2.6 MB |
| Lint errors | 0 |
| Build errors | 0 |
| `node_modules` | 1.2 GB |
| Lines in largest file | 2,530 (`useAiChat.ts`) |
| `React.memo` usage | 1 component |
| `innerHTML =` occurrences | 15 (8 files) |
| `dangerouslySetInnerHTML` | 2 (1 file, sanitized) |
| Locales | 10 |
