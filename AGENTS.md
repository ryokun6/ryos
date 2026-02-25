## Cloud-specific instructions

# ryOS Cloud Environment Guide

## Development Environment

This project uses **Bun** as the package manager and runtime. The environment is configured to run on **Vercel**.

### Package Manager

- **Bun** is required (version 1.3.5+)
- Use `bun install` to install dependencies
- Use `bun run <script>` to run package.json scripts

### Key Commands

```bash
# Development
bun run dev        # Start Vite dev server (port 5173, frontend only, fastest)
bun run dev:full   # Start Vite + API proxy (port 5173, recommended for full-stack dev)
bun run dev:vercel # Start Vercel dev server (port 3000, slow due to proxy overhead)

# Build & Production
bun run build      # TypeScript compile + Vite build

# Testing
bun run test       # Run all API tests (requires server running)
```

### Running the Application

For **full-stack development** (frontend + API, fast):
```bash
bun run dev:full
```
This starts Vite directly on port 5173 and proxies `/api/*` to a background `vercel dev` instance. DOMContentLoaded is ~3s vs ~33s with `vercel dev` alone.

For **frontend-only** development (no API):
```bash
bun run dev
```

For **vercel dev** (slow, use only when needed for Vercel-specific behavior):
```bash
bun run dev:vercel
```

> **Performance note**: `vercel dev` proxies all requests through its own server, adding ~190ms latency per HTTP request. With ~240 cascading ESM module requests on initial page load, this results in ~33s DOMContentLoaded vs ~3s with direct Vite. Use `bun run dev:full` for fast development with API support.

The frontend runs on port 5173 by default. Vercel dev uses port 3000.

## Environment Variables

The following environment variables are required for full functionality:

### Required for Core Features
- `REDIS_KV_REST_API_URL` - Upstash Redis REST API URL (for caching, chat rooms, authentication)
- `REDIS_KV_REST_API_TOKEN` - Upstash Redis REST API token

### Required for AI Features
- AI provider API keys (at least one):
  - OpenAI, Anthropic, or Google AI keys are configured via Vercel AI SDK

### Required for Real-time Features
- `PUSHER_APP_ID` - Pusher app ID (for chat rooms)
- `PUSHER_KEY` - Pusher key
- `PUSHER_SECRET` - Pusher secret
- `PUSHER_CLUSTER` - Pusher cluster

### Optional Features
- `ELEVENLABS_API_KEY` - ElevenLabs API (for text-to-speech)
- `YOUTUBE_API_KEY` - YouTube Data API (for video metadata)
- `YOUTUBE_API_KEY_2` - YouTube Data API fallback key
- `OPENAI_API_KEY` - OpenAI API (for audio transcription)

### Localization / Scripts
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google Generative AI (for machine translation of locale files)

**Note:** The application will run with limited functionality without these environment variables. API endpoints requiring these services will fail gracefully.

### Using `.env.local`

The project includes a `.env.local` file with all required keys pre-configured. Scripts that need API keys (e.g. `scripts/machine-translate.ts`) do **not** auto-load `.env.local`. Export the key before running:

```bash
export GOOGLE_GENERATIVE_AI_API_KEY="$(grep GOOGLE_GENERATIVE_AI_API_KEY .env.local | cut -d'"' -f2)"
bun run scripts/machine-translate.ts
```

## Project Structure

- `_api/` - Vercel serverless API endpoints (Edge runtime, uses `_api` prefix to avoid vite-plugin-vercel conflicts)
- `src/apps/` - Individual application modules (Finder, TextEdit, Chats, etc.)
- `public/` - Static assets (fonts, icons, wallpapers, sounds)
- `scripts/` - Build and maintenance scripts

## Testing

For simple tests (build verification):
```bash
bun run build
```

For running live server (when API or UI testing is needed):
```bash
bun run dev:full   # Fast: Vite direct + API proxy (recommended)
bun run dev:vercel # Slow: Full vercel dev proxy
```

### Manual Testing Guidelines

- **Skip computer use / GUI-driven testing** unless the user explicitly requests it
- For most changes, `bun run build` is sufficient to verify the code compiles correctly
- Only start `vercel dev` when you need to test API endpoints or run the live application
- Only use the `computerUse` subagent for manual browser testing when the user specifically asks for visual verification or UI testing

## Important Notes

- **Linter warnings**: The codebase has pre-existing linter warnings for unused variables. These are not blockers.
- **Pre-existing lint error**: There is one pre-existing `@typescript-eslint/no-explicit-any` error in `src/apps/winamp/components/WinampAppComponent.tsx`. Do not attempt to fix it unless asked.
- **API endpoints**: Most API endpoints are Edge Functions and require Redis for caching/storage.
- **Build process**: The build generates service worker files (`sw.js`, `workbox-*.js`) which are copied to `.vercel/output/static/`.
- **API symlink**: `vercel dev` requires an `api -> _api` symlink for local dev. The `dev:vercel` and `dev:full` scripts create it automatically via `scripts/ensure-api-symlink.sh`. If running `vercel dev` directly, run the symlink script first.
- **Vercel CLI**: Installed globally via `npm install -g vercel`. Must be logged in and linked to the project for `vercel dev` to pull environment variables.
- **Port conflicts**: If port 3000 is occupied, `vercel dev` auto-increments (3001, etc.). Kill stale processes on 3000 before starting if you need the canonical port.
- **Vercel dev proxy overhead**: The `vercel dev` proxy adds ~190ms per request. Use `bun run dev:full` instead for fast initial loads (~3s vs ~33s DOMContentLoaded). The `dev:full` script starts Vite directly on port 5173 and proxies `/api/*` to a background `vercel dev` on port 3001.
