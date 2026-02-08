# Tauri Desktop App

This directory contains the Tauri backend for the ryOS desktop application.

## Prerequisites

Before building the Tauri app, ensure you have:

1. **Rust** installed: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
2. **System dependencies**:
   - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
   - **Windows**: Visual Studio Build Tools with C++ workload
   - **Linux**: `webkit2gtk`, `libssl-dev`, and other dependencies (see [Tauri docs](https://tauri.app/v1/guides/getting-started/prerequisites))

3. **Node dependencies** installed: `bun install` (or `npm install`)

## Development

To run the app in development mode:

```bash
bun run tauri:dev
```

This will:
1. Start the Vite dev server on `http://localhost:5173`
2. Launch the Tauri desktop window
3. Hot-reload on code changes

## Building

To build the app for your current platform:

```bash
bun run tauri:build
```

To build for specific platforms:

```bash
# macOS (universal binary)
bun run tauri:build:mac

# Windows
bun run tauri:build:windows
```

Built applications will be in `src-tauri/target/release/bundle/`:
- **macOS**: `.app` bundle and `.dmg` installer
- **Windows**: `.exe` installer
- **Linux**: `.deb` or `.AppImage` (depending on configuration)

## Generating Icons

Before building, generate the required icon formats:

```bash
bunx tauri icon src-tauri/icons/icon.png
```

This generates all platform-specific icon formats from the source `icon.png` file.

## Configuration

- `tauri.conf.json` - Main Tauri configuration (window settings, security, bundle options)
- `Cargo.toml` - Rust dependencies
- `src/main.rs` - Rust entry point (minimal, just launches webview)
- `capabilities/default.json` - Security permissions

## iOS Push Notifications

The wrapper includes a local `ios-push` Tauri plugin that bridges APNs into the webview.

### What the wrapper does

- Requests push permission on iOS
- Retrieves the APNs device token (cached across launches once received)
- Emits notification/token events to the frontend
- Emits registration-error events when APNs token registration fails
- Registers/unregisters tokens with backend endpoints:
  - `POST /api/push/register`
  - `POST /api/push/unregister`
  - `POST /api/push/test` (authenticated test send)

### iOS native setup (required on macOS/Xcode)

1. Generate/open the iOS project:
   - `bun run tauri:ios:init` (macOS only)
   - open `src-tauri/gen/apple/...xcodeproj`
2. In **Signing & Capabilities** add:
   - **Push Notifications**
   - **Background Modes** with **Remote notifications** checked
3. Ensure `src-tauri/src/ios/app/AppDelegate.swift` is used (already added in repo) so APNs callbacks are forwarded to the plugin.

### APNs backend environment variables

Set these in your deployment environment to enable test sends:

- `REDIS_KV_REST_API_URL` (for push token storage)
- `REDIS_KV_REST_API_TOKEN` (for push token storage)
- `APNS_KEY_ID`
- `APNS_TEAM_ID`
- `APNS_BUNDLE_ID`
- `APNS_PRIVATE_KEY` (contents of `.p8`, newline-safe)
- `APNS_USE_SANDBOX` (`true`/`1` for sandbox, optional)
- `APNS_ENDPOINT_OVERRIDE` (optional `https://...` endpoint for local/staging APNs gateway testing; origin used)
- `APNS_CA_CERT` (optional PEM cert for custom APNs gateway TLS trust)
- `APNS_SEND_CONCURRENCY` (optional integer `1..20` for test-send fanout concurrency; default `4`)
- `PUSH_METADATA_LOOKUP_CONCURRENCY` (optional integer `1..20` for Redis token metadata lookups; default `8`)

### Local push backend validation commands

From repo root:

- `bun run test:push` — all push suites
- `bun run test:push:helpers` — helper-focused suites only
- `bun run test:push:guards` — request/auth guard-focused suites only
- `bun run test:push:api` — API-facing suites only
- `bun run test:push-auth-guard` — shared auth extraction/validation helper tests
- `bun run test:push-request-guard` — shared push request/CORS guard helper tests
- `bun run test:push-auth-order` — auth-first failure-path behavior checks
- `bun run check:push` — lint + all push suites + build
- `bun run check:push:helpers` — lint + helper suites
- `bun run check:push:guards` — lint + guard suites
- `bun run check:push:api` — lint + API-facing suites
- `bun run check:push:aggregate` — lint + aggregate summary suite + build

## Security

The app uses a Content Security Policy (CSP) configured in `tauri.conf.json` that allows:
- API calls to `os.ryo.lu` and other external services
- YouTube embeds
- Pusher WebSocket connections
- Various external resources needed by the app

## Notes

- The web build (`bun run build`) remains unchanged and deploys to Vercel
- PWA features (service worker, offline caching) are automatically disabled in Tauri builds
- All API calls go to the hosted Vercel backend - no Rust backend code required
