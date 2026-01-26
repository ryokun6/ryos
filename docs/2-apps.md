# Apps

ryOS includes 19 built-in applications, each designed to replicate classic desktop experiences while adding modern functionality.

## App Overview

| App | Description | Category |
|-----|-------------|----------|
| [Finder](/docs/finder) | Browse and manage files in a virtual file system | File Management |
| [TextEdit](/docs/textedit) | Rich text editor with markdown support | Productivity |
| [Paint](/docs/paint) | Image drawing and editing tool | Creativity |
| [Photo Booth](/docs/photo-booth) | Take photos with fun effects | Creativity |
| [iPod](/docs/ipod) | Music player with YouTube integration & synced lyrics | Media |
| [Karaoke](/docs/karaoke) | Karaoke player with synced lyrics display | Media |
| [Videos](/docs/videos) | Video player for watching media | Media |
| [Soundboard](/docs/soundboard) | Record and play sound effects | Audio |
| [Synth](/docs/synth) | Virtual synthesizer with 3D waveform visualization | Audio |
| [Terminal](/docs/terminal) | Command line interface with AI integration | Development |
| [Chats](/docs/chats) | Chat with Ryo AI assistant and join chat rooms | Communication |
| [Internet Explorer](/docs/internet-explorer) | Web browser with AI-powered content generation | Web |
| [Applet Store](/docs/applet-store) | Browse and run user-created HTML applets | Utilities |
| [Control Panels](/docs/control-panels) | System settings for themes, wallpapers, and audio | System |
| [Minesweeper](/docs/minesweeper) | Classic puzzle game | Games |
| [Virtual PC](/docs/virtual-pc) | 3D PC simulation experience | Entertainment |
| [Infinite Mac](/docs/infinite-mac) | Classic Mac OS emulators | Entertainment |
| [Stickies](/docs/stickies) | Sticky notes for quick reminders | Productivity |
| [Admin](/docs/admin) | System administration panel (admin only) | System |

## App Architecture

All apps follow a consistent architecture pattern:

### Component Structure
- **App Component** (`[AppName]AppComponent.tsx`): Main app UI component
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
- `mobileDefaultSize`: Mobile-specific sizing
- `mobileSquare`: Square aspect ratio for mobile

### Lazy Loading
Most apps are lazy-loaded for performance:
- Finder loads eagerly (critical path)
- Other apps load on-demand when opened
- Reduces initial bundle size

## Key Features by Category

### File Management
- **Virtual File System**: IndexedDB-backed with lazy loading
- **File Operations**: Create, rename, move, delete files and folders
- **Quick Access**: Jump to Documents, Applications, Trash

### Media Playback
- **Audio**: Tone.js, WaveSurfer.js, Web Audio API integration
- **Video**: React Player for YouTube and local video playback
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