# Apps

ryOS includes 17 built-in applications, each designed to replicate classic desktop experiences while adding modern functionality.

## App Overview

| App | Description | Category |
|-----|-------------|----------|
| [Finder](apps-finder.html) | Browse and manage files in a virtual file system | File Management |
| [TextEdit](apps-textedit.html) | Rich text editor with markdown support | Productivity |
| [Paint](apps-paint.html) | Image drawing and editing tool | Creativity |
| [Photo Booth](apps-photo-booth.html) | Take photos with fun effects | Creativity |
| [iPod](apps-ipod.html) | Music player with YouTube integration & synced lyrics | Media |
| [Karaoke](apps-karaoke.html) | Karaoke player with synced lyrics display | Media |
| [Videos](apps-videos.html) | Video player for watching media | Media |
| [Soundboard](apps-soundboard.html) | Record and play sound effects | Audio |
| [Synth](apps-synth.html) | Virtual synthesizer with 3D waveform visualization | Audio |
| [Terminal](apps-terminal.html) | Command line interface with AI integration | Development |
| [Chats](apps-chats.html) | Chat with Ryo AI assistant and join chat rooms | Communication |
| [Internet Explorer](apps-internet-explorer.html) | Web browser with AI-powered content generation | Web |
| [Applet Store](apps-applet-viewer.html) | Browse and run user-created HTML applets | Utilities |
| [Control Panels](apps-control-panels.html) | System settings for themes, wallpapers, and audio | System |
| [Minesweeper](apps-minesweeper.html) | Classic puzzle game | Games |
| [Virtual PC](apps-pc.html) | 3D PC simulation experience | Entertainment |
| [Admin](apps-admin.html) | System administration panel (admin only) | System |

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