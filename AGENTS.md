## Cloud-specific instructions

# ryOS Cloud Environment Guide

## Development Environment

This project uses **Bun** as the package manager and runtime. Local API testing should use the standalone Bun server + Vite proxy; production runs the same standalone Bun server via Docker on **Coolify** (self-hosted cloud).

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
- Redis backend, either:
  - `REDIS_KV_REST_API_URL` + `REDIS_KV_REST_API_TOKEN` - Upstash Redis REST API
  - `REDIS_URL` - standard Redis / Valkey connection string (required for local WebSocket pub/sub)

### Required for AI Features
- AI provider API keys (at least one):
  - OpenAI, Anthropic, or Google AI keys are configured via Vercel AI SDK

### Required for Real-time Features
- Pusher mode (`REALTIME_PROVIDER=pusher`, default):
  - `PUSHER_APP_ID`
  - `PUSHER_KEY`
  - `PUSHER_SECRET`
  - `PUSHER_CLUSTER`
- Local WebSocket mode (`REALTIME_PROVIDER=local`): requires `REDIS_URL`; optional `REALTIME_WS_PATH` defaults to `/ws`.

### Optional Features
- `RESEND_API_KEY` - Resend API key enabling the account-recovery **email** channel (verify recovery email + email-delivered password-reset codes). **Required together with `RECOVERY_EMAIL_FROM`** — both must be set for the email channel to work. When either is unset, email recovery is unavailable and account recovery falls back to a linked Telegram account.
- `RECOVERY_EMAIL_FROM` - `From` address for recovery emails (e.g. `ryOS <noreply@os.ryo.lu>`). **Required together with `RESEND_API_KEY`** for the email channel to activate.
- `ELEVENLABS_API_KEY` - ElevenLabs API (for text-to-speech)
- `YOUTUBE_API_KEY` - YouTube Data API (for video metadata)
- `YOUTUBE_API_KEY_2` - YouTube Data API fallback key
- `OPENAI_API_KEY` - OpenAI API (for audio transcription)
- `MAPKIT_TEAM_ID` / `MAPKIT_KEY_ID` / `MAPKIT_PRIVATE_KEY` / `MAPKIT_ORIGIN` - Apple MapKit (powers the Maps app + the AI's `mapsSearchPlaces` tool via the Apple Maps Server API)
- `MUSICKIT_TEAM_ID` / `MUSICKIT_KEY_ID` / `MUSICKIT_PRIVATE_KEY` / `MUSICKIT_ORIGIN` - MusicKit JS v3 (Apple Music) used by the iPod's "Apple Music" library mode. Reuse the same `.p8` key as MapKit if both services are enabled on the key — the signer falls back to `MAPKIT_TEAM_ID` / `MAPKIT_KEY_ID` / `MAPKIT_PRIVATE_KEY` when the `MUSICKIT_*` variants are unset.
- `IP_GEOLOCATION_URL_TEMPLATE` - Optional override for the IP-geolocation provider (defaults to `https://ipwho.is/{ip}`). Use to switch to a paid provider. Use `{ip}` as the placeholder.
- `IP_GEOLOCATION_DISABLED` - Set to `1`/`true` to disable the IP-geolocation fallback entirely (no outbound calls).

### Deployment Hardening

These knobs apply to Coolify / Docker / plain-Bun deployments.

- `TRUSTED_PROXY_COUNT` - Number of trusted reverse-proxy hops in front of the API. **Defaults to `0`**, meaning client-supplied `X-Forwarded-For` / `X-Real-IP` are NOT trusted (the standalone Bun server's socket peer IP is used instead). Set to `1` if you have one trusted reverse proxy (nginx, Caddy, Render's edge, Fly.io's edge, etc.) injecting the client IP into the right-most XFF entry; set to `2`+ for chained proxies. Tests (`bun run dev:api`) export `TRUSTED_PROXY_COUNT=1` because integration tests use spoofed XFF to exercise per-IP rate limits. `bun run dev:api` also defaults `TELEGRAM_BOT_API_BASE_URL` to the local Telegram mock used by the webhook integration suite.
- `AUTH_COOKIE_SECURE` - Force the `Secure` flag on/off for the auth cookie. Set to `1`/`true` on any HTTPS-fronted self-hosted deployment if auto-detection is wrong. Auto-detection enables `Secure` whenever `APP_PUBLIC_ORIGIN` starts with `https://` or the runtime env is `production`.

### Localization / Scripts
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google Generative AI (for machine translation of locale files)

Useful i18n maintenance scripts:

```bash
bun run i18n:extract --pattern "src/apps/[app]/**/*.{ts,tsx}" # Find hardcoded strings
bun run i18n:sync:mark-todo                                  # Add missing locale keys as [TODO]
bun run i18n:translate                                       # Machine-translate [TODO] keys
bun run i18n:translate:dry-run                               # Preview machine translations
bun run i18n:sync:dry-run                                    # Validate key coverage
bun run i18n:audit                                           # Validate terminology, placeholders, and plurals
bun run i18n:audit:fix                                       # Safely fix supported terminology drift
bun run i18n:apple-glossary                                  # Refresh Apple terminology source data
bun run i18n:find-untranslated                               # Heuristic hardcoded-string scan
```

**Note:** The application will run with limited functionality without these environment variables. API endpoints requiring these services will fail gracefully.

### Using `.env.local`

The project includes a `.env.local` file with all required keys pre-configured. Scripts that need API keys (e.g. `scripts/machine-translate.ts`) do **not** auto-load `.env.local`. Export the key before running:

```bash
export GOOGLE_GENERATIVE_AI_API_KEY="$(grep GOOGLE_GENERATIVE_AI_API_KEY .env.local | cut -d'"' -f2)"
bun run i18n:translate
```

## Project Structure

- `api/` - Node-style API route handlers served by the standalone Bun server
- `src/apps/` - Individual application modules (Finder, TextEdit, Chats, etc.)
- `public/` - Static assets (fonts, icons, wallpapers, sounds)
- `scripts/` - Build and maintenance scripts

## Testing

Tests use **Bun's native test runner** (`bun:test`). Suites live under `tests/unit/<domain>/` (no server) and `tests/integration/{api,opt-in}/` (server / env-gated). Shared helpers are in `tests/helpers/`. See `tests/README.md`.

### Running Tests

```bash
# Run all tests (unit + API integration — requires API server running)
bun test

# Run only unit/wiring tests (no server required)
bun run test:unit
bun test tests/unit/chat/test-chat-notification-logic.test.ts tests/unit/realtime/test-pusher-client-refcount.test.ts

# Run a single suite
bun test tests/integration/api/test-admin.test.ts

# Run API integration tests only (requires server)
bun run test:api
```

### Targeted Suite Commands (package.json)

| Command | What it runs |
|---------|-------------|
| `bun run test` | All tests (`bun test`) |
| `bun run test:registration` | Verify API/opt-in test registration |
| `bun run test:api` | All API integration suites |
| `bun run test:unit` | All unit/wiring suites |
| `bun run test:sync-v2:unit` | Sync v2 unit suites |
| `bun run test:sync-v2` | Sync v2 unit + API suites |
| `bun run test:api-validation` | API validation boundary tests |
| `bun run test:new-api` | Auth, rooms, messages, presence |
| `bun run test:admin` | Admin endpoint |
| `bun run test:song` | Songs endpoints |
| `bun run test:ai` | AI endpoints (chat, applet-ai, ie-generate, ryo-reply) |
| `bun run test:media` | audio-transcribe, youtube-search |
| `bun run test:auth-extra` | Auth edge-case suites |
| `bun run test:auth-ban-lockout` | Auth ban/lockout suites |
| `bun run test:listen-security` | Listen Together security suites |
| `bun run test:realtime-auth` | Realtime auth/channel suites |
| `bun run test:realtime-ws-local` | Opt-in local WebSocket realtime suite |
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
bun test tests/integration/api/test-admin.test.ts  # single suite
```

### Writing Tests

Tests use `describe`/`test`/`expect` from `bun:test`. Shared HTTP helpers are in `tests/helpers/test-utils.ts`:

- `fetchWithOrigin(url, opts)` — adds `Origin: http://localhost:3000`
- `fetchWithAuth(url, username, token, opts)` — adds Origin + Authorization + X-Username
- `makeRateLimitBypassHeaders()` — random IP to avoid rate limits in tests
- `ensureUserAuth(username, password)` — register-or-login, returns token

Unit suites go in `tests/unit/<domain>/` (auto-discovered). API suites go in `tests/integration/api/` and must be listed in `API_TEST_FILES` in `scripts/test-groups.ts`.

### Manual Testing Guidelines

- **Skip computer use / GUI-driven testing** unless the user explicitly requests it
- When demoing UI changes or visual verification, prefer screenshots over video walkthroughs
- Only create video walkthroughs when the user explicitly asks for a video
- Do **not** run `bun run build` for self-verification in local Cursor sessions unless the user explicitly asks. Running `bun run build` is okay when operating on a cloud agent / cloud environment.
- For API testing, use `bun run dev` (full stack) or `bun run dev:api` + `bun run dev:vite` separately
- Only use the `computerUse` subagent for manual browser testing when the user specifically asks for visual verification or UI testing

## Important Notes

- **Linter warnings**: The codebase has pre-existing linter warnings for unused variables. These are not blockers.
- **Linting**: `bun run lint` may still report pre-existing issues unrelated to your change. Check the current output before treating a lint failure as a regression.
- **API endpoints**: API routes are Node-style handlers under `api/` and require Redis for caching/storage.
- **Build process**: `bun run build` writes Vite output and generated service worker files (`sw.js`, `workbox-*.js`) to `dist/`.
- **Port conflicts**: If port 3000 is occupied, set `API_PORT=<port>` for `bun run dev:api` and adjust proxy target accordingly.

## Cursor Cloud specific instructions

These notes are specific to the Cursor Cloud Agent VM (where dependencies are already installed by the startup update script). They complement the guide above; standard commands live in the `## Cloud-specific instructions` / README / `package.json` sections.

- **Secrets are pre-injected as environment variables** — there is **no `.env.local` file** on the cloud VM. Redis (Upstash REST: `REDIS_KV_REST_API_URL`/`REDIS_KV_REST_API_TOKEN`), Pusher, and AI keys (OpenAI/Anthropic/Google) are already present, so `bun run dev` works with full functionality out of the box. The README's `.env.local` instructions are for local maintainer machines only.
- **AI chat is rate-limited, which can look like a broken AI.** `/api/chat` (the Ryo assistant in the Chats app) allows only **3 messages/day for anonymous users (per IP)** and **15 per 5h for authenticated users (per username)** (see `api/_utils/_rate-limit.ts`). The shared anonymous per-IP budget is quickly exhausted by the API test suite, so if Ryo doesn't reply while logged out you're almost certainly rate-limited (HTTP 429), not missing keys. **Sign in (register/login) before testing AI in the UI.**
- **`bun run test:unit` runs every suite in one Bun process, so cross-file pollution is the usual cause of aggregate-only failures.** Bun's file execution order differs between machines (it is not the CLI/alphabetical order), so a suite can pass in CI yet fail locally, or vice versa. If an aggregate failure does not reproduce in isolation (`bun test ./tests/unit/<domain>/<suite>.test.ts`), bisect the actual execution order (the `tests/<file>:` headers in the log) to find the polluting suite instead of treating it as a regression. Known traps: unregistering a happy-dom `GlobalRegistrator` another suite registered; Radix UI's layout-effect shim freezing its DOM detection at first import; non-writable `IS_REACT_ACT_ENVIRONMENT` left by earlier React suites; leaked store action mocks (restore real setters in `afterAll`); leaked `useFilesStore` / chats state and debounced IndexedDB writes from earlier suites (settle + reset before `deleteDatabase`, which silently no-ops when blocked). The full API integration suite (`bun run dev:api` + `bun run test:api`) passes 325/325.
