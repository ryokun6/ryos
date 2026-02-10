# Code Quality Guardrails

This repository includes automated guardrails to keep code quality from regressing.

## Commands

```bash
bun run quality:check
bun run quality:check:json
bun run quality:summary quality-report.json
bun run quality:all
```

- `quality:check` runs static quality policy checks.
- `quality:check:json` runs the same checks and prints a JSON report.
- `quality:summary` renders the JSON report as markdown (useful for CI summaries).
- `quality:all` runs the full local quality gate:
  1. `quality:check`
  2. strict ESLint
  3. production build
  4. sanitizer runtime tests
  5. quality guardrail wiring tests
  6. quality workflow wiring tests
  7. chat wiring regression tests

## Guardrail Policies

`scripts/check-quality-guardrails.ts` enforces:

- No `eslint-disable` comments in `src` / `_api`
- No `@ts-ignore` / `@ts-expect-error` in `src` / `_api`
- No `innerHTML = ...` assignments in `src`
- No `execSync(` usage in `scripts`
- No `shell: true` usage in `scripts` / `src` / `_api`
- No unresolved task markers (`TODO`, `FIXME`, `HACK`, `XXX`) in `src` / `_api`
- File-size regression bounds for TypeScript sources
- Allowlisted `dangerouslySetInnerHTML` usage only
- Allowlisted `biome-ignore lint/correctness/useExhaustiveDependencies` usage only

## CI

GitHub Actions workflow `.github/workflows/code-quality.yml` runs:

```bash
bun run quality:all
```

This keeps local and CI quality checks aligned.
CI also generates a machine-readable `quality-report.json` via:

```bash
bun run quality:check:json
```

and uploads it as a workflow artifact (`quality-report`).
It also publishes a markdown summary table to the GitHub Actions job summary.

## Notes for Contributors

- If you must change a threshold/allowlist, update:
  1. `scripts/check-quality-guardrails.ts`
  2. `tests/test-quality-guardrails.ts`
  3. related docs (this file and audit notes)
- Prefer fixing root causes over adding suppressions or allowlist entries.
