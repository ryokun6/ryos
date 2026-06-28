---
name: update-docs
description: Update ryOS documentation by analyzing the codebase and syncing docs with current implementation. Use when updating docs, syncing documentation, or when docs are outdated.
---

# Update Documentation

Update manually-written docs by launching parallel sub-agents for each section.

## Documentation Sections

Section files live in `docs/`. The list below covers the hand-written sections; app pages (`2.1`-`2.x`) are generated and the changelog (`9-changelog.md`) is curated by hand - see Notes.

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

### 2. Update the changelog

`docs/9-changelog.md` is curated. Edit it by hand when recent user-facing changes should be summarized. Do not run the changelog generator during routine doc refreshes.

For a full regeneration only:
```bash
bun run generate:docs:full
```

Or call the generator directly with `--force`:
```bash
bun run scripts/generate-changelog.ts --force
```

### 3. Generate HTML

```bash
bun run generate:docs
```

### 4. Review Changes

```bash
git diff docs/
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

- **Changelog**: `9-changelog.md` is curated. `scripts/generate-changelog.ts` skips an existing changelog unless `--force` is passed, and `tests/test-changelog-docs-sync.test.ts` guards the generated HTML against markdown drift
- **App docs**: Individual app pages (`2.1`, `2.2`, ... one per registered app) are auto-generated via `generate-app-docs.ts` - do NOT hand-edit them. The count tracks `appRegistry`, so the range grows as apps are added
- **One-shot generation**: `bun run generate:docs` runs `generate-app-docs.ts` in skip-existing mode, then `generate-docs.ts`. Use `bun run generate:docs:full` only when you intentionally want to force-regenerate the changelog before rendering HTML
- **Preserve structure**: Keep headings, mermaid diagrams, formatting
- **Be conservative**: Only update clearly outdated info
- **Run HTML generation**: Always run `generate-docs.ts` (or `generate:docs`) after updates
