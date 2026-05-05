## Cursor Cloud specific instructions

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
bun run dev            # Start full stack (API + Vite with proxy) — the default
bun run dev:vite       # Start Vite dev server only (frontend-only, no API)
bun run dev:api        # Start standalone Bun API server only (port 3000)
bun run dev:vercel     # Optional: Vercel dev server (parity/debugging only)

# Build & Production
bun run build      # TypeScript compile + Vite build

# Testing
bun test           # Run all tests via bun:test (API tests require server running)
bun run test:unit  # Unit/wiring tests only (no server needed)
bun run test:api   # API integration tests only
```

### Running the Application

For **full functionality** (default):
```bash
bun run dev
```

For **frontend-only** development (no API):
```bash
bun run dev:vite
```

For **API server only** (e.g. to run tests against):
```bash
bun run dev:api
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
- `MAPKIT_TEAM_ID` / `MAPKIT_KEY_ID` / `MAPKIT_PRIVATE_KEY` / `MAPKIT_ORIGIN` - Apple MapKit (powers the Maps app + the AI's `mapsSearchPlaces` tool via the Apple Maps Server API)
- `IP_GEOLOCATION_URL_TEMPLATE` - Optional override for the IP-geolocation provider used as a fallback when Vercel's `geolocation()` returns nothing (defaults to `https://ipwho.is/{ip}`). Use this on Coolify / Docker / plain Bun deploys, or to switch to a paid provider. Use `{ip}` as the placeholder.
- `IP_GEOLOCATION_DISABLED` - Set to `1`/`true` to disable the IP-geolocation fallback entirely (no outbound calls).

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

- `api/` - Node-style API route handlers (Vercel-compatible, also used by standalone Bun server)
- `src/apps/` - Individual application modules (Finder, TextEdit, Chats, etc.)
- `public/` - Static assets (fonts, icons, wallpapers, sounds)
- `scripts/` - Build and maintenance scripts

## Testing

Tests use **Bun's native test runner** (`bun:test`). Test files live in `tests/` and use the `.test.ts` extension.

### Running Tests

```bash
# Run all tests (unit + API integration — requires API server running)
bun test

# Run only unit/wiring tests (no server required)
bun test tests/test-chat-notification-logic.test.ts tests/test-pusher-client-refcount.test.ts

# Run a single suite
bun test tests/test-admin.test.ts

# Run API integration tests only (requires server)
bun run test:api
```

### Targeted Suite Commands (package.json)

| Command | What it runs |
|---------|-------------|
| `bun run test` | All tests (`bun test`) |
| `bun run test:api` | All API integration suites |
| `bun run test:unit` | All unit/wiring suites |
| `bun run test:new-api` | Auth, rooms, messages, presence |
| `bun run test:admin` | Admin endpoint |
| `bun run test:song` | Songs endpoints |
| `bun run test:ai` | AI endpoints (chat, applet-ai, ie-generate, ryo-reply) |
| `bun run test:media` | audio-transcribe, youtube-search |
| `bun run test:chat-wiring` | All chat wiring suites |
| `bun run test:pusher-regression` | All Pusher-related suites |
| `bun run test:chat-regression` | Chat + Pusher regression suites |

### API Integration Tests

API integration tests require the standalone API server to be running:

```bash
# Terminal 1
bun run dev:api

# Terminal 2
bun test                    # all tests
bun run test:api            # API integration only
bun test tests/test-admin.test.ts  # single suite
```

### Writing Tests

Tests use `describe`/`test`/`expect` from `bun:test`. Shared HTTP helpers are in `tests/test-utils.ts`:

- `fetchWithOrigin(url, opts)` — adds `Origin: http://localhost:3000`
- `fetchWithAuth(url, username, token, opts)` — adds Origin + Authorization + X-Username
- `makeRateLimitBypassHeaders()` — random IP to avoid rate limits in tests
- `ensureUserAuth(username, password)` — register-or-login, returns token

### Manual Testing Guidelines

- **Skip computer use / GUI-driven testing** unless the user explicitly requests it
- When demoing UI changes or visual verification, prefer screenshots over video walkthroughs
- Only create video walkthroughs when the user explicitly asks for a video
- For most changes, `bun run build` is sufficient to verify the code compiles correctly
- For API testing, use `bun run dev` (full stack) or `bun run dev:api` + `bun run dev:vite` separately
- Only use the `computerUse` subagent for manual browser testing when the user specifically asks for visual verification or UI testing

## Important Notes

- **Linter warnings**: The codebase has pre-existing linter warnings for unused variables. These are not blockers.
- **Linting**: `bun run lint` may still report pre-existing issues unrelated to your change. Check the current output before treating a lint failure as a regression.
- **API endpoints**: API routes are Node-style handlers under `api/` and require Redis for caching/storage.
- **Build process**: The build generates service worker files (`sw.js`, `workbox-*.js`) which are copied to `.vercel/output/static/`.
- **Vercel CLI**: Installed globally, but optional for local testing now that standalone Bun API is available.
- **Port conflicts**: If port 3000 is occupied, set `API_PORT=<port>` for `bun run dev:api` and adjust proxy target accordingly.

### Cloud Environment Notes

- All required secrets (Redis, Pusher, AI keys, S3, etc.) are injected as environment variables. No `.env.local` file is needed.
- `REDIS_PROVIDER=upstash` is pre-set; the API uses Upstash REST (`REDIS_KV_REST_API_URL`/`REDIS_KV_REST_API_TOKEN`).
- `REALTIME_PROVIDER=pusher` is pre-set with all Pusher credentials.
- Redis is also installed locally (`redis-server`) and can be started if needed for local-mode testing, but the injected Upstash credentials are the default.
- The `test:new-api` auth tests (Register, Login, Admin login) fail with `expect(data.token).toBeTruthy()` because the auth endpoints return the token only in the `Set-Cookie` header (`ryos_auth=<user>:<token>`), not in the JSON body. The credentials `ryo`/`testtest` work correctly (HTTP 200). This is a pre-existing test/API mismatch.
- Bun and Node are installed via the update script. Ensure `PATH` includes `$HOME/.bun/bin` and nvm is sourced before running commands.
