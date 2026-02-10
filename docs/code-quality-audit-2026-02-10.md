# Code Quality Audit — 2026-02-10

This audit documents quality findings and remediations completed for the request:

> fix all lint errors, warnings, and perform a full code quality audit

## Verification Gates

- `bunx eslint . --max-warnings 0` ✅
- `bun run build` ✅
- `bun run test:chat-wiring` ✅
- `bun run test:quality-readme` ✅
- `bun run test:quality-docs` ✅
- `bun run quality:verify` ✅ (strict lint/build + quality regression tests)
- `bun run quality:all` ✅ (consolidated guardrails + lint + build + regression tests)
- `bun run quality:all:ci` ✅ (single-pass CI suite with JSON report emission)

> Note: the full API integration suite requires a running local API server and external env-backed services.

## Baseline vs Current Metrics

| Metric | Baseline | Current | Delta |
|---|---:|---:|---:|
| ESLint errors/warnings | 0 / 0 | 0 / 0 | maintained |
| `eslint-disable` occurrences (`src` + `_api`) | 22 | 0 | -22 |
| `@ts-ignore` / `@ts-expect-error` (`src` + `_api`) | 6 | 0 | -6 |
| `innerHTML = ...` assignments (`src`) | 15 | 0 | -15 |
| `execSync(` usages (`scripts`) | 2 | 0 | -2 |
| Files >1000 LOC (`src` + `_api`) | 30 | 29 | -1 |
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
- Added runtime regression coverage for sanitizer behavior:
  - `tests/test-songs-utils-sanitize.ts`
  - runnable via `bun run test:songs-utils`
- Added wiring tests for quality guardrail command behavior:
  - `tests/test-quality-guardrails.ts`
  - runnable via `bun run test:quality-guardrails`
  - includes failure-path coverage via temporary isolated roots to ensure violations fail as expected
    for `eslint-disable`, `dangerouslySetInnerHTML` allowlist violations, `shell: true`, and TODO/FIXME marker regressions.

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
- ✅ Added `bun run quality:check` (script: `scripts/check-quality-guardrails.ts`) to enforce:
  - suppression regression checks (`eslint-disable`, `@ts-ignore`, `@ts-nocheck`, `innerHTML =`, `execSync(`, `shell: true`)
    across application source and scripts
  - DOM assignment hardening (`innerHTML =`, `outerHTML =`,
    `innerHTML +=`, `outerHTML +=`, `insertAdjacentHTML(...)`,
    `document.write(...)` / `document.writeln(...)`)
  - command execution hardening (`child_process` `exec` import + direct usage blocked
    in scripts/source/api)
  - `execSync(` prevention scope expanded to scripts/source/api (not just scripts)
  - string-based timer execution prevention (`setTimeout("...")`,
    `setInterval("...")`, `setImmediate("...")`, including template-literal strings)
  - SQL safety guardrails (block unsafe Prisma raw SQL methods and `Prisma.raw(...)`)
  - dynamic code execution/debugging prevention (`eval(`, `new Function(`,
    `Function("...")`, `debugger`)
  - merge conflict marker prevention (`<<<<<<<`, `=======`, `>>>>>>>`)
  - no unresolved task markers in source (`TODO`, `FIXME`, `HACK`, `XXX`)
  - script task-marker baseline cap (19) to prevent regression while legacy markers are burned down
  - file-size regression checks (max files over 1000 LOC, max files over 1500 LOC,
    and max single-file LOC cap).
  - cached source/candidate file scanning for faster quality-check execution.
  - expanded scanning coverage to include JavaScript sources where relevant (`.js`, `.jsx`).
  - allowlisted `dangerouslySetInnerHTML` usage (only permitted in `HtmlPreview` stream renderer).
  - allowlisted `biome-ignore lint/correctness/useExhaustiveDependencies` usage (currently only permitted in `useStreamingFetch`).
- Added machine-readable output mode: `bun run quality:check:json`.
- Added `bun run quality:verify` to centralize strict lint/build + regression-test stages.
- `quality:all` and `quality:all:ci` now compose `quality:verify`, reducing script drift risk.
- Added `bun run quality:all:ci` to run the full CI quality suite while emitting
  `quality-report.json` in the same command.
- `quality:check:json` now emits `schemaVersion`, `totalChecks`, and
  `failedChecks` metadata; summary rendering validates schema/metadata consistency
  against check rows.
- Summary rendering remains backward-compatible by deriving check counts from
  `checks` when optional metadata fields are absent.
- CI now publishes `quality-report.json` as an artifact and emits a markdown
  summary table in the workflow job summary.
- Added package script wiring coverage:
  - `tests/test-quality-scripts-wiring.ts`
  - included in `quality:all` via `bun run test:quality-scripts`.
  - asserts `quality:all:ci` generates `quality-report.json` before subsequent stages.
  - asserts `quality:all`/`quality:all:ci` composition stays non-recursive.
- Added workflow wiring coverage:
  - `tests/test-quality-workflow-wiring.ts`
  - included in `quality:all` via `bun run test:quality-workflow`.
- Guardrail wiring tests assert JSON-mode output includes the full expected set of
  critical guardrails (security, merge safety, and maintainability thresholds).
- Guardrail wiring tests validate JSON offender schema contract (`{ path, count }`)
  across different failing guardrail types.
- Guardrail wiring tests validate deterministic JSON output ordering/values across
  repeated runs to prevent flaky CI report diffs.
- Guardrail wiring tests assert the complete expected guardrail name set in JSON
  output to detect accidental policy removal.
- Guardrail wiring tests assert stable JSON check ordering to prevent report
  churn and accidental reorder drift.
- Guardrail wiring tests assert explicit threshold metadata for baseline-capped
  script task markers (`<= 19`) to prevent silent cap drift.
- Guardrail wiring tests verify generated markdown summaries surface
  `schemaVersion` from live JSON reports.
- Guardrail wiring tests cover both allowlisted-path violations and allowlisted
  total-cap violations for sensitive patterns (`dangerouslySetInnerHTML`,
  `biome-ignore lint/correctness/useExhaustiveDependencies`).
  - includes boundary pass checks at exact allowlist caps to prevent off-by-one regressions.
  - includes cap-overflow diagnostics assertions that offending allowlisted paths are reported.
- Guardrail wiring tests include JavaScript-path failure cases (`innerHTML`,
  `execSync`, and `dangerouslySetInnerHTML`) to verify cross-language scan parity.
- Guardrail wiring tests include markdown merge-marker failure cases to verify
  non-code file safety checks in configured roots.
  - includes YAML merge-marker failure coverage as well.
- Guardrail wiring tests cover unsafe Prisma raw SQL variants
  (`$queryRawUnsafe`, `$executeRawUnsafe`) to enforce SQL safety policy.
  - includes non-prefixed `queryRawUnsafe`/`executeRawUnsafe` variant checks.
  - includes direct `Prisma.raw(...)` usage regression coverage.
- Guardrail wiring tests include `child_process.exec` direct-call variants,
  including namespace/default aliases and inline `require("child_process").exec(...)` usage.
- Guardrail offender paths/order are stabilized (forward-slash path normalization +
  deterministic tie-break ordering for equal-size offenders).
- Added summary renderer wiring coverage:
  - `tests/test-quality-summary-wiring.ts`
  - included in `quality:all` via `bun run test:quality-summary`.
  - includes malformed report validation to ensure summary rendering fails loudly
    for invalid `quality-report.json` shapes.
  - includes explicit `schemaVersion` type/positivity validation coverage.
- Added README quality command wiring coverage:
  - `tests/test-quality-readme-wiring.ts`
  - included in `quality:all` via `bun run test:quality-readme`.
  - verifies both top-level quality commands and quality wiring test commands are
    documented and mapped to package scripts.
- Added guardrail documentation wiring coverage:
  - `tests/test-quality-docs-wiring.ts`
  - included in `quality:all` via `bun run test:quality-docs`.
- Added audit report wiring coverage:
  - `tests/test-quality-audit-wiring.ts`
  - included in `quality:all` via `bun run test:quality-audit`.
- Summary renderer now includes failed-check offender previews (top 5 per failed check)
  to speed up CI triage from the GitHub Actions job summary.
- Guardrail JSON/report offender schema is normalized to `{ path, count }` across
  all checks (with file-size `count` representing LOC), improving summary reliability.
- Workflow wiring tests now also verify that `quality:all:ci` referenced by CI is
  actually defined in `package.json`, preventing workflow/package command drift.
- Workflow wiring tests also verify trigger branch filters and runtime safeguards
  (explicit timeout + concurrency cancellation) to reduce CI drift risk.
- Workflow wiring tests verify report-publishing step ordering (quality run →
  summary publish → artifact upload) to prevent CI reporting regressions.
- Workflow wiring tests verify dependency installation uses
  `bun install --frozen-lockfile` for reproducible CI runs.
- Workflow wiring tests assert dependency installation happens before
  quality-suite execution.
- Workflow wiring tests assert key action pins (`actions/checkout@v4`,
  `oven-sh/setup-bun@v2`) remain explicit.
- Workflow wiring tests assert CI avoids standalone `quality:check`/`quality:verify`
  invocations to preserve the consolidated `quality:all:ci` path.
- Workflow wiring tests assert CI avoids inline `test:quality-*` command runs,
  preventing drift from consolidated script orchestration.

### Low priority

- ✅ Added lightweight runtime tests for `sanitizeInput` in
  `tests/test-songs-utils-sanitize.ts`.
