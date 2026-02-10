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
  8. chat wiring regression tests
- `quality:all:ci` runs the same suite, but starts with
  `quality:check:json > quality-report.json` so CI can publish a single-pass
  guardrail artifact and summary.

## Guardrail Policies

`scripts/check-quality-guardrails.ts` enforces:

- No `eslint-disable` comments in `src` / `_api`
- No `@ts-ignore` / `@ts-expect-error` in `src` / `_api`
- No `@ts-nocheck` comments in source or scripts
- No `innerHTML = ...` assignments in `src`
- No `execSync(` usage in `scripts`
- No `shell: true` usage in `scripts` / `src` / `_api`
- No dynamic code execution (`eval(` / `new Function(`) in `scripts` / `src` / `_api`
- No `debugger` statements in `scripts` / `src` / `_api`
- No unresolved task markers (`TODO`, `FIXME`, `HACK`, `XXX`) in `src` / `_api`
- File-size regression bounds for TypeScript sources
  - max files over 1000 LOC
  - max files over 1500 LOC
  - max single-file LOC cap
- Allowlisted `dangerouslySetInnerHTML` usage only
- Allowlisted `biome-ignore lint/correctness/useExhaustiveDependencies` usage only

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
Workflow wiring tests additionally assert that the CI command (`quality:all:ci`)
is present in `package.json`, which prevents workflow/script drift.

## Notes for Contributors

- If you must change a threshold/allowlist, update:
  1. `scripts/check-quality-guardrails.ts`
  2. `tests/test-quality-guardrails.ts`
  3. related docs (this file and audit notes)
- Prefer fixing root causes over adding suppressions or allowlist entries.
