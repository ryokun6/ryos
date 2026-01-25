---
name: update-docs
description: Update ryOS documentation by analyzing the codebase and syncing docs with current implementation. Use when updating docs, syncing documentation, or when docs are outdated.
---

# Update Documentation

Update manually-written docs by launching parallel sub-agents for each section.

## Documentation Sections

| Section | Files | Related Code |
|---------|-------|--------------|
| Overview | `1-overview.md`, `1.1-architecture.md` | `src/`, `api/`, `package.json` |
| Apps Index | `2-apps.md` | `src/apps/*/index.ts`, `appRegistry.tsx` |
| Framework | `3-*.md` files | `src/components/layout/`, `src/stores/`, `src/themes/` |
| AI System | `4-ai-system.md` | `api/chat.ts`, `src/apps/chats/tools/` |
| File System | `5-file-system.md` | `useFileSystemStore.ts`, `src/apps/finder/` |
| Audio System | `6-audio-system.md` | `audioContext.ts`, `useSound.ts`, `src/apps/synth/` |
| UI Components | `7-*.md` files | `src/components/ui/`, `src/lib/locales/` |
| API Reference | `8-*.md` files | `api/*.ts` |

## Workflow

### 1. Launch Parallel Sub-Agents

For each section, launch a Task with:
1. Read current doc file(s)
2. Analyze relevant code for changes
3. Update outdated/missing info
4. Preserve existing structure
5. Report changes

### 2. Generate Changelog

For incremental updates (recommended):
```bash
bun run scripts/generate-changelog.ts --months=1
```

For full regeneration (12 months):
```bash
bun run scripts/generate-changelog.ts
```

### 3. Generate HTML

```bash
bun run scripts/generate-docs.ts
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

- **Changelog**: Use `--months=1` for recent updates, full regen only when needed
- **App docs**: Individual app pages (2.1-2.18) are auto-generated via `generate-app-docs.ts`
- **Preserve structure**: Keep headings, mermaid diagrams, formatting
- **Be conservative**: Only update clearly outdated info
- **Run HTML generation**: Always run `generate-docs.ts` after updates
