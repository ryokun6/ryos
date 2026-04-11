# March 2026 ryOS demo reel (Remotion)

Title cards + browser-captured clips for major features from `public/docs/changelog.html` (March 2026).

## 1. Record clips (Playwright)

From the **repo root** (ryOS), start the app (default `http://localhost:5173`):

```bash
bun run dev:vite
```

In another terminal:

```bash
bunx playwright install chromium
bun run scripts/record-march-demo-reel.ts
```

Videos are written to `remotion-demo-reel/public/clips/*.webm`.

## 2. Render the reel

```bash
cd remotion-demo-reel
bun install
bun run render
```

Output: `remotion-demo-reel/out/march-2026-demo-reel.mp4`.

## Remotion agent skills

Optional: `npx remotion skills add` installs [Remotion agent skills](https://www.remotion.dev/docs/ai/skills) into `.claude/skills` for AI-assisted editing.

## Feature list source

Segments follow **March 2026** bullets in `public/docs/changelog.html` (Calendar & Dashboard, CandyBar, Finder AirDrop & multi-select, cloud sync domains, theme/UI refresh). Ryo **webFetch** and Contacts/Telegram are major in copy but need auth — swap in your own clips under `public/clips/` if you record those logged in.
