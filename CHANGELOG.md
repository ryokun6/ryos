# Changelog

All notable changes to this repository.

## Unreleased - 2025-08-30

- Added `Embed` app
  - Files: `src/apps/embed/index.tsx`, `src/apps/embed/components/EmbedAppComponent.tsx`
  - Features: sandboxed `<iframe>` with address bar, accepts `initialData` (e.g. `{ url }`), wrapped in `WindowFrame` so it participates in instance/window system.
  - Dock: app is pinned to the Dock for easy discovery.

- Documentation updates
  - Updated `.github/copilot-instructions.md` to document the `Embed` app, the requirement to use `WindowFrame` for windowed apps, and added a step-by-step recipe for creating new "embed-like" apps.

- Project-wide rename
  - Replaced literal occurrences of "ryOS" with "auxOS" across repository (29 files changed).
  - Key files affected: `README.md`, `index.html`, `public/manifest.json`, `public/data/filesystem.json`, `api/*`, `src/config/*`, `src/apps/*`, `src/components/*`, `scripts/launch-kiosk.sh`, and others.

- Dev / build actions performed
  - Installed dependencies using Bun and ran the Vite dev server (used `PORT=5173` for local dev).
  - Ran TypeScript build (`tsc -b`) to validate types; build completed with no errors.

- Commits
  - Commit: "Replace 'ryOS' with 'auxOS' across repo" (changes include the rename and additions).
  - New files created and committed: `src/apps/embed/*`, `.github/copilot-instructions.md`, `CHANGELOG.md`.

## How to verify locally

1. Install dependencies (if not already):

```bash
bun install
```

2. Run TypeScript build/typecheck:

```bash
bunx tsc -b
```

3. Start dev server and open the app:

```bash
PORT=5173 bun run dev
# then open http://localhost:5173/
```

4. Launch the `Embed` app programmatically (in code or console):

```js
const launchApp = useLaunchApp();
launchApp("embed", { initialData: { url: "https://example.com" } });
// or
window.dispatchEvent(new CustomEvent("launchApp", { detail: { appId: "embed", initialData: { url: "https://example.com" } } }));
```

If you want these changes split into a feature branch or want per-commit granularity, tell me and I will rework the commits into a branch and open a PR.
