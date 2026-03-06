# ryOS — A Web-Based Agentic AI OS, made with Cursor

A modern web-based desktop environment inspired by classic macOS and Windows, built with React, TypeScript, and AI. Features multiple built-in applications, a familiar desktop interface, and a system-aware AI assistant. Works on all devices—desktop, tablet, and mobile.

**[Read ryOS Docs](https://os.ryo.lu/docs)** — Architecture, API reference, and developer guides

## Features

### Desktop Environment

- Authentic macOS and Windows-style desktop interactions
- Multi-instance window manager with drag, resize, and minimize
- Customizable wallpapers (photos, patterns, or videos)
- System-wide sound effects and AI assistant (Ryo)
- Virtual file system with local storage persistence and backup/restore

### Themes

- **System 7** — Classic Mac OS look with top menubar and traffic-light controls
- **Aqua** — Mac OS X style with modern aesthetics
- **Windows XP** — Bottom taskbar, Start menu, and classic window controls
- **Windows 98** — Retro Windows experience with mobile-safe controls

### Built-in Applications

- **Finder** — File manager with Quick Access, storage info, and smart file detection
- **TextEdit** — Rich text editor with markdown, slash commands, and multi-window support
- **MacPaint** — Bitmap graphics editor with drawing tools, patterns, and import/export
- **Videos** — VCR-style YouTube player with playlist management
- **Soundboard** — Record and play custom sounds with waveform visualization
- **Synth** — Virtual synthesizer with multiple waveforms, effects, and MIDI support
- **Photo Booth** — Camera app with real-time filters and photo gallery
- **Internet Explorer** — Time Machine that explores web history via Wayback Machine; AI generates sites for years before 1996 or in the future
- **Chats** — AI chat with Ryo, public/private chat rooms, voice messages, and tool calling
- **Control Panels** — System preferences: appearance, sounds, backup/restore, and file system management
- **Minesweeper** — Classic puzzle game
- **Virtual PC** — DOS emulator for classic games (Doom, SimCity, etc.)
- **Infinite Mac** — Classic Mac OS emulators (System 1.0 to Mac OS X 10.4) via Infinite Mac
- **Terminal** — Unix-like CLI with AI integration (`ryo <prompt>`)
- **iPod** — 1st-gen iPod music player with YouTube import, lyrics, and translation
- **Applet Store** — Browse, install, and share community-created HTML applets
- **Stickies** — Sticky notes for quick reminders

## Quick Start

1. Launch apps from the Finder, Desktop, or Apple/Start menu
2. Drag windows to move, drag edges to resize
3. Use Control Panels to customize appearance and sounds
4. Chat with Ryo AI for help or to control apps
5. Files auto-save to browser storage

## Project Structure

```
├── api/              # API route handlers (Vercel-compatible serverless functions)
├── public/           # Static assets (icons, wallpapers, sounds, fonts)
├── scripts/          # Build + maintenance + standalone API runner
├── src/
│   ├── apps/         # Individual app modules
│   ├── components/   # Shared React components (ui, dialogs, layout)
│   ├── config/       # Configuration files
│   ├── contexts/     # React context providers
│   ├── hooks/        # Custom React hooks
│   ├── lib/          # Libraries and utilities
│   ├── stores/       # Zustand state management
│   ├── styles/       # CSS and styling
│   └── types/        # TypeScript definitions
```

## Tech Stack

- **Frontend:** React 19, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion
- **Audio:** Tone.js, WaveSurfer.js
- **3D:** Three.js (shaders)
- **Text Editor:** TipTap
- **State:** Zustand
- **Storage:** IndexedDB, LocalStorage, Redis (Upstash)
- **AI:** OpenAI, Anthropic, Google via Vercel AI SDK
- **Real-time:** Pusher
- **Build:** Vite, Bun
- **Deployment:** Vercel

## Scripts

```bash
bun run dev          # Start full stack (API + Vite with proxy) — the default
bun run dev:vite     # Start Vite dev server only (frontend-only, no API)
bun run dev:api      # Start standalone Bun API server only (port 3000)
bun run dev:vercel   # Optional: Vercel dev server (parity/debugging only)
bun run build        # Build for production
bun run lint         # Run ESLint
bun run preview      # Preview production build
bun run api:start    # Run standalone API server in production mode
```

For local development, `bun run dev` starts both the standalone Bun API server and the Vite dev server with an `/api` proxy — no Vercel CLI required.

## BlueBubbles iMessage integration

You can wire Ryo into iMessage on a Mac by pointing a BlueBubbles webhook at:

```bash
POST /api/webhooks/bluebubbles?secret=your-secret
```

Set these env vars on the ryOS API:

```bash
BLUEBUBBLES_SERVER_URL=https://your-bluebubbles-server.example
BLUEBUBBLES_SERVER_PASSWORD=your-bluebubbles-password
BLUEBUBBLES_WEBHOOK_SECRET=your-secret
```

Optional controls:

```bash
BLUEBUBBLES_TRIGGER_PREFIX=@ryo
BLUEBUBBLES_ALLOWED_CHAT_GUIDS=iMessage;-;me@example.com
BLUEBUBBLES_SEND_METHOD=private-api
```

How it works:

1. BlueBubbles sends `new-message` webhooks to ryOS
2. ryOS only responds when the incoming text starts with `BLUEBUBBLES_TRIGGER_PREFIX` (default `@ryo`)
3. ryOS keeps recent per-thread context in Redis and sends the reply back through the BlueBubbles REST API

## Running the API Separately

Use this when you only need the API server (e.g. for running tests):

```bash
# Terminal 1 - standalone API (loads .env/.env.local)
bun run dev:api

# Terminal 2 - frontend (optional, if you also need the UI)
bun run dev:vite
```

The standalone API listens on:

- `API_PORT` (fallback: `PORT`, then `3000`)
- `API_HOST` (fallback: `0.0.0.0`)

You can run API tests directly against it:

```bash
API_URL=http://localhost:3000 bun run test:new-api
```

## VPS / self-hosting path

You can host ryOS on a VPS without Vercel by running:

1. `bun run build` for frontend assets
2. `bun run api:start` for API process
3. Nginx/Caddy reverse proxy:
   - Serve static frontend
   - Proxy `/api/*` to the standalone API process

Set `API_ALLOWED_ORIGINS` (comma-separated origins) in production, for example:

```bash
API_ALLOWED_ORIGINS="https://your-domain.com,https://www.your-domain.com"
```

Detailed runbook: [`docs/self-hosting-vps.md`](docs/self-hosting-vps.md)

## License

AGPL-3.0 — See [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please submit a Pull Request.
