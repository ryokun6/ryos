## Cloud-specific instructions

# ryOS Cloud Environment Guide

## Development Environment

This project uses **Bun** as the package manager and runtime. Local API testing should use the standalone Bun server + Vite proxy, while production deployment can still target **Vercel**.

### Package Manager

- **Bun** is required (version 1.3.5+)
- Use `bun install` to install dependencies
- Use `bun run <script>` to run package.json scripts

### Key Commands

```bash
# Development
bun run api:dev        # Start standalone Bun API server (port 3000 by default)
bun run dev:standalone # Start Vite dev server with /api proxy to standalone API
bun run dev            # Start Vite dev server only (frontend-only)
bun run dev:vercel     # Optional: Vercel dev server (parity/debugging only)

# Build & Production
bun run build      # TypeScript compile + Vite build

# Testing
bun run test       # Run all API tests (requires server running)
```

### Running the Application

For **full functionality** including API endpoints:
```bash
# Terminal 1
bun run api:dev

# Terminal 2
bun run dev:standalone
```

For **frontend-only** development:
```bash
bun run dev
```

The frontend runs on port 5173 by default. The standalone API defaults to port 3000.

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

- `_api/` - Node-style API route handlers (Vercel-compatible, also used by standalone Bun server)
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
# Terminal 1
bun run api:dev

# Terminal 2
bun run dev:standalone
```

### Manual Testing Guidelines

- **Skip computer use / GUI-driven testing** unless the user explicitly requests it
- For most changes, `bun run build` is sufficient to verify the code compiles correctly
- For API testing, use standalone API + Vite proxy (`bun run api:dev` + `bun run dev:standalone`)
- Only use the `computerUse` subagent for manual browser testing when the user specifically asks for visual verification or UI testing

## Important Notes

- **Linter warnings**: The codebase has pre-existing linter warnings for unused variables. These are not blockers.
- **Pre-existing lint error**: There is one pre-existing `@typescript-eslint/no-explicit-any` error in `src/apps/winamp/components/WinampAppComponent.tsx`. Do not attempt to fix it unless asked.
- **API endpoints**: API routes are Node-style handlers under `_api/` and require Redis for caching/storage.
- **Build process**: The build generates service worker files (`sw.js`, `workbox-*.js`) which are copied to `.vercel/output/static/`.
- **API symlink**: Only needed for `vercel dev` fallback. `dev:vercel` creates `api -> _api` automatically.
- **Vercel CLI**: Installed globally, but optional for local testing now that standalone Bun API is available.
- **Port conflicts**: If port 3000 is occupied, set `API_PORT=<port>` for `bun run api:dev` and adjust proxy target accordingly.
