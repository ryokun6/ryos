# Code Quality Audit — 2026-02-10

This audit documents quality findings and remediations completed for the request:

> fix all lint errors, warnings, and perform a full code quality audit

## Verification Gates

- `bunx eslint . --max-warnings 0` ✅
- `bun run build` ✅
- `bun run test:chat-wiring` ✅

> Note: the full API integration suite requires a running local API server and external env-backed services.

## Baseline vs Current Metrics

| Metric | Baseline | Current | Delta |
|---|---:|---:|---:|
| ESLint errors/warnings | 0 / 0 | 0 / 0 | maintained |
| `eslint-disable` occurrences (`src` + `_api`) | 22 | 0 | -22 |
| `@ts-ignore` / `@ts-expect-error` (`src` + `_api`) | 6 | 0 | -6 |
| `innerHTML = ...` assignments (`src`) | 15 | 0 | -15 |
| `execSync(` usages (`scripts`) | 2 | 0 | -2 |
| Files >1500 LOC (`src` + `_api`) | 14 | 14 | unchanged |

## Implemented Remediations

### 1) DOM safety and duplication cleanup

- Added `src/utils/htmlEntities.ts` as a shared single-pass HTML entity decoder.
- Removed duplicate entity-decoding implementations in:
  - `src/apps/chats/components/ChatMessages.tsx`
  - `src/apps/chats/hooks/useChatRoom.ts`
  - `src/hooks/useBackgroundChatNotifications.ts`
  - `src/components/dialogs/SongSearchDialog.tsx`
  - `src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts`
  - `src/stores/useChatsStore.ts`
- Replaced direct `innerHTML = ...` assignments with safer alternatives (`replaceChildren`, `textContent`) in:
  - `src/apps/soundboard/components/Waveform.tsx`
  - `src/apps/pc/hooks/usePcLogic.ts`
  - `src/apps/terminal/hooks/useTerminalLogic.ts`

### 2) Command execution hardening

- `scripts/build-tauri.ts`
  - Replaced shell `execSync` chaining with explicit `spawnSync` command/args execution.
- `scripts/generate-build-version.ts`
  - Replaced `execSync("git ...")` with `execFileSync("git", ["..."])`.

### 3) Suppression and typing debt reduction

- Removed all TypeScript suppression comments in `src` (`@ts-ignore` / `@ts-expect-error` now zero).
- Removed all `no-explicit-any` and `ban-ts-comment` suppressions in touched files.
- Tightened types in:
  - `src/apps/terminal/types/index.ts`
  - `src/apps/admin/hooks/useAdminLogic.ts`
  - `src/stores/useKaraokeStore.ts`
  - `src/stores/useIpodStore.ts`
  - `src/apps/finder/hooks/useFileSystem.ts`
  - `src/apps/base/AppManager.tsx`
- Removed the remaining `react-hooks/exhaustive-deps` suppressions in `src/hooks/useFurigana.tsx`.
- Refactored `_api/songs/_utils.ts` invisible-character sanitizer away from a suppression-requiring regex class
  to explicit code point filtering.

## Residual Risk / Backlog (Prioritized)

### High priority (maintainability)

Large files remain the biggest quality risk (all >1500 LOC):

- `src/components/layout/Dock.tsx` (2563)
- `src/apps/chats/hooks/useAiChat.ts` (2388)
- `src/apps/internet-explorer/hooks/useInternetExplorerLogic.ts` (2050)
- `src/stores/useChatsStore.ts` (1950)
- `src/apps/finder/hooks/useFileSystem.ts` (1902)
- `src/apps/ipod/hooks/useIpodLogic.ts` (1873)
- `src/apps/paint/components/PaintCanvas.tsx` (1866)
- `src/apps/ipod/components/LyricsDisplay.tsx` (1842)
- `_api/songs/[id].ts` (1772)
- `src/apps/terminal/hooks/useTerminalLogic.ts` (1653)
- `src/components/layout/WindowFrame.tsx` (1649)
- `src/components/layout/MenuBar.tsx` (1638)
- `src/components/shared/HtmlPreview.tsx` (1570)
- `src/stores/useIpodStore.ts` (1527)

**Recommendation:** split by responsibility (state orchestration, side effects, UI rendering, network/data transforms) and enforce per-file size/complexity guardrails.

### Medium priority

- Add an automated CI quality gate for:
  - `bunx eslint . --max-warnings 0`
  - `bun run build`
  - suppression regression checks (`eslint-disable`, `@ts-ignore`, `innerHTML =`, `execSync(`)

### Low priority

- Add lightweight tests around `sanitizeInput` to lock in expected invisible-character filtering behavior.
