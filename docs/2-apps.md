# Apps

ryOS includes 27 built-in applications, each designed to replicate classic desktop experiences while adding modern functionality.

Registry IDs and docs slugs mostly match; Applet Store is registered as `applet-viewer`, and Virtual PC is registered as `pc`.

## App Overview

| App | Description | Category |
|-----|-------------|----------|
| [Finder](/docs/finder) | Browse and manage files in a virtual file system | File Management |
| [TextEdit](/docs/textedit) | Rich text editor with markdown support | Productivity |
| [Paint](/docs/paint) | Image drawing and editing tool | Creativity |
| [Photo Booth](/docs/photo-booth) | Take photos with fun effects | Creativity |
| [iPod](/docs/ipod) | Music player with YouTube, Apple Music, and synced lyrics | Media |
| [Karaoke](/docs/karaoke) | Karaoke player with synced lyrics, offset tuning, and host/join synced sessions; shares the iPod song library | Media |
| [Videos](/docs/videos) | Retro-style YouTube playlist player with loop, shuffle, and share links; feeds the TV channel lineup | Media |
| [TV](/docs/tv) | Channel-surfing YouTube TV with CRT shader effects, MTV synced lyrics from your iPod library, and AI-generated channels | Media |
| [Winamp](/docs/winamp) | Classic Winamp (Webamp) player with EQ, skins, and shared iPod/YouTube library | Media |
| [Soundboard](/docs/soundboard) | Record and play sound effects | Audio |
| [Synth](/docs/synth) | Virtual synthesizer with 3D waveform visualization | Audio |
| [Terminal](/docs/terminal) | Command line interface with AI integration | Development |
| [Chats](/docs/chats) | Chat with Ryo AI (tool calling, voice, applet generation) and join public chat rooms | Communication |
| [Internet Explorer](/docs/internet-explorer) | Web browser with year-based time travel and AI-reconstructed pages for pre-1996 and future eras | Web |
| [Applet Store](/docs/applet-store) | Browse and run user-created HTML applets | Utilities |
| [Control Panels](/docs/control-panels) | System settings for themes, wallpapers, screen savers, shader effects, audio, AI models, cloud sync, and backup/reset | System |
| [Minesweeper](/docs/minesweeper) | Classic puzzle game | Games |
| [Virtual PC](/docs/virtual-pc) | x86 emulator powered by v86 with classic OS presets, plus a DOS games library via js-dos | Entertainment |
| [Infinite Mac](/docs/infinite-mac) | Classic Mac OS emulators | Entertainment |
| [Stickies](/docs/stickies) | Sticky notes for quick reminders | Productivity |
| [Books](/docs/books) | EPUB reader with a wooden bookshelf, page-turn reader, reading-progress sync, and Finder import | Productivity |
| [Calendar](/docs/calendar) | iCal-style calendar with month, week, and day views, todos, and cloud sync | Productivity |
| [Contacts](/docs/contacts) | Address book with vCard import, Smart Groups, and cloud sync | Productivity |
| [Dashboard](/docs/dashboard) | Tiger-style widget overlay with clock, calendar, weather, stocks, iPod, translation, dictionary, sticky notes, aquarium, and terrarium | Utilities |
| [Maps](/docs/maps) | Apple MapKit search and pins; directions open in a new tab (Apple Maps); Chats can open results in-app | Utilities |
| [Calculator](/docs/calculator) | Basic, scientific, and unit conversion calculator | Utilities |
| [Admin](/docs/admin) | Admin-only panel for users, chat-room moderation, song library, server health, and Cursor agent telemetry | System |

## App Architecture

All apps follow a consistent architecture pattern:

### Component Structure
- **App Component** (typically `[AppName]AppComponent.tsx`; exceptions include `PhotoBoothComponent.tsx` and `AppletViewerAppComponent.tsx`): Main app UI component
- **Menu Bar** (`[AppName]MenuBar.tsx`): App-specific menu bar with commands
- **Sub-components**: App-specific UI components organized by feature

### State Management
- Apps use **Zustand stores** for global state (e.g., `useIpodStore`, `useSoundboardStore`)
- Local component state for UI-specific concerns
- IndexedDB persistence for user data (songs, soundboards, etc.)

### Window Configuration
Each app defines window constraints:
- `defaultSize`: Initial window dimensions
- `minSize` / `maxSize`: Resize constraints
- `mobileSquare`: Square aspect ratio on mobile (currently used by Karaoke)
- `mobileDefaultSize`: Optional mobile sizing hook in the window API (not set on any app today)

### Lazy Loading
App components are lazy-loaded through `appRegistry` for performance:
- Lightweight metadata and help content can be imported eagerly
- UI components load on demand when opened
- Reduces initial bundle size while preserving fast launcher/search metadata

## Key Features by Category

### File Management
- **Virtual File System**: IndexedDB-backed with lazy loading
- **File Operations**: Create, rename, move, delete files and folders
- **Quick Access**: Jump to Documents, Applications, Images, and Trash

### Media Playback
- **Audio**: Tone.js, WaveSurfer.js, Web Audio API integration
- **Video**: YouTube playback via React Player / `YouTubePlayer` (Videos playlist; TV channel-surfing)
- **Lyrics**: Synced lyrics with translations, furigana, romaji, pinyin

### AI Integration
- **Ryo Assistant**: Chat interface with tool calling capabilities
- **Code Generation**: Generate HTML applets from natural language
- **App Control**: Launch apps, switch themes, control playback via AI
- **Content Generation**: AI-powered web content generation in IE

### Creativity Tools
- **Paint**: Canvas-based drawing with filters and patterns
- **Photo Booth**: Webcam integration with visual effects
- **TextEdit**: Rich text editing with TipTap, markdown support

## App-Specific Documentation

Click on any app name above to view detailed documentation for that application, including:
- Feature overview and capabilities
- User guide and tips
- Technical implementation details
- Component architecture
- State management patterns