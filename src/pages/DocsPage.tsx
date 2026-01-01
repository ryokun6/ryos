import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

// Documentation sections generated from codebase analysis
const sections = [
  { id: "overview", title: "Overview", icon: "📋" },
  { id: "state-management", title: "State Management", icon: "🗄️" },
  { id: "window-manager", title: "Window Manager", icon: "🪟" },
  { id: "api-layer", title: "API Layer", icon: "🔌" },
  { id: "theme-system", title: "Theme System", icon: "🎨" },
  { id: "components", title: "Components", icon: "🧩" },
  { id: "chat-system", title: "Chat System", icon: "💬" },
  { id: "file-system", title: "File System", icon: "📁" },
  { id: "ai-integration", title: "AI Integration", icon: "🤖" },
  { id: "build-system", title: "Build System", icon: "🔧" },
  { id: "i18n-hooks", title: "i18n & Hooks", icon: "🌍" },
];

const OVERVIEW_DOC = `
# ryOS Architecture Documentation

ryOS is a modern web-based desktop environment inspired by classic macOS and Windows, built with React, TypeScript, and AI. This documentation provides a comprehensive overview of the codebase architecture.

## Tech Stack

| Category | Technologies |
|----------|-------------|
| **Frontend** | React 19, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion |
| **State** | Zustand with localStorage/IndexedDB persistence |
| **Audio** | Tone.js, WaveSurfer.js, Web Audio API |
| **3D** | Three.js (shaders) |
| **Text Editor** | TipTap |
| **Storage** | IndexedDB, LocalStorage, Redis (Upstash) |
| **AI** | OpenAI, Anthropic, Google via Vercel AI SDK |
| **Real-time** | Pusher |
| **Build** | Vite, Bun |
| **Desktop** | Tauri (macOS, Windows, Linux) |
| **Deployment** | Vercel |

## Project Structure

\`\`\`
├── api/              # Vercel API endpoints (AI, chat, lyrics, etc.)
├── public/           # Static assets (icons, wallpapers, sounds, fonts)
├── src/
│   ├── apps/         # Individual app modules (17 apps)
│   ├── components/   # Shared React components (ui, dialogs, layout)
│   ├── config/       # App registry and configuration
│   ├── contexts/     # React context providers
│   ├── hooks/        # Custom React hooks (29 hooks)
│   ├── lib/          # Libraries and utilities
│   ├── stores/       # Zustand state management (21 stores)
│   ├── styles/       # CSS and styling
│   ├── themes/       # Theme definitions (4 themes)
│   └── types/        # TypeScript definitions
├── src-tauri/        # Desktop app (Tauri) configuration
└── scripts/          # Build and utility scripts
\`\`\`

## Key Features

- **Multi-Theme Support**: System 7, Mac OS X (Aqua), Windows XP, Windows 98
- **17 Built-in Applications**: Finder, TextEdit, Paint, iPod, Terminal, Chats, and more
- **AI Assistant (Ryo)**: Chat, tool calling, app control, code generation
- **Virtual File System**: IndexedDB-backed with lazy loading
- **Real-time Chat**: Pusher-powered rooms with AI integration
- **PWA Support**: Offline-capable with service worker caching
- **Desktop App**: Tauri-based native app for macOS/Windows/Linux
`;

const STATE_MANAGEMENT_DOC = `
# State Management Architecture

ryOS uses **Zustand** for state management with 21 stores following consistent patterns.

## Store Inventory

| Store | Purpose | Persistence Key |
|-------|---------|-----------------|
| \`useAppStore\` | Window/instance management, boot state | \`ryos:app-store\` |
| \`useFilesStore\` | Virtual filesystem metadata | \`ryos:files\` |
| \`useChatsStore\` | Chat rooms, messages, auth | \`ryos:chats\` |
| \`useIpodStore\` | Music library, playback | \`ryos:ipod\` |
| \`useThemeStore\` | OS theme selection | Manual localStorage |
| \`useDisplaySettingsStore\` | Wallpaper, shaders | \`ryos:display-settings\` |
| \`useDockStore\` | Dock pinned items | \`dock-storage\` |
| \`useAudioSettingsStore\` | Volume, TTS settings | \`ryos:audio-settings\` |
| ...and 13 more stores | App-specific state | Various keys |

## Store Creation Pattern

\`\`\`typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface StoreState {
  someValue: string;
  setSomeValue: (v: string) => void;
}

export const useMyStore = create<StoreState>()(
  persist(
    (set, get) => ({
      someValue: "default",
      setSomeValue: (v) => set({ someValue: v }),
    }),
    {
      name: "ryos:my-store",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        someValue: state.someValue,
      }),
    }
  )
);
\`\`\`

## Cross-Store Communication

Stores can import and read from each other:

- \`useKaraokeStore\` → reads from \`useIpodStore\` (shared music library)
- \`useTextEditStore\` → reads from \`useAppStore\` (foreground instance)
- \`useIpodStore\` → reads from \`useChatsStore\` (auth credentials)

## Helper Functions

Shallow selector wrappers prevent unnecessary re-renders:

\`\`\`typescript
// In src/stores/helpers.ts
export function useAppStoreShallow<T>(
  selector: (state: ReturnType<typeof useAppStore.getState>) => T
): T {
  return useAppStore(useShallow(selector));
}
\`\`\`

## Storage Architecture

\`\`\`
┌─────────────────────────────────────┐
│         Zustand Stores              │
│  (21 stores with persist middleware)│
└───────────────┬─────────────────────┘
                │
    ┌───────────┴───────────┐
    ▼                       ▼
┌───────────┐        ┌───────────────┐
│localStorage│        │   IndexedDB   │
│ (metadata) │        │   (content)   │
│            │        │               │
│ ryos:*     │        │ documents     │
│ keys       │        │ images        │
│            │        │ applets       │
└───────────┘        └───────────────┘
\`\`\`
`;

const WINDOW_MANAGER_DOC = `
# Window Management System

ryOS implements a sophisticated multi-instance window manager.

## Window Creation Flow

\`\`\`
User Action → launchApp() → createAppInstance() → AppManager renders AppComponent
\`\`\`

## Instance State

\`\`\`typescript
interface AppInstance {
  instanceId: string;       // Unique numeric ID
  appId: AppId;             // App identifier
  isOpen: boolean;
  isForeground: boolean;
  isMinimized: boolean;
  isLoading: boolean;       // For lazy-loaded apps
  position: { x: number; y: number };
  size: { width: number; height: number };
  title?: string;
  displayTitle?: string;    // Dynamic title for dock
  createdAt: number;        // For stable ordering
  initialData?: unknown;    // App-specific data
}
\`\`\`

## Z-Index Management

Z-index is calculated from position in \`instanceOrder\` array:

\`\`\`typescript
const getZIndexForInstance = (instanceId: string) => {
  const index = instanceOrder.indexOf(instanceId);
  return BASE_Z_INDEX + index + 1;  // END = TOP (foreground)
};
\`\`\`

## Window Constraints

\`\`\`typescript
interface WindowConstraints {
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  defaultSize: { width: number; height: number };
  mobileDefaultSize?: { width: number; height: number };
  mobileSquare?: boolean;  // height = width on mobile
}
\`\`\`

## Multi-Instance Support

Apps that support multiple windows:
- \`textedit\` - Multiple documents
- \`finder\` - Multiple browser windows
- \`applet-viewer\` - Multiple applets

## Snap-to-Edge

When dragging near screen edges (20px threshold):
- Left edge → Snap to left half
- Right edge → Snap to right half
- Pre-snap state saved for restore

## Mobile Behavior

- Full-width windows only
- Vertical dragging allowed
- Swipe navigation between apps
`;

const API_LAYER_DOC = `
# API Layer Architecture

ryOS uses **Vercel Serverless Functions** with Edge runtime.

## Endpoint Summary

### AI Endpoints
| Endpoint | Purpose |
|----------|---------|
| \`/api/chat\` | Main AI chat with tool calling |
| \`/api/applet-ai\` | Applet text + image generation |
| \`/api/ie-generate\` | Time-travel page generation |
| \`/api/parse-title\` | Music metadata extraction |

### Media Endpoints
| Endpoint | Purpose |
|----------|---------|
| \`/api/song/\` | Song library CRUD |
| \`/api/song/[id]\` | Individual song operations |
| \`/api/speech\` | Text-to-speech |
| \`/api/audio-transcribe\` | Speech-to-text |
| \`/api/youtube-search\` | YouTube music search |

### Chat Endpoints
| Endpoint | Purpose |
|----------|---------|
| \`/api/chat-rooms/\` | Real-time chat rooms |
| \`/api/admin\` | Admin operations |

## Common Patterns

### CORS (\`_utils/cors.ts\`)
\`\`\`typescript
// Production: https://os.ryo.lu
// Preview: *.vercel.app
// Development: localhost ports
// Always: *.tailb4fa61.ts.net (Tailscale)
\`\`\`

### Rate Limiting (\`_utils/rate-limit.ts\`)
\`\`\`typescript
// Atomic Redis counter-based
const newCount = await redis.incr(key);
if (newCount === 1) await redis.expire(key, windowSeconds);
if (newCount > limit) return { allowed: false };
\`\`\`

### Authentication (\`_utils/auth.ts\`)
\`\`\`typescript
// Token-based with 90-day expiration
Authorization: Bearer {token}
X-Username: {username}
\`\`\`

## AI Providers

| Provider | Models |
|----------|--------|
| **OpenAI** | gpt-5, gpt-5.1, gpt-4o, gpt-4.1 |
| **Anthropic** | claude-4.5, claude-4, claude-3.7 |
| **Google** | gemini-2.5-pro, gemini-2.5-flash |

## Streaming Responses

\`\`\`typescript
const result = streamText({
  model: selectedModel,
  messages: enrichedMessages,
  tools: { /* 12 tools */ },
  experimental_transform: smoothStream({
    chunking: /[\\u4E00-\\u9FFF]|\\S+\\s+/,  // CJK + words
  }),
});
return result.toUIMessageStreamResponse();
\`\`\`
`;

const THEME_SYSTEM_DOC = `
# Theme System

ryOS supports 4 themes emulating classic operating systems.

## Available Themes

| Theme ID | Name | Platform | Key Visual Elements |
|----------|------|----------|---------------------|
| \`macosx\` | Aqua | macOS | Glossy buttons, traffic lights, pinstripe |
| \`system7\` | System 7 | Classic Mac | Black & white, dotted titlebar |
| \`xp\` | XP | Windows | Luna blue chrome, rounded corners |
| \`win98\` | 98 | Windows | 3D face, blue titlebar |

## Theme Metadata

\`\`\`typescript
interface ThemeMetadata {
  isWindows: boolean;
  isMac: boolean;
  hasDock: boolean;             // macOS X only
  hasTaskbar: boolean;          // Windows themes
  hasMenuBar: boolean;          // Mac themes
  titleBarControlsPosition: "left" | "right";
  menuBarHeight: number;        // 0, 25, or 30px
  taskbarHeight: number;        // 0 or 30px
  baseDockHeight: number;       // 0 or 56px
}
\`\`\`

## CSS Custom Properties

\`\`\`css
:root[data-os-theme="macosx"] {
  --os-font-ui: "Lucida Grande", ...;
  --os-color-window-bg: white;
  --os-color-titlebar-active-bg: linear-gradient(...);
  --os-metrics-radius: 0.5rem;
  --os-window-shadow: 0 3px 10px rgba(0,0,0,0.3);
}
\`\`\`

## Theme Switching

\`\`\`typescript
// useThemeStore
setTheme: (theme) => {
  set({ current: theme });
  localStorage.setItem("os_theme", theme);
  document.documentElement.dataset.osTheme = theme;
}
\`\`\`

## Window Styling by Theme

| Theme | Border | Shadow | Controls Position |
|-------|--------|--------|-------------------|
| macOS X | 0.5px rgba | 0 3px 10px | Left (traffic lights) |
| System 7 | 2px solid black | 2px 2px hard | Left (close box) |
| Win98 | 2px solid black | none | Right |
| XP | 3px solid blue | 0 4px 8px | Right |

## Icon System

Icons organized by theme in \`/public/icons/\`:
\`\`\`
/icons/
├── default/      # Fallback
├── macosx/       # Mac OS X icons
├── system7/      # Classic Mac
├── xp/           # Windows XP
├── win98/        # Windows 98
└── manifest.json # Availability map
\`\`\`
`;

const COMPONENTS_DOC = `
# Component Architecture

Built on React with Tailwind CSS and shadcn/ui.

## Component Categories

### UI Components (\`src/components/ui/\`)

**shadcn Components:**
- \`button\`, \`dialog\`, \`dropdown-menu\`, \`menubar\`
- \`input\`, \`select\`, \`slider\`, \`switch\`, \`checkbox\`
- \`scroll-area\`, \`tabs\`, \`tooltip\`, \`table\`

**Custom Components:**
- \`activity-indicator\` - macOS-style spinner
- \`audio-bars\` - Audio visualization
- \`dial\` - Rotary knob for synthesizer
- \`playback-bars\` - Equalizer animation
- \`right-click-menu\` - Context menu wrapper

### Layout Components (\`src/components/layout/\`)

| Component | Lines | Purpose |
|-----------|-------|---------|
| \`WindowFrame.tsx\` | ~1500 | Window chrome/container |
| \`MenuBar.tsx\` | ~1470 | System menu/taskbar |
| \`Desktop.tsx\` | ~870 | Desktop icon management |
| \`Dock.tsx\` | - | macOS dock |
| \`StartMenu.tsx\` | - | Windows Start menu |
| \`ExposeView.tsx\` | - | Mission Control |

### Shared Components (\`src/components/shared/\`)

- \`ThemedIcon\` - Theme-aware icon resolution
- \`TrafficLightButton\` - macOS window controls
- \`LinkPreview\` - URL card previews
- \`HtmlPreview\` - HTML content render

## WindowFrame Architecture

\`\`\`typescript
interface WindowFrameProps {
  children: React.ReactNode;
  title: string;
  appId: AppId;
  onClose?: () => void;
  isForeground?: boolean;
  material?: "default" | "transparent" | "notitlebar";
  windowConstraints?: { minWidth?, minHeight?, maxWidth?, maxHeight? };
  instanceId?: string;
  menuBar?: React.ReactNode;
}
\`\`\`

**Features:**
- Theme-adaptive title bar
- Drag, resize, maximize, minimize
- Framer Motion animations
- Snap zones for tiling
- Swipe navigation on mobile

## Styling Patterns

\`\`\`typescript
// Theme-adaptive styling with cn()
cn(
  "bg-os-window-bg",
  "border-[length:var(--os-metrics-border-width)]",
  isXpTheme && "window",  // xp.css class
  isMacTheme && "aqua-button"
)
\`\`\`

## Button Variants (CVA)

\`\`\`typescript
const buttonVariants = cva("inline-flex...", {
  variants: {
    variant: {
      default: "bg-primary...",
      retro: "[border-image:url('/assets/button.svg')...]",
      aqua: "aqua-button secondary",
      player: "[border-image:url('/assets/videos/switch.png')...]",
    },
    size: { default, sm, lg, icon }
  }
});
\`\`\`
`;

const CHAT_SYSTEM_DOC = `
# Chat System Architecture

Real-time messaging with AI integration.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Real-time | **Pusher** (WebSocket) |
| Storage | **Redis** (Upstash) |
| Backend | **Vercel Serverless** |
| AI | **Google Gemini 2.5 Flash** |
| Frontend | **Zustand** + **Vercel AI SDK v5** |

## Room Types

\`\`\`typescript
type RoomType = "public" | "private";

interface Room {
  id: string;           // 128-bit hex ID
  name: string;
  type: RoomType;
  userCount: number;
  members?: string[];   // Private rooms only
}
\`\`\`

## Redis Key Structure

\`\`\`
chat:room:{roomId}           # Room data
chat:messages:{roomId}       # Message list (max 100)
chat:users:{username}        # User profiles
chat:presencez:{roomId}      # Active users (ZSET)
chat:token:user:{user}:{tok} # Auth tokens
\`\`\`

## Message Flow

\`\`\`
1. User sends message
2. Server validates auth + rate limits
3. Server sanitizes content (profanity, XSS)
4. Server saves to Redis (LPUSH)
5. Server broadcasts via Pusher
6. Clients receive in real-time
\`\`\`

## AI Integration (@Ryo)

**Direct Chat (DM mode):**
- Full tool calling support
- System state awareness
- Multi-step workflows

**@Ryo Mentions in Rooms:**
- Context from recent messages
- Shorter responses (1-2 sentences)
- Aquarium rendering support

## Pusher Channels

| Channel | Events |
|---------|--------|
| \`chats-public\` | room-created, room-deleted |
| \`chats-{user}\` | room-created (private), rooms-updated |
| \`room-{id}\` | room-message, message-deleted |

## Authentication

\`\`\`
Token Lifecycle:
1. User creation → generates 256-bit token
2. Token stored with 90-day TTL
3. 30-day grace period for refresh
4. Proactive refresh 7 days before expiry
\`\`\`
`;

const FILE_SYSTEM_DOC = `
# Virtual File System

Browser-based hierarchical file system.

## Two-Layer Architecture

1. **Metadata Layer** (Zustand + localStorage)
   - File paths, names, types, timestamps, UUIDs

2. **Content Layer** (IndexedDB)
   - Actual file content indexed by UUID

## Directory Structure

| Path | Type | Description |
|------|------|-------------|
| \`/\` | Root | Root directory |
| \`/Applications\` | Virtual | Apps from registry |
| \`/Documents\` | Physical | User documents |
| \`/Images\` | Physical | User images |
| \`/Music\` | Virtual | iPod library |
| \`/Videos\` | Virtual | Video library |
| \`/Sites\` | Virtual | IE favorites |
| \`/Applets\` | Physical | HTML applets |
| \`/Trash\` | Special | Deleted items |
| \`/Desktop\` | Physical | Shortcuts |

## File Metadata

\`\`\`typescript
interface FileSystemItem {
  path: string;        // Unique identifier
  name: string;
  isDirectory: boolean;
  type?: string;       // markdown, text, png, etc.
  uuid?: string;       // Content storage key
  size?: number;
  createdAt?: number;
  modifiedAt?: number;
  status: "active" | "trashed";
  aliasTarget?: string;  // For shortcuts
}
\`\`\`

## IndexedDB Stores

| Store | Purpose |
|-------|---------|
| \`documents\` | Text (.md, .txt) |
| \`images\` | Binary images |
| \`applets\` | HTML applets |
| \`trash\` | Deleted content |
| \`custom_wallpapers\` | User wallpapers |

## UUID-Based Content

Files keyed by UUID (not filename):
- Renaming without migration
- Duplicate names in different dirs
- Consistent cross-session references

## Backup/Restore

\`\`\`typescript
interface BackupData {
  version: number;
  timestamp: string;
  localStorage: Record<string, string>;
  indexedDB: {
    documents: Array<{ key, value }>;
    images: Array<{ key, value }>;
    applets: Array<{ key, value }>;
    // Binary → base64 serialization
  };
}
\`\`\`
`;

const AI_INTEGRATION_DOC = `
# AI Integration Architecture

Multi-provider AI with tool calling support.

## Supported Providers

| Provider | SDK | Models |
|----------|-----|--------|
| **OpenAI** | \`@ai-sdk/openai\` | gpt-5, gpt-5.1, gpt-4o, gpt-4.1 |
| **Anthropic** | \`@ai-sdk/anthropic\` | claude-4.5, claude-4, claude-3.7 |
| **Google** | \`@ai-sdk/google\` | gemini-2.5-pro, gemini-2.5-flash |

## Available Tools

| Tool | Description |
|------|-------------|
| \`launchApp\` | Open applications |
| \`closeApp\` | Close applications |
| \`ipodControl\` | Music playback control |
| \`karaokeControl\` | Karaoke playback |
| \`generateHtml\` | Create HTML applets |
| \`list\` | List VFS items |
| \`open\` | Open files/apps |
| \`read\` | Read file contents |
| \`write\` | Create/modify documents |
| \`edit\` | Edit existing files |
| \`searchSongs\` | YouTube music search |
| \`settings\` | System settings |

## System State Context

\`\`\`typescript
interface SystemState {
  username?: string;
  userOS?: string;
  locale?: string;
  userLocalTime?: { timeString, dateString, timeZone };
  runningApps?: { foreground, background };
  internetExplorer?: { url, year, aiGeneratedMarkdown };
  video?: { currentVideo, isPlaying };
  ipod?: { currentTrack, isPlaying, currentLyrics };
  karaoke?: { currentTrack, isPlaying };
  textEdit?: { instances[] };
}
\`\`\`

## AI-Powered Features

### Chat (Ryo Assistant)
- Multi-turn conversations
- Tool calling for app control
- Rate limiting per user

### Internet Explorer Time Machine
- Historical website recreation
- Future speculative design
- Redis caching (5 versions/URL)

### Applet Generation
- Text mode: Embedded AI assistant
- Image mode: Gemini image generation
- HTML generation via \`generateHtml\` tool

## Streaming Pattern

\`\`\`typescript
const result = streamText({
  model: selectedModel,
  messages: enrichedMessages,
  tools,
  experimental_transform: smoothStream({
    chunking: /[\\u4E00-\\u9FFF]|\\S+\\s+/,
  }),
  stopWhen: stepCountIs(10),  // Multi-step limit
});

return result.toUIMessageStreamResponse();
\`\`\`
`;

const BUILD_SYSTEM_DOC = `
# Build System Architecture

Vite + Bun build system with multiple deployment targets.

## Deployment Targets

1. **Web (PWA)** - Deployed to Vercel
2. **Desktop** - Tauri for macOS/Windows/Linux
3. **Development** - Local with HMR

## Chunk Splitting Strategy

### Core Chunks (Immediate)
\`\`\`typescript
manualChunks: {
  react: ["react", "react-dom"],
  "ui-core": ["@radix-ui/react-dialog", ...],
  zustand: ["zustand"],
  motion: ["framer-motion"],
}
\`\`\`

### Deferred Chunks (On-Demand)
| Chunk | Contents | Trigger |
|-------|----------|---------|
| \`audio\` | tone, wavesurfer.js | Soundboard/iPod |
| \`tiptap\` | @tiptap/* | TextEdit |
| \`three\` | three.js | PC app |
| \`ai-sdk\` | ai, @ai-sdk/* | Chats/IE |

## PWA Configuration

### Workbox Caching

| Pattern | Strategy | TTL |
|---------|----------|-----|
| Navigation | NetworkFirst | 1 day |
| JS Chunks | NetworkFirst (3s) | 1 day |
| CSS | StaleWhileRevalidate | 7 days |
| Images | CacheFirst | 30 days |
| Fonts | CacheFirst | 1 year |
| Audio | CacheFirst | 30 days |

## Tauri Desktop App

\`\`\`json
{
  "productName": "ryOS",
  "version": "1.0.1",
  "identifier": "lu.ryo.os",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173"
  }
}
\`\`\`

**Remote-first**: Desktop loads from \`https://os.ryo.lu\` for easy updates.

## Dev Optimizations

| Feature | Setting | Savings |
|---------|---------|---------|
| CSS Source Maps | Disabled | ~30% memory |
| PWA Plugin | Disabled | ~50MB memory |
| Heavy Deps | Excluded | Faster startup |

## Scripts

| Script | Purpose |
|--------|---------|
| \`bun run dev\` | Development server |
| \`bun run build\` | Production build |
| \`bun run tauri:build:mac\` | Universal macOS binary |
| \`generate-build-version.ts\` | Version.json generation |
`;

const I18N_HOOKS_DOC = `
# i18n & Custom Hooks

Internationalization and 29+ custom hooks.

## Supported Languages (10)

| Code | Language |
|------|----------|
| \`en\` | English (default) |
| \`zh-TW\` | Chinese Traditional |
| \`ja\` | Japanese |
| \`ko\` | Korean |
| \`fr\` | French |
| \`de\` | German |
| \`es\` | Spanish |
| \`pt\` | Portuguese |
| \`it\` | Italian |
| \`ru\` | Russian |

## Translation Structure

\`\`\`
src/lib/locales/{lang}/translation.json
├── common/
│   ├── menu/      # File, Edit, View, etc.
│   ├── dialog/    # Buttons, messages
│   └── system/    # System messages
└── apps/
    ├── finder/    # App-specific strings
    ├── ipod/
    └── ...
\`\`\`

## Key Hooks

### Window & App Management
| Hook | Purpose |
|------|---------|
| \`useLaunchApp\` | Launch apps with multi-window support |
| \`useWindowManager\` | Drag, resize, snap-to-edge |
| \`useWindowInsets\` | Theme-dependent constraints |

### Audio System
| Hook | Purpose |
|------|---------|
| \`useSound\` | Web Audio API playback |
| \`useChatSynth\` | Chat typing sounds |
| \`useTerminalSounds\` | Terminal feedback |
| \`useTtsQueue\` | Text-to-speech queue |
| \`useAudioRecorder\` | Audio recording |

### Device Detection
| Hook | Purpose |
|------|---------|
| \`useIsMobile\` | Mobile detection (<768px) |
| \`useIsPhone\` | Phone detection (<640px) |
| \`useMediaQuery\` | CSS media query hook |

### Touch & Gestures
| Hook | Purpose |
|------|---------|
| \`useSwipeNavigation\` | App swipe navigation |
| \`useLongPress\` | Long press handler |
| \`useVibration\` | Haptic feedback |

### Lyrics & Music
| Hook | Purpose |
|------|---------|
| \`useLyrics\` | Synced lyrics fetching |
| \`useFurigana\` | Japanese annotations |
| \`useSongCover\` | Album art fetching |

## Using i18n

\`\`\`typescript
import { useTranslation } from "react-i18next";

const { t } = useTranslation();

t("common.menu.file")              // "File"
t("apps.finder.name")              // "Finder"
t("common.dialog.aboutApp", { appName: "Finder" })
\`\`\`

## Translation Scripts

\`\`\`bash
# Extract untranslated strings
bun run scripts/extract-strings.ts

# Sync translation keys
bun run scripts/sync-translations.ts --dry-run
\`\`\`
`;

const DOC_CONTENT: Record<string, string> = {
  "overview": OVERVIEW_DOC,
  "state-management": STATE_MANAGEMENT_DOC,
  "window-manager": WINDOW_MANAGER_DOC,
  "api-layer": API_LAYER_DOC,
  "theme-system": THEME_SYSTEM_DOC,
  "components": COMPONENTS_DOC,
  "chat-system": CHAT_SYSTEM_DOC,
  "file-system": FILE_SYSTEM_DOC,
  "ai-integration": AI_INTEGRATION_DOC,
  "build-system": BUILD_SYSTEM_DOC,
  "i18n-hooks": I18N_HOOKS_DOC,
};

export function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    // Handle hash navigation
    const hash = window.location.hash.slice(1);
    if (hash && DOC_CONTENT[hash]) {
      setActiveSection(hash);
    }
  }, []);

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId);
    window.location.hash = sectionId;
    // Scroll to top of content
    document.getElementById("doc-content")?.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-gray-100">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#16213e] border-b border-[#0f3460] shadow-lg">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-[#0f3460] transition-colors md:hidden"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="/icons/mac-192.png" alt="ryOS" className="w-8 h-8" />
              <span className="font-semibold text-lg">ryOS</span>
            </a>
            <span className="text-gray-400 hidden sm:inline">/ Architecture Docs</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/ryokun6/ryos"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-[#0f3460] transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
            <a
              href="/"
              className="px-4 py-2 bg-[#e94560] text-white rounded-lg hover:bg-[#ff6b6b] transition-colors text-sm font-medium"
            >
              Launch ryOS
            </a>
          </div>
        </div>
      </header>

      <div className="flex pt-14">
        {/* Sidebar */}
        <aside
          className={`fixed md:sticky top-14 left-0 z-40 h-[calc(100vh-3.5rem)] w-64 bg-[#16213e] border-r border-[#0f3460] transition-transform duration-300 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <nav className="p-4 space-y-1 overflow-y-auto h-full">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => {
                  handleSectionChange(section.id);
                  if (window.innerWidth < 768) setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  activeSection === section.id
                    ? "bg-[#e94560] text-white"
                    : "hover:bg-[#0f3460] text-gray-300"
                }`}
              >
                <span className="text-lg">{section.icon}</span>
                <span className="text-sm font-medium">{section.title}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main
          id="doc-content"
          className="flex-1 min-h-[calc(100vh-3.5rem)] overflow-y-auto"
        >
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <article className="prose prose-invert prose-lg max-w-none prose-headings:text-gray-100 prose-p:text-gray-300 prose-a:text-[#e94560] prose-strong:text-gray-200 prose-code:text-[#ff6b6b] prose-code:bg-[#0f3460] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[#0f3460] prose-pre:border prose-pre:border-[#1a1a2e] prose-table:border-collapse prose-th:border prose-th:border-[#0f3460] prose-th:bg-[#16213e] prose-th:px-4 prose-th:py-2 prose-td:border prose-td:border-[#0f3460] prose-td:px-4 prose-td:py-2">
              <ReactMarkdown>{DOC_CONTENT[activeSection]}</ReactMarkdown>
            </article>

            {/* Navigation */}
            <div className="flex justify-between items-center mt-12 pt-8 border-t border-[#0f3460]">
              {sections.findIndex((s) => s.id === activeSection) > 0 ? (
                <button
                  onClick={() => {
                    const idx = sections.findIndex((s) => s.id === activeSection);
                    handleSectionChange(sections[idx - 1].id);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-[#0f3460] transition-colors text-gray-400 hover:text-gray-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Previous</span>
                </button>
              ) : (
                <div />
              )}
              {sections.findIndex((s) => s.id === activeSection) < sections.length - 1 ? (
                <button
                  onClick={() => {
                    const idx = sections.findIndex((s) => s.id === activeSection);
                    handleSectionChange(sections[idx + 1].id);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-[#0f3460] transition-colors text-gray-400 hover:text-gray-200"
                >
                  <span>Next</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <div />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
