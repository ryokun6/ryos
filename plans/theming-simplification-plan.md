# Theming simplification plan

Last updated: 2026-06-13

## Goal

Simplify ryOS theming by consolidating around the existing root attribute + CSS token architecture, reducing component-level theme branching, and making shared themed surfaces reusable.

## Current progress

| Phase | Status | Progress | Notes |
| --- | --- | ---: | --- |
| 0. Plan and inventory | Complete | 4 / 4 | Initial architecture audit completed; this plan created in PR #1484. |
| 1. Fix small API/documentation drift | Complete | 4 / 4 | Constants/docs fixed; legacy aliases preserved with clearer names. |
| 2. Consolidate reusable surfaces | Complete | 6 / 6 | Added shared card, drawer, toolbar, and Windows bevel primitives. |
| 3. Reduce static React theme branches | Complete | 5 / 5 | Tokenized separators and moved repeated Aqua dark states to variants/helpers. |
| 4. Split and normalize CSS layers | Complete | 5 / 5 | `themes.css` now imports focused layer files under `src/styles/themes/`. |
| 5. Normalize theme data sources | Not started | 0 / 5 | Make TS metadata and CSS tokens harder to drift. |
| 6. Regression pass and docs | Not started | 0 / 5 | Validate all themes and update guidance. |

## Update protocol

When work lands, update this file in the same PR:

1. Change task checkboxes from `[ ]` to `[x]`.
2. Update the phase row in "Current progress".
3. Add an entry to "Progress log" with the date, branch/PR if known, and validation performed.
4. If a task changes scope, update the acceptance criteria before implementing.

## Architecture target

The target architecture keeps the existing model:

- `useThemeStore` owns persisted user preferences and applies root attributes.
- `<html>` data attributes are the runtime contract.
- `themes.css` token blocks are the visual source of truth.
- Tailwind `bg-os-*`, `text-os-*`, `border-os-*`, and `os-*:` variants are preferred for static styling.
- React theme flags are reserved for behavior/layout decisions that CSS cannot express cleanly.

No migration to React Context is planned; Zustand is already serving the global preference/state role.

## Phase 0. Plan and inventory

Acceptance criteria:

- There is a tracked simplification plan in `/plans`.
- Known theming entry points and major duplication hotspots are documented.
- Progress can be updated without re-running the full architecture audit.

Tasks:

- [x] Audit theme store, root attributes, CSS tokens, Tailwind variants, and docs.
- [x] Audit representative theme consumers and duplication hotspots.
- [x] Create this progress-tracked plan.
- [x] Add links to the eventual PRs/issues for each phase as they are created.

## Phase 1. Fix small API/documentation drift

Acceptance criteria:

- Documentation and exported constants match the codebase.
- Naming no longer implies XP when the logic applies to both Windows themes.
- No visual behavior changes.

Tasks:

- [x] Export `OS_NATIVE_CHROME_SKIP_CLASS` from `src/lib/themeChrome.ts` and fix the broken file comment.
- [x] Replace raw `"os-native-chrome-skip"` usage with the exported constant.
- [x] Update `.cursor/skills/ui-design-styling/SKILL.md` examples to use `useThemeFlags()` instead of non-existent `useTheme()`.
- [x] Rename misleading wrapper aliases where `isWindowsTheme` is exposed as `isXpTheme`; keep legacy aliases until downstream prop names are migrated.

Validation:

- Run targeted TypeScript/build check or affected unit tests.
- Manually verify no generated CSS or theme behavior changed.

## Phase 2. Consolidate reusable surfaces

Acceptance criteria:

- Repeated four-theme class ladders are centralized.
- Theme-specific shell/card changes happen in one helper or CSS class.
- Existing visual appearance stays equivalent across System 7, Aqua, XP, and Win98.

Tasks:

- [x] Replace `MapsPlaceCard` shell classes with `toolInlineCardShellClassName()` or a more general replacement.
- [x] Promote `toolInlineCardShellClassName()` into a generic `OsCard`/`osCardClassName` helper if it is no longer chat-specific.
- [x] Add shared panel/drawer classes for `AppDrawer`, Maps cards, chat cards, and drawer-like surfaces.
- [x] Extract shared toolbar surface styling for Calendar, Contacts, TV, and similar toolbars.
- [x] Add a small shared Windows bevel helper/class for raised/sunken Win98 surfaces.
- [x] Migrate at least two duplicated consumers before expanding the pattern further.

Validation:

- Run targeted tests for touched apps/components.
- Visually inspect affected surfaces in all four themes if UI changes are made.

## Phase 3. Reduce static React theme branches

Acceptance criteria:

- Static visual differences move to CSS tokens, Tailwind variants, or shared helper classes.
- `useThemeFlags()` remains available for behavioral branching.
- Components become easier to read without losing exact-theme affordances.

Tasks:

- [x] Replace hardcoded XP and Win98 colors with `--os-*` tokens or new semantic tokens where appropriate.
- [x] Use `os-windows:`, `os-mac-aqua:`, `os-mac-system7:`, and `os-mac-aqua-dark:` variants for simple static class differences.
- [x] Keep JS branches only for structural differences, event behavior, asset choice, or layout logic.
- [x] Convert repeated dark Aqua hover/focus branches to `os-mac-aqua-dark:` utilities or CSS classes.
- [x] Document examples of "CSS branch" versus "React branch" in the theme architecture doc.

Validation:

- Run targeted tests.
- Compare representative screens in light Aqua and dark Aqua to catch token regressions.

## Phase 4. Split and normalize CSS layers

Acceptance criteria:

- CSS is separated by responsibility without changing cascade behavior.
- Imports preserve current ordering.
- App-specific containment rules are isolated from base token definitions.

Proposed files:

- `src/styles/themes/tokens.css`
- `src/styles/themes/platform.css`
- `src/styles/themes/aqua.css`
- `src/styles/themes/windows.css`
- `src/styles/themes/dark-aqua.css`
- `src/styles/themes/aqua-glass.css`
- `src/styles/themes/containment.css`
- `src/styles/themes.css` as the import orchestrator

Tasks:

- [x] Move default and per-theme `--os-*` token blocks into `tokens.css`.
- [x] Move `data-os-platform` shared rules into `platform.css`.
- [x] Move Aqua structural chrome into `aqua.css`.
- [x] Move Windows structural chrome and legacy overrides into `windows.css`.
- [x] Move third-party/app escape hatches into `containment.css`.

Validation:

- Run `bun run build`.
- Compare generated CSS behavior in all four themes.

## Phase 5. Normalize theme data sources

Acceptance criteria:

- Theme metadata remains available to TypeScript.
- Visual tokens are not duplicated in two authoritative places.
- Adding a fifth theme has a clear checklist and fewer required files.

Tasks:

- [ ] Decide whether TS theme `colors`/`metrics` should be removed, marked documentation-only, or generated from a manifest.
- [ ] If retained, add a drift check comparing TS theme values against CSS token definitions for key values.
- [ ] Move allowed theme IDs and dark-support metadata used by the boot script into a shared generated/static artifact.
- [ ] Document the supported path for adding a new theme.
- [ ] Keep cloud sync payload shape stable while refactoring theme internals.

Validation:

- Add or update tests for theme ID sanitization and sync compatibility if internals change.
- Verify first paint attributes still match hydrated store attributes.

## Phase 6. Regression pass and docs

Acceptance criteria:

- The simplification is covered by docs and focused tests.
- All four themes retain expected chrome, typography, menus, dialogs, cards, drawers, and shell controls.
- Dark Aqua still works through `data-os-color-scheme="dark"` and `.dark`.

Tasks:

- [ ] Update `docs/3.3.1-theme-architecture.md`.
- [ ] Update `docs/3.3-theme-system.md` if user-facing behavior changes.
- [ ] Update `.cursor/skills/ui-design-styling/SKILL.md` with preferred primitives and examples.
- [ ] Add targeted tests for helper outputs or theme state behavior where useful.
- [ ] Complete a manual visual pass for major shared surfaces when UI code changes.

Validation:

- Run relevant Bun tests.
- Run `bun run build` before merging broad CSS or shared component changes.
- Capture screenshots/video only when visual verification is explicitly requested or a UI change requires it.

## Risk register

| Risk | Mitigation |
| --- | --- |
| CSS split changes cascade order | Keep `themes.css` as an import orchestrator and move blocks in-place by order. |
| Tokens do not cover a hardcoded visual detail | Add semantic `--os-*` tokens before replacing literals. |
| `isXpTheme` rename causes behavioral confusion | Rename locally in small PRs and preserve exact `isWinXp` / `isWin98` flags. |
| Boot script drifts from store logic | Generate or share a minimal static theme config for boot-time use. |
| Dark Aqua regressions | Test token-driven surfaces in both Aqua light and Aqua dark after each CSS migration. |
| Windows legacy CSS conflicts with tokenized classes | Migrate Windows shell pieces incrementally and test XP/Win98 separately. |

## Progress log

- 2026-06-13: Phase 1 completed in PR #1484. Exported the native chrome skip class, switched Paint to the shared constant, corrected skill docs to use `useThemeFlags()`, and added clearer Windows/Aqua names in wrapper hooks while retaining legacy aliases for compatibility.
- 2026-06-13: Phase 2 completed in PR #1484. Added `osThemePrimitives`, routed inline tool cards and Maps cards through the shared card helper, moved `AppDrawer` placement styling into a drawer helper, centralized Calendar/Contacts/TV toolbar surfaces, and added unit coverage for the primitive outputs.
- 2026-06-13: Phase 2 validation completed. `bun test tests/test-os-theme-primitives.test.ts` and `bun run build` passed; Playwright screenshot comparison against baseline commit `7bf4823c9dd2e632ba769aff21817e6e555daccf` passed for `macosx`, `macosx` dark, `system7`, `xp`, and `win98` using preview builds.
- 2026-06-13: Phase 3 completed in PR #1484. Replaced repeated dark-Aqua hover/focus branches with `os-mac-aqua-dark:` helper classes, added reusable subtle icon and separator helpers, tokenized Calendar/AppDrawer separators, and documented when to use CSS branches versus React branches.
- 2026-06-13: Phase 3 validation completed. `bun test tests/test-os-theme-primitives.test.ts` and `bun run build` passed; Playwright preview-build screenshot comparison against baseline commit `7bf4823c9dd2e632ba769aff21817e6e555daccf` passed for `macosx`, `macosx` dark, `system7`, `xp`, and `win98`.
- 2026-06-13: Phase 4 completed in PR #1484. Split `src/styles/themes.css` into focused CSS layers under `src/styles/themes/`, keeping `themes.css` as the import orchestrator. Added `aqua-glass.css` as a separate post-dark layer so glass overrides preserve the original cascade.
- 2026-06-13: Created the initial plan after auditing the store, root attributes, CSS token architecture, Tailwind variants, and representative component consumers.
