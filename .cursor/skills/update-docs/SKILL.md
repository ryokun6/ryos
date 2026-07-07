---
name: update-docs
description: Update ryOS documentation by analyzing the codebase and syncing docs with current implementation. Use when updating docs, syncing documentation, or when docs are outdated.
---

# Update Documentation

Update manually-written docs by launching parallel sub-agents for each section.

## Documentation Sections

Section files live in `docs/`. The list below covers the hand-written sections; app pages (`2.1`–`2.x`) are generated and the changelog (`9-changelog.md`) is hand-curated — see Notes.

| Section | Files | Related Code |
|---------|-------|--------------|
| Overview | `1-overview.md`, `1.1-architecture.md`, `1.2-api-architecture.md`, `1.3-self-hosting-vps.md` | `src/`, `api/`, `package.json` |
| Apps Index | `2-apps.md` | `src/config/appRegistry.tsx`, `src/apps/*/metadata.ts` |
| Framework | `3-*.md` (incl. `3.1`–`3.5`, `3.3.1`) | `src/components/layout/`, `src/stores/`, `src/themes/`, `src/hooks/` |
| AI System | `4-ai-system.md` | `api/chat.ts`, `api/chat/tools/`, `src/apps/chats/tools/` |
| File System | `5-file-system.md` | `useFilesStore.ts`, `src/apps/finder/` |
| Audio System | `6-audio-system.md` | `audioContext.ts`, `useSound.ts`, `src/apps/synth/` |
| UI Components | `7-*.md` (incl. `7.1` component library, `7.2` i18n) | `src/components/ui/`, `src/lib/locales/` |
| API Reference | `8-*.md` (incl. `8.1`–`8.10`) | `api/*.ts`, `docs/8.10-api-design-guide.md` |
| Legal | `10-privacy.md`, `11-terms.md` | n/a (manual) |

Run `ls docs/*.md` before starting so the section list reflects what currently exists.

## Workflow

### 1. Launch Parallel Sub-Agents

For each section, launch a Task with:
1. Read current doc file(s)
2. Analyze relevant code for changes
3. Update outdated/missing info
4. Preserve existing structure
5. Report changes

### 2. Update the Changelog (manual curation)

`docs/9-changelog.md` is **hand-curated** — do NOT regenerate it. `generate-changelog.ts` skips when the file exists and `--force` (or `generate:docs:full`) would destroy the curated featured cards. Instead:

1. Find what's new since the last curation:
   ```bash
   git log -1 --format=%H -- docs/9-changelog.md   # last changelog commit
   git log <that-hash>..HEAD --no-merges --pretty='%ad %s' --date=short
   ```
2. Add new bullets to the current month's `<details>` block (never delete old content) and update the `More from this month (N)` count. Style: capitalized action verb, user-facing language; bold `**Name**:` only for significant items.
3. For headline features, add a featured card at the top of the month's `changelog-feature-grid` (newest first — the docs home "latest changelog" cards are built from the first two entries in document order):
   ```html
   <article class="changelog-feature"><img src="/docs-assets/changelog/YYYY-MM-NN-slug-16x9.webp" alt="Feature in the <Month Year> ryOS snapshot" width="1280" height="720" loading="lazy"><div class="changelog-feature-copy"><h3>Feature</h3><p>One-line description.</p></div></article>
   ```
   Max 5 featured cards per month (test-enforced).

### 3. Capture Changelog Screenshots

Featured cards need an exactly **1280×720 WebP** in `public/docs-assets/changelog/`, named `YYYY-MM-NN-slug-16x9.webp`. Capture from the running app:

1. Start `bun run dev`, then screenshot with Playwright (`playwright-core` is in node_modules; Chrome at `/usr/bin/google-chrome-stable`) using a `1280x720` viewport, `deviceScaleFactor: 1`. Open the relevant app/pane (`http://localhost:5173/<app-id>` launches an app directly) and wait ~20s for boot + entrance animations.
2. Stage the shot deliberately:
   - **Center the main window** in the frame, between the menubar (~30px) and the top of the dock — the window must NOT overlap the dock. Drag its title bar with `page.mouse` — the window root is `[data-window-instance-id]` and the drag handle is its `.title-bar` child; compute the delta from the window's `getBoundingClientRect()` to `(1280 - width) / 2` horizontally and `menubar + (dockTop - menubar - height) / 2` vertically, and move in ~10 steps so the drag registers.
   - **Keep the desktop clean**: no extra windows, dialogs, or launch toasts (let them time out before capturing). Default desktop icons and the dock are fine.
   - **Keep the default shuffle wallpaper** (a fresh profile picks a random nature wallpaper per load). If the shuffle lands on something too busy or low-contrast behind the window, just re-run the capture for a new roll rather than pinning a wallpaper.
3. Convert: `sharp(png).webp({ quality: 80 }).toFile(...)` and verify metadata is 1280×720.
4. The Vite watcher ignores `public/**` — restart the dev server before visually verifying new assets, or they 200 with the SPA HTML fallback.

### 4. Generate HTML

```bash
bun run generate:docs   # generate-app-docs.ts + generate-docs.ts
```

This regenerates all of `public/docs/`. Commit `changelog.html` **and** `overview.html` (its latest-changelog cards come from the two newest featured entries). Other pages may also change if their markdown drifted — review each diff and include legitimate syncs. Caution: the secret scanner can block committing `self-hosting-vps.html` from cloud agents (its content matches the `STORAGE_PROVIDER` secret value); unstage and revert it if flagged.

### 5. Sync Tests

`tests/test-changelog-docs-sync.test.ts` enforces md/HTML sync, 1280×720 screenshot dimensions, month count, the ≤5 featured limit, and the exact featured-screenshot lists for recent months — update its expectations (and add new anchor phrases) when the featured set changes, then run:

```bash
bun test tests/test-changelog-docs-sync.test.ts tests/test-generate-docs-path-links.test.ts
```

### 6. Review Changes

```bash
git diff docs/ public/docs/ tests/
```

## Sub-Agent Prompts

**Overview**: Review `package.json`, `src/` structure → update tech stack, features

**Apps Index**: Review `src/apps/*/index.ts`, `appRegistry.tsx` → update app list

**Framework**: Review `WindowFrame.tsx`, stores, themes → update window/state/theme docs

**AI System**: Review `api/chat.ts`, tools → update models, capabilities

**File System**: Review `useFileSystemStore.ts`, finder → update operations

**Audio System**: Review `audioContext.ts`, synth → update audio features

**UI Components**: Review `src/components/ui/`, locales → update component list, i18n

**API Reference**: Review `api/*.ts` → update endpoints, request/response formats

## Section Shortcuts

| Arg | Sections |
|-----|----------|
| `overview` | 1-overview, 1.1-architecture |
| `apps` | 2-apps |
| `framework` | 3-* files |
| `ai` | 4-ai-system |
| `filesystem` | 5-file-system |
| `audio` | 6-audio-system |
| `ui` | 7-* files |
| `api` | 8-* files |

## Notes

- **Changelog**: `9-changelog.md` is hand-curated (featured cards + screenshots + monthly bullets). `generate-changelog.ts` only exists to bootstrap a missing file from git history; never run it with `--force` (and avoid `generate:docs:full`, which does) over curated content
- **App docs**: Individual app pages (`2.1`, `2.2`, … one per registered app) are auto-generated via `generate-app-docs.ts` — do NOT hand-edit them. The count tracks `appRegistry`, so the range grows as apps are added
- **One-shot generation**: `bun run generate:docs` runs `generate-app-docs.ts` → `generate-docs.ts`; the changelog md is left untouched
- **Preserve structure**: Keep headings, mermaid diagrams, formatting
- **Be conservative**: Only update clearly outdated info
- **Run HTML generation**: Always run `generate-docs.ts` (or `generate:docs`) after updates
