# Code Quality Guardrails

This repository includes automated guardrails to keep code quality from regressing.

## Commands

```bash
bun run quality:check
bun run quality:check:json
bun run quality:summary quality-report.json
bun run quality:verify
bun run quality:all
bun run quality:all:ci
```

- `quality:check` runs static quality policy checks.
- `quality:check:json` runs the same checks and prints a JSON report.
- `quality:summary` renders the JSON report as markdown (useful for CI summaries).
- `quality:verify` runs strict lint/build and all quality regression tests.
- `quality:all` runs the full local quality gate by composing:
  1. `quality:check`
  2. `quality:verify`
- `quality:verify` includes:
  1. strict ESLint
  2. production build
  3. sanitizer runtime tests
  4. quality guardrail wiring tests
  5. quality workflow wiring tests
  6. package quality-scripts wiring tests
  7. quality summary renderer wiring tests
  8. README quality command wiring tests
  9. quality guardrail docs wiring tests
  10. quality audit report wiring tests
  11. chat wiring regression tests
- `quality:all:ci` runs the same suite, but starts with
  `quality:check:json > quality-report.json` so CI can publish a single-pass
  guardrail artifact and summary.

## Guardrail Policies

`scripts/check-quality-guardrails.ts` enforces:

- No `eslint-disable` comments in `src` / `_api` / `scripts`
- No `@ts-ignore` / `@ts-expect-error` in `src` / `_api` / `scripts`
- No `@ts-nocheck` comments in source or scripts
- No `innerHTML` assignments/mutations (`=`, `+=`) in `src`
- No `outerHTML` assignments/mutations (`=`, `+=`) in `src`
- No `insertAdjacentHTML(...)` usage in `src`
- No `document.write(...)` / `document.writeln(...)` usage in `src`
- No string-based timer execution (`setTimeout("...")`, `setInterval("...")`,
  `setImmediate("...")`, including template literals)
- No `execSync(` usage in `scripts` / `src` / `_api`
- No `child_process` `exec` imports in `scripts` / `src` / `_api`
  (use `execFileSync`/`spawnSync` instead)
- No `child_process.exec(...)` direct usage (including namespace/default import
  aliases and `require("child_process").exec(...)`)
  - alias detection is variable-aware to avoid false positives on unrelated
    `.exec(...)` calls in the same file
- No Prisma unsafe raw SQL methods (`queryRawUnsafe`, `executeRawUnsafe`, `$queryRawUnsafe`, `$executeRawUnsafe`)
- No `Prisma.raw(...)` usage
- No `shell: true` usage in `scripts` / `src` / `_api` (including quoted key syntax)
- No dynamic code execution (`eval(` / `new Function(` / `Function("...")`) in
  `scripts` / `src` / `_api`
- No `debugger` statements in `scripts` / `src` / `_api`
- No unresolved merge conflict markers (`<<<<<<<`, `|||||||`, `=======`,
  `>>>>>>>`) in tracked source, test, documentation, and JSON config files
- No unresolved task markers (`TODO`, `FIXME`, `HACK`, `XXX`) in `src` / `_api`
- Script task markers (`TODO`, `FIXME`, `HACK`, `XXX`) must stay at or below
  current baseline cap (19). Lower this cap as script debt is burned down.
- File-size regression bounds for TypeScript sources
  - max files over 1000 LOC
  - max files over 1500 LOC
  - max single-file LOC cap
- Script file-size regression bound
  - no `scripts/*.ts|js` files over 700 LOC
  - max script single-file LOC cap: 900
- Allowlisted `dangerouslySetInnerHTML` usage only
- Allowlisted `biome-ignore lint/correctness/useExhaustiveDependencies` usage only
  - both allowlisted checks also enforce max total occurrence caps
  - cap-overflow failures print offending allowlisted file paths for triage

Most content checks scan TypeScript and JavaScript sources (`.ts/.tsx/.js/.jsx`)
within the relevant roots.

## CI

GitHub Actions workflow `.github/workflows/code-quality.yml` runs:

```bash
bun run quality:all:ci
```

This keeps local and CI quality checks aligned.
`quality:all:ci` emits a machine-readable `quality-report.json`, which CI uploads
as a workflow artifact (`quality-report`) when present. CI also publishes a
markdown summary table to the GitHub Actions job summary, with total/failed
check counts, failed-check offender previews (top 5 per check), and a fallback
message if the JSON report was not produced.
`quality-report.json` offender entries use a consistent `{ path, count }` shape
across guardrails (for file-size checks, `count` is the offending LOC value).
Offender paths are normalized to forward slashes and emitted in deterministic order.
`quality-report.json` includes `schemaVersion` plus `totalChecks` and
`failedChecks` metadata.
Summary rendering now validates report schema and fails fast on malformed input
to prevent silent CI summary corruption.
Validation includes `passed` vs failed-status consistency and offender entry
shape checks (`path` + positive integer `count`).
Validation also enforces non-negative integer check values and blocks PASS checks
from carrying offender entries.
Validation enforces unique check names to avoid ambiguous summaries.
When count metadata is omitted, summary rendering derives counts from `checks`
for backward compatibility.
Workflow wiring tests additionally assert that the CI command (`quality:all:ci`)
is present in `package.json`, which prevents workflow/script drift.

## Notes for Contributors

- If you must change a threshold/allowlist, update:
  1. `scripts/check-quality-guardrails.ts`
  2. `tests/test-quality-guardrails.ts`
  3. related docs (this file and audit notes)
- Prefer fixing root causes over adding suppressions or allowlist entries.
