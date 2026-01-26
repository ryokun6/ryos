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
├── _api/             # Vercel API endpoints (AI, chat, lyrics, etc.)
├── api/              # Local dev only: symlink to _api (created by dev:vercel; gitignored)
├── public/           # Static assets (icons, wallpapers, sounds, fonts)
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
bun dev              # Start development server
bun run build        # Build for production
bun run lint         # Run ESLint
bun run preview      # Preview production build
bun run dev:vercel   # Run with Vercel dev server (recommended); ensures api -> _api for local dev only
```

For local development only: `bun run dev:vercel` creates an `api` → `_api` symlink so Vercel dev serves your API routes (Vercel looks for `api/`). The symlink is gitignored and not used in production.

## License

AGPL-3.0 — See [LICENSE](LICENSE) for details.

## Contributing

Contributions welcome! Please submit a Pull Request.
