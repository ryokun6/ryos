# Update Documentation Command

Update non-generated documentation pages by analyzing the codebase and ensuring docs reflect the current implementation. Uses parallel sub-agents to update different documentation sections.

## Usage

`/update-docs` - Update all manually-written documentation sections
`/update-docs [section]` - Update a specific section (e.g., `/update-docs overview`, `/update-docs api`)

## Non-Generated Documentation Files

These are the manually-written docs that this command updates (app docs 2.1-2.17 and changelog are auto-generated separately):

| Section | Files | Related Code |
|---------|-------|--------------|
| Overview | `1-overview.md`, `1.1-architecture.md` | `src/`, `_api/`, `package.json` |
| Apps Index | `2-apps.md` | `src/apps/*/index.ts`, `src/config/appRegistry.tsx` |
| Framework | `3-application-framework.md`, `3.1-window-management.md`, `3.2-state-management.md`, `3.3-theme-system.md` | `src/components/layout/`, `src/stores/`, `src/themes/`, `src/contexts/` |
| AI System | `4-ai-system.md` | `_api/chat.ts`, `src/apps/chats/tools/`, `_api/_utils/aiPrompts.ts` |
| File System | `5-file-system.md` | `src/stores/useFileSystemStore.ts`, `src/apps/finder/` |
| Audio System | `6-audio-system.md` | `src/lib/audioContext.ts`, `src/hooks/useSound.ts`, `src/stores/useAudioSettingsStore.ts`, `src/apps/synth/`, `src/apps/soundboard/` |
| UI Components | `7-ui-components.md`, `7.1-component-library.md`, `7.2-i18n.md` | `src/components/ui/`, `src/components/shared/`, `src/lib/locales/`, `src/utils/i18n.ts` |
| API Reference | `8-api-reference.md`, `8.1-chat-api.md`, `8.2-song-api.md`, `8.3-media-api.md`, `8.4-chat-rooms-api.md`, `8.5-ai-generation-apis.md`, `8.6-utility-apis.md` | `_api/*.ts` |

## Workflow

### Step 1: Launch Parallel Sub-Agents

Launch sub-agents for each documentation section in parallel using the Task tool. Each sub-agent should:

1. **Read the current documentation file(s)** for its assigned section
2. **Analyze the relevant codebase** to identify:
   - New features, hooks, components, or APIs not yet documented
   - Outdated information that no longer matches the code
   - Missing technical details (types, interfaces, configurations)
   - Broken references or file paths
3. **Update the documentation** to reflect the current state
4. **Preserve the existing structure** and style of the document
5. **Report changes made** in a summary

### Step 2: Sub-Agent Prompts

Use these prompts for each section. Launch all applicable sub-agents in parallel:

#### Overview Section (1-overview.md, 1.1-architecture.md)
```
You are updating ryOS documentation. Focus on the Overview section.

1. Read docs/1-overview.md and docs/1.1-architecture.md
2. Review: package.json (dependencies), src/ folder structure, _api/ folder
3. Update:
   - Tech stack table if dependencies changed
   - Project structure if folders added/removed
   - Feature list if major features added
   - Architecture diagrams if flow changed
4. Preserve existing mermaid diagrams but update content
5. Report what you updated
```

#### Apps Index (2-apps.md)
```
You are updating ryOS documentation. Focus on the Apps Index.

1. Read docs/2-apps.md
2. Review: src/apps/*/index.ts files, src/config/appRegistry.tsx
3. Update:
   - List of all apps with current names and descriptions
   - App count statistics
   - Any new apps or removed apps
4. Do NOT regenerate individual app docs (those are auto-generated)
5. Report what you updated
```

#### Framework Section (3-*.md files)
```
You are updating ryOS documentation. Focus on the Application Framework.

1. Read: docs/3-application-framework.md, docs/3.1-window-management.md, docs/3.2-state-management.md, docs/3.3-theme-system.md
2. Review:
   - src/components/layout/WindowFrame.tsx
   - src/stores/useAppStore.ts
   - src/themes/*.ts, src/styles/themes.css
   - src/contexts/ThemeContext.tsx
3. Update:
   - Window management: WindowFrame props, window controls, resize behavior
   - State management: Store structure, persistence patterns
   - Theme system: Available themes, CSS variables, theme switching
4. Preserve mermaid diagrams but update content
5. Report what you updated
```

#### AI System (4-ai-system.md)
```
You are updating ryOS documentation. Focus on AI System.

1. Read docs/4-ai-system.md
2. Review:
   - _api/chat.ts (main chat endpoint)
   - _api/_utils/aiPrompts.ts (system prompts)
   - src/apps/chats/tools/*.ts (tool handlers)
3. Update:
   - Available AI models and providers
   - Tool calling capabilities and available tools
   - Chat system architecture
   - Streaming behavior
4. Report what you updated
```

#### File System (5-file-system.md)
```
You are updating ryOS documentation. Focus on the File System.

1. Read docs/5-file-system.md
2. Review:
   - src/stores/useFileSystemStore.ts
   - src/apps/finder/components/*.tsx
   - src/apps/finder/hooks/*.ts
3. Update:
   - File system structure and operations
   - IndexedDB storage details
   - Finder app integration
   - File type support
4. Report what you updated
```

#### Audio System (6-audio-system.md)
```
You are updating ryOS documentation. Focus on the Audio System.

1. Read docs/6-audio-system.md
2. Review:
   - src/lib/audioContext.ts
   - src/hooks/useSound.ts, src/hooks/useAudioRecorder.ts
   - src/stores/useAudioSettingsStore.ts
   - src/apps/synth/components/*.tsx
   - src/apps/soundboard/hooks/*.ts
3. Update:
   - AudioContext management
   - Audio playback mechanisms
   - Recording capabilities
   - Synthesizer features
   - Volume/settings controls
4. Preserve mermaid diagrams but update content
5. Report what you updated
```

#### UI Components (7-*.md files)
```
You are updating ryOS documentation. Focus on UI Components.

1. Read: docs/7-ui-components.md, docs/7.1-component-library.md, docs/7.2-i18n.md
2. Review:
   - src/components/ui/*.tsx (shadcn components)
   - src/components/shared/*.tsx (custom components)
   - src/lib/locales/en/translation.json (i18n keys)
   - src/utils/i18n.ts
3. Update:
   - Component inventory and usage
   - Custom vs shadcn components
   - i18n structure and supported languages
   - Translation key patterns
4. Report what you updated
```

#### API Reference (8-*.md files)
```
You are updating ryOS documentation. Focus on API Reference.

1. Read: docs/8-api-reference.md and all docs/8.*.md files
2. Review: _api/*.ts files
3. Update:
   - Endpoint list and descriptions
   - Request/response formats
   - Authentication requirements
   - Rate limiting or usage notes
4. Ensure all API endpoints in _api/ folder are documented
5. Report what you updated
```

### Step 3: Regenerate HTML Documentation

After all sub-agents complete, run the docs generation script:

```bash
bun run scripts/generate-docs.ts
```

This converts the updated markdown files to HTML in `public/docs/`.

### Step 4: Review Changes

Review the git diff to verify changes are appropriate:

```bash
git diff docs/
```

## Section Shortcuts

When running with a specific section argument:

| Argument | Sections Updated |
|----------|------------------|
| `overview` | 1-overview.md, 1.1-architecture.md |
| `apps` | 2-apps.md |
| `framework` | 3-application-framework.md, 3.1-*, 3.2-*, 3.3-* |
| `ai` | 4-ai-system.md |
| `filesystem` | 5-file-system.md |
| `audio` | 6-audio-system.md |
| `ui` | 7-ui-components.md, 7.1-*, 7.2-* |
| `api` | 8-api-reference.md, 8.1-* through 8.6-* |

## Notes

- **Do not update generated docs**: App docs (2.1-2.17) are generated by `scripts/generate-app-docs.ts`, changelog (9-changelog.md) by `scripts/generate-changelog.ts`
- **Preserve structure**: Keep existing headings, mermaid diagrams, and formatting style
- **Be conservative**: Only update information that is clearly outdated or missing
- **Link file paths**: Use GitHub links for file references following existing patterns
- **Run HTML generation**: Always run `bun run scripts/generate-docs.ts` after updates
