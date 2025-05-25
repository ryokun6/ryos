# ryOS — A web-based OS experience, made with Cursor

A modern web-based desktop environment inspired by classic macOS, built with a cutting-edge web stack and AI. Features multiple built-in applications and a familiar desktop interface. Works on all devices—including mobile, tablet, and desktop.

## Features

### Desktop Environment

- Authentic macOS-style desktop interactions
- Multi-instance window manager with support for multiple windows per app
- Cross-device window resizers
- Menubar with app-specific menus
- Icon and list views
- Customizable wallpapers (photos, patterns, or videos)
- System-wide sampled and synthesizer sound effects
- System-wide UI, Chats, and Terminal sounds
- System-wide Ryo AI, with tool calls and context of running applications
- Virtual file system with local storage persistence and one-click Backup / Restore
- Optional CRT, Galaxy & Aurora shader effects

### Built-in Applications

- **Finder**: File manager with Quick Access & Storage Info
- **TextEdit**: Rich text editing with markdown support and task lists
  - Multi-window support - open multiple documents simultaneously
  - Each window maintains independent document state
  - Automatic instance management and document tracking
  - Smart file opening with existing window detection
- **MacPaint**: Classic bitmap graphics editor
  - Drawing tools (pencil, brush, spray, eraser)
  - Shape tools (rectangle, oval, line)
  - Fill patterns and colors
  - Spray tool simulates a dithered airbrush
  - Selection and move tools
  - Undo/redo support
  - Image file import/export support
- **Videos**: Retro-style YouTube playlist player
  - VCR-style interface with LCD display
  - Add and manage YouTube videos
  - Playlist management with shuffle and repeat modes
  - Scrolling titles and classic CD player controls
  - Local storage persistence
- **Soundboard**: Create and manage custom soundboards
  - Record sounds directly from microphone
  - Multiple soundboards support
  - Waveform visualization
  - Keyboard shortcuts (1-9)
  - Import/export functionality
  - Emoji and title customization
  - Enhanced synth effects
- **Synth**: Virtual synthesizer with retro aesthetics
  - Virtual keyboard with computer key support
  - Multiple oscillator waveforms (sine, square, sawtooth, triangle)
  - Effects including reverb, delay, and distortion
  - Customizable synth parameters
  - MIDI input support
  - Preset saving and loading
  - Classic synthesizer UI design
- **Photo Booth**: Camera app with effects
  - Take photos with your webcam
  - Multiple photo effects and filters
  - Brightness and contrast adjustments
  - Photo gallery with thumbnails
  - Multi-photo sequence mode
  - Export photos to Files
  - Real-time filter preview
- **Internet Explorer**: Classic browser with a temporal twist
  - Time Machine view to explore snapshots across different years
  - AI reimagines pre-1996 sites and generates futuristic designs
  - Save favorites by year and share time-travel links
- **Chats**: AI-powered chat with speech & tool calling
  - Natural conversation with Ryo AI
  - Join public chat rooms with @ryo mentions
  - Push-to-talk voice messages with real-time transcription
  - Text-to-speech for AI responses with word highlighting
  - Control apps and edit documents via chat commands
  - Nudge system (👋) with context-aware responses
  - ryOS FM DJ mode - when music plays, Ryo becomes a radio DJ
  - Tool calling capabilities for system integration
  - Save transcript to Markdown
  - Speech synthesis with volume controls
- **Control Panels**: System preferences & power tools
  - Appearance & shader selection (CRT, Galaxy, Aurora)
  - UI / typing / Terminal sound toggles
  - One-click full Backup / Restore
  - Format or reset the virtual file system
- **Minesweeper**: Classic game implementation
- **Virtual PC**: DOS game emulator
  - Play classic games like Doom and SimCity
  - DOS environment emulation
  - Game save states
- **Terminal**: Unix-like CLI with built-in AI
  - Familiar commands (ls, cd, cat, touch, vim, edit, …)
  - ↑ / ↓ history & auto-completion
  - "ryo <prompt>" to chat with AI assistant
  - Open documents in TextEdit or Vim straight from prompt
  - Toggle distinctive Terminal sounds in View ▸ Sounds
- **iPod**: 1st-generation iPod-style music player
  - Import any YouTube URL to build your music library
  - Classic click-wheel navigation and back-light toggle
  - Shuffle and loop playback modes
  - Create playlists and organize tracks
  - Time-synced lyrics with multi-language translation
  - Interactive lyric offset adjustment via gestures
  - Multiple lyric alignment modes (Focus Three, Alternating, Center)
  - Chinese character variants (Traditional/Simplified) and Korean romanization
  - Fullscreen lyrics mode with video support
  - Real-time lyric highlighting during playback
  - Library persisted locally for offline playback

## Project Structure

```
project/
├── public/           # Static assets
│   ├── assets/       # Videos, sounds, and other media
│   ├── fonts/        # Font files
│   ├── icons/        # UI icons organized by category
│   ├── patterns/     # Pattern files
│   └── wallpapers/   # Wallpaper images (photos and tiles)
├── src/
│   ├── apps/         # Individual application modules
│   │   └── [app-name]/ # Each app has its own directory
│   │       ├── components/ # App-specific components
│   │       ├── hooks/      # Custom hooks specific to the app
│   │       └── utils/      # Utility functions for the app
│   ├── components/   # Shared React components
│   │   ├── dialogs/    # Dialog components
│   │   ├── layout/     # Layout components
│   │   ├── shared/     # Shared components across applications
│   │   └── ui/         # UI components (shadcn components)
│   ├── config/       # Configuration files
│   ├── contexts/     # React context providers
│   ├── hooks/        # Custom React hooks
│   ├── lib/          # Libraries and utilities
│   ├── stores/       # State management (e.g., Zustand stores)
│   ├── styles/       # CSS and styling utilities
│   ├── types/        # TypeScript type definitions
│   └── utils/        # Utility functions
├── api/              # API endpoints
└── ...config files   # e.g., vite.config.ts, tsconfig.json, package.json
```

## Development

The project uses:

- TypeScript for type safety
- ESLint for code quality
- Tailwind for utility-first CSS
- shadcn/ui components built on Radix UI primitives
- Lucide icons
- Vercel for deployment

## Scripts

- `bun dev` - Start development server
- `bun run build` - Build for production
- `bun run lint` - Run ESLint
- `bun run preview` - Preview production build

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Wiki

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/ryokun6/ryos)
