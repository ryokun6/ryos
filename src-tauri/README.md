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
