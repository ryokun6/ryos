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
bun run dev              # Start Vite dev server (port 5173)
vercel dev --token $VERCEL_TOKEN               # Start Vercel dev server (recommended for API testing)

# Build & Production
bun run build            # TypeScript compile + Vite build
bun run preview          # Preview production build

# Code Quality
bun run lint             # Run ESLint (note: existing linter warnings are expected)

# Testing
bun run test             # Run all API tests (requires server running)
```

### Running the Application

For **full functionality** including API endpoints:
```bash
vercel dev --token $VERCEL_TOKEN
```

For **frontend-only** development:
```bash
bun run dev
```

The frontend runs on port 5173 by default, but Vercel dev will use port 3000.

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

**Note:** The application will run with limited functionality without these environment variables. API endpoints requiring these services will fail gracefully.

## Project Structure

- `api/` - Vercel serverless API endpoints (Edge runtime)
- `src/apps/` - Individual application modules (Finder, TextEdit, Chats, etc.)
- `public/` - Static assets (fonts, icons, wallpapers, sounds)
- `scripts/` - Build and maintenance scripts

## Testing

Tests require a running server. Start the server first:
```bash
vercel dev --token $VERCEL_TOKEN
```

Then in another terminal:
```bash
bun run test
```

## Important Notes

- **Linter warnings**: The codebase has pre-existing linter warnings for unused variables. These are not blockers.
- **API endpoints**: Most API endpoints are Edge Functions and require Redis for caching/storage.
- **Build process**: The build generates service worker files (`sw.js`, `workbox-*.js`) which are copied to `.vercel/output/static/`.
