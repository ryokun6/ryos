import React, { useState, useEffect } from "react";

// Documentation sections
const sections = [
  { id: "overview", title: "Overview" },
  { id: "state-management", title: "State Management" },
  { id: "window-manager", title: "Window Manager" },
  { id: "api-layer", title: "API Layer" },
  { id: "theme-system", title: "Theme System" },
  { id: "components", title: "Components" },
  { id: "chat-system", title: "Chat System" },
  { id: "file-system", title: "File System" },
  { id: "ai-integration", title: "AI Integration" },
  { id: "build-system", title: "Build System" },
  { id: "i18n-hooks", title: "i18n & Hooks" },
];

// Simple markdown-like renderer for our docs
function DocContent({ content }: { content: React.ReactNode }) {
  return <div className="space-y-4">{content}</div>;
}

function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-xl sm:text-2xl font-bold border-b-2 border-black pb-2 mb-4">{children}</h1>;
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg sm:text-xl font-bold mt-6 mb-3">{children}</h2>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base sm:text-lg font-bold mt-4 mb-2">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-white border border-black px-1 font-mono text-sm">{children}</code>;
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-white border-2 border-black p-2 sm:p-3 overflow-x-auto font-mono text-xs sm:text-sm leading-relaxed -mx-3 sm:mx-0">
      {children}
    </pre>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-4 -mx-3 px-3 sm:mx-0 sm:px-0">
      <table className="w-full border-2 border-black bg-white text-xs sm:text-sm min-w-[400px]">
        <thead>
          <tr className="bg-black text-white">
            {headers.map((h, i) => (
              <th key={i} className="border border-black px-2 sm:px-3 py-1.5 sm:py-2 text-left font-bold whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-100"}>
              {row.map((cell, j) => (
                <td key={j} className="border border-black px-2 sm:px-3 py-1.5 sm:py-2">
                  {cell.startsWith("`") && cell.endsWith("`") ? (
                    <Code>{cell.slice(1, -1)}</Code>
                  ) : (
                    cell
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc list-inside space-y-1 ml-4">{children}</ul>;
}

function LI({ children }: { children: React.ReactNode }) {
  return <li>{children}</li>;
}

// ============================================================================
// DOCUMENTATION CONTENT
// ============================================================================

function OverviewContent() {
  return (
    <DocContent
      content={
        <>
          <H1>ryOS Architecture Documentation</H1>
          <P>
            ryOS is a modern web-based desktop environment inspired by classic macOS and Windows,
            built with React, TypeScript, and AI. This documentation provides a comprehensive
            overview of the codebase architecture.
          </P>

          <H2>Tech Stack</H2>
          <Table
            headers={["Category", "Technologies"]}
            rows={[
              ["Frontend", "React 19, TypeScript, Tailwind CSS, shadcn/ui, Framer Motion"],
              ["State", "Zustand with localStorage/IndexedDB persistence"],
              ["Audio", "Tone.js, WaveSurfer.js, Web Audio API"],
              ["3D", "Three.js (shaders)"],
              ["Text Editor", "TipTap"],
              ["Storage", "IndexedDB, LocalStorage, Redis (Upstash)"],
              ["AI", "OpenAI, Anthropic, Google via Vercel AI SDK"],
              ["Real-time", "Pusher"],
              ["Build", "Vite, Bun"],
              ["Desktop", "Tauri (macOS, Windows, Linux)"],
              ["Deployment", "Vercel"],
            ]}
          />

          <H2>Project Structure</H2>
          <Pre>{`├── api/              # Vercel API endpoints
├── public/           # Static assets
├── src/
│   ├── apps/         # 17 app modules
│   ├── components/   # Shared React components
│   ├── config/       # App registry
│   ├── contexts/     # React contexts
│   ├── hooks/        # 29 custom hooks
│   ├── lib/          # Libraries
│   ├── stores/       # 21 Zustand stores
│   ├── styles/       # CSS
│   ├── themes/       # 4 theme definitions
│   └── types/        # TypeScript types
├── src-tauri/        # Desktop app config
└── scripts/          # Build scripts`}</Pre>

          <H2>Key Features</H2>
          <UL>
            <LI>
              <strong>Multi-Theme Support:</strong> System 7, Mac OS X (Aqua), Windows XP, Windows 98
            </LI>
            <LI>
              <strong>17 Built-in Apps:</strong> Finder, TextEdit, Paint, iPod, Terminal, Chats, and more
            </LI>
            <LI>
              <strong>AI Assistant (Ryo):</strong> Chat, tool calling, app control, code generation
            </LI>
            <LI>
              <strong>Virtual File System:</strong> IndexedDB-backed with lazy loading
            </LI>
            <LI>
              <strong>Real-time Chat:</strong> Pusher-powered rooms with AI integration
            </LI>
            <LI>
              <strong>PWA Support:</strong> Offline-capable with service worker caching
            </LI>
            <LI>
              <strong>Desktop App:</strong> Tauri-based native app
            </LI>
          </UL>
        </>
      }
    />
  );
}

function StateManagementContent() {
  return (
    <DocContent
      content={
        <>
          <H1>State Management</H1>
          <P>ryOS uses Zustand for state management with 21 stores following consistent patterns.</P>

          <H2>Store Inventory</H2>
          <Table
            headers={["Store", "Purpose", "Persistence Key"]}
            rows={[
              ["`useAppStore`", "Window/instance management, boot state", "`ryos:app-store`"],
              ["`useFilesStore`", "Virtual filesystem metadata", "`ryos:files`"],
              ["`useChatsStore`", "Chat rooms, messages, auth", "`ryos:chats`"],
              ["`useIpodStore`", "Music library, playback", "`ryos:ipod`"],
              ["`useThemeStore`", "OS theme selection", "Manual localStorage"],
              ["`useDisplaySettingsStore`", "Wallpaper, shaders", "`ryos:display-settings`"],
              ["`useDockStore`", "Dock pinned items", "`dock-storage`"],
              ["`useAudioSettingsStore`", "Volume, TTS settings", "`ryos:audio-settings`"],
              ["`useVideoStore`", "Video library, playback", "`ryos:videos`"],
              ["`useTerminalStore`", "Command history, vim state", "`ryos:terminal`"],
              ["`useSynthStore`", "Synthesizer presets", "`ryos:synth`"],
            ]}
          />

          <H2>Store Pattern</H2>
          <Pre>{`import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StoreState {
  someValue: string;
  setSomeValue: (v: string) => void;
}

export const useMyStore = create<StoreState>()(
  persist(
    (set) => ({
      someValue: "default",
      setSomeValue: (v) => set({ someValue: v }),
    }),
    {
      name: "ryos:my-store",
      version: 1,
      partialize: (state) => ({
        someValue: state.someValue,
      }),
    }
  )
);`}</Pre>

          <H2>Cross-Store Communication</H2>
          <UL>
            <LI>
              <Code>useKaraokeStore</Code> → reads from <Code>useIpodStore</Code> (shared music library)
            </LI>
            <LI>
              <Code>useTextEditStore</Code> → reads from <Code>useAppStore</Code> (foreground instance)
            </LI>
            <LI>
              <Code>useIpodStore</Code> → reads from <Code>useChatsStore</Code> (auth credentials)
            </LI>
          </UL>

          <H2>Storage Architecture</H2>
          <Pre>{`┌─────────────────────────────────────┐
│         Zustand Stores              │
│  (21 stores with persist middleware)│
└───────────────┬─────────────────────┘
                │
    ┌───────────┴───────────┐
    ▼                       ▼
┌───────────┐        ┌───────────────┐
│localStorage│       │   IndexedDB   │
│ (metadata) │       │   (content)   │
│            │       │               │
│ ryos:* keys│       │ documents     │
│            │       │ images        │
│            │       │ applets       │
└───────────┘        └───────────────┘`}</Pre>
        </>
      }
    />
  );
}

function WindowManagerContent() {
  return (
    <DocContent
      content={
        <>
          <H1>Window Manager</H1>
          <P>ryOS implements a sophisticated multi-instance window manager.</P>

          <H2>Window Creation Flow</H2>
          <Pre>{`User Action → launchApp() → createAppInstance() → AppManager renders`}</Pre>

          <H2>Instance State</H2>
          <Pre>{`interface AppInstance {
  instanceId: string;       // Unique numeric ID
  appId: AppId;             // App identifier
  isOpen: boolean;
  isForeground: boolean;
  isMinimized: boolean;
  isLoading: boolean;       // For lazy-loaded apps
  position: { x: number; y: number };
  size: { width: number; height: number };
  title?: string;
  createdAt: number;        // For stable ordering
  initialData?: unknown;    // App-specific data
}`}</Pre>

          <H2>Z-Index Management</H2>
          <P>
            Z-index is calculated from position in <Code>instanceOrder</Code> array. The end of the
            array is the foreground (top) window.
          </P>
          <Pre>{`const getZIndexForInstance = (instanceId: string) => {
  const index = instanceOrder.indexOf(instanceId);
  return BASE_Z_INDEX + index + 1;
};`}</Pre>

          <H2>Window Constraints</H2>
          <Table
            headers={["Property", "Type", "Description"]}
            rows={[
              ["`minSize`", "{ width, height }", "Minimum window dimensions"],
              ["`maxSize`", "{ width, height }", "Maximum window dimensions"],
              ["`defaultSize`", "{ width, height }", "Initial window size"],
              ["`mobileDefaultSize`", "{ width, height }", "Size on mobile devices"],
              ["`mobileSquare`", "boolean", "If true, height = width on mobile"],
            ]}
          />

          <H2>Multi-Instance Apps</H2>
          <UL>
            <LI>
              <Code>textedit</Code> - Multiple documents
            </LI>
            <LI>
              <Code>finder</Code> - Multiple browser windows
            </LI>
            <LI>
              <Code>applet-viewer</Code> - Multiple applets
            </LI>
          </UL>

          <H2>Snap-to-Edge</H2>
          <P>When dragging within 20px of screen edges, windows snap to half-screen.</P>
        </>
      }
    />
  );
}

function ApiLayerContent() {
  return (
    <DocContent
      content={
        <>
          <H1>API Layer</H1>
          <P>ryOS uses Vercel Serverless Functions with Edge runtime.</P>

          <H2>AI Endpoints</H2>
          <Table
            headers={["Endpoint", "Purpose"]}
            rows={[
              ["`/api/chat`", "Main AI chat with tool calling"],
              ["`/api/applet-ai`", "Applet text + image generation"],
              ["`/api/ie-generate`", "Time-travel page generation"],
              ["`/api/parse-title`", "Music metadata extraction"],
            ]}
          />

          <H2>Media Endpoints</H2>
          <Table
            headers={["Endpoint", "Purpose"]}
            rows={[
              ["`/api/song/`", "Song library CRUD"],
              ["`/api/song/[id]`", "Individual song operations"],
              ["`/api/speech`", "Text-to-speech"],
              ["`/api/audio-transcribe`", "Speech-to-text"],
              ["`/api/youtube-search`", "YouTube music search"],
            ]}
          />

          <H2>Chat Endpoints</H2>
          <Table
            headers={["Endpoint", "Purpose"]}
            rows={[
              ["`/api/chat-rooms/`", "Real-time chat rooms"],
              ["`/api/admin`", "Admin operations"],
            ]}
          />

          <H2>Authentication</H2>
          <Pre>{`// Token-based with 90-day expiration
Authorization: Bearer {token}
X-Username: {username}`}</Pre>

          <H2>AI Providers</H2>
          <Table
            headers={["Provider", "Models"]}
            rows={[
              ["OpenAI", "gpt-5, gpt-5.1, gpt-4o, gpt-4.1"],
              ["Anthropic", "claude-4.5, claude-4, claude-3.7"],
              ["Google", "gemini-2.5-pro, gemini-2.5-flash"],
            ]}
          />

          <H2>Rate Limiting</H2>
          <P>Atomic Redis counter-based limiting with per-user and per-IP limits.</P>
        </>
      }
    />
  );
}

function ThemeSystemContent() {
  return (
    <DocContent
      content={
        <>
          <H1>Theme System</H1>
          <P>ryOS supports 4 themes emulating classic operating systems.</P>

          <H2>Available Themes</H2>
          <Table
            headers={["Theme ID", "Name", "Platform", "Key Elements"]}
            rows={[
              ["`macosx`", "Aqua", "macOS", "Glossy buttons, traffic lights, pinstripe"],
              ["`system7`", "System 7", "Classic Mac", "Black & white, dotted titlebar"],
              ["`xp`", "XP", "Windows", "Luna blue chrome, rounded corners"],
              ["`win98`", "98", "Windows", "3D face, blue titlebar"],
            ]}
          />

          <H2>Theme Metadata</H2>
          <Pre>{`interface ThemeMetadata {
  isWindows: boolean;
  isMac: boolean;
  hasDock: boolean;             // macOS X only
  hasTaskbar: boolean;          // Windows themes
  hasMenuBar: boolean;          // Mac themes
  titleBarControlsPosition: "left" | "right";
  menuBarHeight: number;        // 0, 25, or 30px
  taskbarHeight: number;        // 0 or 30px
  baseDockHeight: number;       // 0 or 56px
}`}</Pre>

          <H2>CSS Custom Properties</H2>
          <Pre>{`:root[data-os-theme="macosx"] {
  --os-font-ui: "Lucida Grande", ...;
  --os-color-window-bg: white;
  --os-color-titlebar-active-bg: linear-gradient(...);
  --os-metrics-radius: 0.5rem;
  --os-window-shadow: 0 3px 10px rgba(0,0,0,0.3);
}`}</Pre>

          <H2>Theme Switching</H2>
          <Pre>{`setTheme: (theme) => {
  set({ current: theme });
  localStorage.setItem("os_theme", theme);
  document.documentElement.dataset.osTheme = theme;
}`}</Pre>

          <H2>Icon System</H2>
          <P>
            Icons organized by theme in <Code>/public/icons/</Code>. ThemedIcon component resolves
            theme-specific variants with fallback to default.
          </P>
        </>
      }
    />
  );
}

function ComponentsContent() {
  return (
    <DocContent
      content={
        <>
          <H1>Components</H1>
          <P>Built on React with Tailwind CSS and shadcn/ui.</P>

          <H2>UI Components (src/components/ui/)</H2>
          <H3>shadcn Components</H3>
          <UL>
            <LI>button, dialog, dropdown-menu, menubar</LI>
            <LI>input, select, slider, switch, checkbox</LI>
            <LI>scroll-area, tabs, tooltip, table</LI>
          </UL>

          <H3>Custom Components</H3>
          <Table
            headers={["Component", "Purpose"]}
            rows={[
              ["`activity-indicator`", "macOS-style spinner"],
              ["`audio-bars`", "Audio visualization"],
              ["`dial`", "Rotary knob for synthesizer"],
              ["`playback-bars`", "Equalizer animation"],
              ["`right-click-menu`", "Context menu wrapper"],
            ]}
          />

          <H2>Layout Components</H2>
          <Table
            headers={["Component", "Lines", "Purpose"]}
            rows={[
              ["`WindowFrame.tsx`", "~1500", "Window chrome/container"],
              ["`MenuBar.tsx`", "~1470", "System menu/taskbar"],
              ["`Desktop.tsx`", "~870", "Desktop icon management"],
              ["`Dock.tsx`", "-", "macOS dock"],
              ["`StartMenu.tsx`", "-", "Windows Start menu"],
              ["`ExposeView.tsx`", "-", "Mission Control"],
            ]}
          />

          <H2>WindowFrame Props</H2>
          <Pre>{`interface WindowFrameProps {
  children: React.ReactNode;
  title: string;
  appId: AppId;
  onClose?: () => void;
  isForeground?: boolean;
  material?: "default" | "transparent" | "notitlebar";
  windowConstraints?: {...};
  instanceId?: string;
  menuBar?: React.ReactNode;
}`}</Pre>
        </>
      }
    />
  );
}

function ChatSystemContent() {
  return (
    <DocContent
      content={
        <>
          <H1>Chat System</H1>
          <P>Real-time messaging with AI integration.</P>

          <H2>Technology Stack</H2>
          <Table
            headers={["Component", "Technology"]}
            rows={[
              ["Real-time", "Pusher (WebSocket)"],
              ["Storage", "Redis (Upstash)"],
              ["Backend", "Vercel Serverless"],
              ["AI", "Google Gemini 2.5 Flash"],
              ["Frontend", "Zustand + Vercel AI SDK v5"],
            ]}
          />

          <H2>Room Types</H2>
          <Pre>{`type RoomType = "public" | "private";

interface Room {
  id: string;           // 128-bit hex ID
  name: string;
  type: RoomType;
  userCount: number;
  members?: string[];   // Private rooms only
}`}</Pre>

          <H2>Redis Key Structure</H2>
          <Pre>{`chat:room:{roomId}           # Room data
chat:messages:{roomId}       # Message list (max 100)
chat:users:{username}        # User profiles
chat:presencez:{roomId}      # Active users (ZSET)
chat:token:user:{user}:{tok} # Auth tokens`}</Pre>

          <H2>AI Integration (@Ryo)</H2>
          <UL>
            <LI>
              <strong>Direct Chat:</strong> Full tool calling, system state awareness
            </LI>
            <LI>
              <strong>@Ryo Mentions:</strong> Context from recent messages, short responses
            </LI>
          </UL>

          <H2>Pusher Channels</H2>
          <Table
            headers={["Channel", "Events"]}
            rows={[
              ["`chats-public`", "room-created, room-deleted"],
              ["`chats-{user}`", "room-created (private), rooms-updated"],
              ["`room-{id}`", "room-message, message-deleted"],
            ]}
          />
        </>
      }
    />
  );
}

function FileSystemContent() {
  return (
    <DocContent
      content={
        <>
          <H1>File System</H1>
          <P>Browser-based hierarchical file system.</P>

          <H2>Two-Layer Architecture</H2>
          <UL>
            <LI>
              <strong>Metadata Layer</strong> (Zustand + localStorage): paths, names, types, UUIDs
            </LI>
            <LI>
              <strong>Content Layer</strong> (IndexedDB): actual file content indexed by UUID
            </LI>
          </UL>

          <H2>Directory Structure</H2>
          <Table
            headers={["Path", "Type", "Description"]}
            rows={[
              ["`/`", "Root", "Root directory"],
              ["`/Applications`", "Virtual", "Apps from registry"],
              ["`/Documents`", "Physical", "User documents"],
              ["`/Images`", "Physical", "User images"],
              ["`/Music`", "Virtual", "iPod library"],
              ["`/Videos`", "Virtual", "Video library"],
              ["`/Sites`", "Virtual", "IE favorites"],
              ["`/Applets`", "Physical", "HTML applets"],
              ["`/Trash`", "Special", "Deleted items"],
              ["`/Desktop`", "Physical", "Shortcuts"],
            ]}
          />

          <H2>File Metadata</H2>
          <Pre>{`interface FileSystemItem {
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
}`}</Pre>

          <H2>IndexedDB Stores</H2>
          <Table
            headers={["Store", "Purpose"]}
            rows={[
              ["`documents`", "Text files (.md, .txt)"],
              ["`images`", "Binary images"],
              ["`applets`", "HTML applets"],
              ["`trash`", "Deleted content"],
              ["`custom_wallpapers`", "User wallpapers"],
            ]}
          />
        </>
      }
    />
  );
}

function AiIntegrationContent() {
  return (
    <DocContent
      content={
        <>
          <H1>AI Integration</H1>
          <P>Multi-provider AI with tool calling support.</P>

          <H2>Providers</H2>
          <Table
            headers={["Provider", "SDK", "Models"]}
            rows={[
              ["OpenAI", "`@ai-sdk/openai`", "gpt-5, gpt-5.1, gpt-4o"],
              ["Anthropic", "`@ai-sdk/anthropic`", "claude-4.5, claude-4, claude-3.7"],
              ["Google", "`@ai-sdk/google`", "gemini-2.5-pro, gemini-2.5-flash"],
            ]}
          />

          <H2>Available Tools</H2>
          <Table
            headers={["Tool", "Description"]}
            rows={[
              ["`launchApp`", "Open applications"],
              ["`closeApp`", "Close applications"],
              ["`ipodControl`", "Music playback control"],
              ["`karaokeControl`", "Karaoke playback"],
              ["`generateHtml`", "Create HTML applets"],
              ["`list`", "List VFS items"],
              ["`open`", "Open files/apps"],
              ["`read`", "Read file contents"],
              ["`write`", "Create/modify documents"],
              ["`edit`", "Edit existing files"],
              ["`searchSongs`", "YouTube music search"],
              ["`settings`", "System settings"],
            ]}
          />

          <H2>System State Context</H2>
          <Pre>{`interface SystemState {
  username?: string;
  userOS?: string;
  locale?: string;
  userLocalTime?: {...};
  runningApps?: { foreground, background };
  ipod?: { currentTrack, isPlaying };
  karaoke?: { currentTrack, isPlaying };
  textEdit?: { instances[] };
}`}</Pre>

          <H2>AI Features</H2>
          <UL>
            <LI>
              <strong>Chat (Ryo):</strong> Multi-turn conversations, tool calling
            </LI>
            <LI>
              <strong>Internet Explorer:</strong> Time-travel page generation
            </LI>
            <LI>
              <strong>Applet Generation:</strong> HTML + image generation
            </LI>
          </UL>
        </>
      }
    />
  );
}

function BuildSystemContent() {
  return (
    <DocContent
      content={
        <>
          <H1>Build System</H1>
          <P>Vite + Bun build system with multiple deployment targets.</P>

          <H2>Deployment Targets</H2>
          <UL>
            <LI>
              <strong>Web (PWA):</strong> Deployed to Vercel
            </LI>
            <LI>
              <strong>Desktop:</strong> Tauri for macOS/Windows/Linux
            </LI>
            <LI>
              <strong>Development:</strong> Local with HMR
            </LI>
          </UL>

          <H2>Chunk Splitting</H2>
          <H3>Core Chunks (Immediate)</H3>
          <Pre>{`react: ["react", "react-dom"]
"ui-core": ["@radix-ui/react-dialog", ...]
zustand: ["zustand"]
motion: ["framer-motion"]`}</Pre>

          <H3>Deferred Chunks</H3>
          <Table
            headers={["Chunk", "Contents", "Trigger"]}
            rows={[
              ["`audio`", "tone, wavesurfer.js", "Soundboard/iPod"],
              ["`tiptap`", "@tiptap/*", "TextEdit"],
              ["`three`", "three.js", "PC app"],
              ["`ai-sdk`", "ai, @ai-sdk/*", "Chats/IE"],
            ]}
          />

          <H2>PWA Caching</H2>
          <Table
            headers={["Pattern", "Strategy", "TTL"]}
            rows={[
              ["Navigation", "NetworkFirst", "1 day"],
              ["JS Chunks", "NetworkFirst (3s)", "1 day"],
              ["CSS", "StaleWhileRevalidate", "7 days"],
              ["Images", "CacheFirst", "30 days"],
              ["Fonts", "CacheFirst", "1 year"],
            ]}
          />

          <H2>Tauri Desktop</H2>
          <P>
            Remote-first: Desktop app loads from <Code>https://os.ryo.lu</Code> for easy updates.
          </P>
        </>
      }
    />
  );
}

function I18nHooksContent() {
  return (
    <DocContent
      content={
        <>
          <H1>i18n & Hooks</H1>
          <P>Internationalization and 29+ custom hooks.</P>

          <H2>Supported Languages (10)</H2>
          <Table
            headers={["Code", "Language"]}
            rows={[
              ["`en`", "English (default)"],
              ["`zh-TW`", "Chinese Traditional"],
              ["`ja`", "Japanese"],
              ["`ko`", "Korean"],
              ["`fr`", "French"],
              ["`de`", "German"],
              ["`es`", "Spanish"],
              ["`pt`", "Portuguese"],
              ["`it`", "Italian"],
              ["`ru`", "Russian"],
            ]}
          />

          <H2>Key Hooks</H2>
          <H3>Window & App Management</H3>
          <Table
            headers={["Hook", "Purpose"]}
            rows={[
              ["`useLaunchApp`", "Launch apps with multi-window support"],
              ["`useWindowManager`", "Drag, resize, snap-to-edge"],
              ["`useWindowInsets`", "Theme-dependent constraints"],
            ]}
          />

          <H3>Audio System</H3>
          <Table
            headers={["Hook", "Purpose"]}
            rows={[
              ["`useSound`", "Web Audio API playback"],
              ["`useChatSynth`", "Chat typing sounds"],
              ["`useTerminalSounds`", "Terminal feedback"],
              ["`useTtsQueue`", "Text-to-speech queue"],
              ["`useAudioRecorder`", "Audio recording"],
            ]}
          />

          <H3>Device Detection</H3>
          <Table
            headers={["Hook", "Purpose"]}
            rows={[
              ["`useIsMobile`", "Mobile detection (<768px)"],
              ["`useIsPhone`", "Phone detection (<640px)"],
              ["`useMediaQuery`", "CSS media query hook"],
            ]}
          />

          <H2>Using i18n</H2>
          <Pre>{`import { useTranslation } from "react-i18next";

const { t } = useTranslation();

t("common.menu.file")              // "File"
t("apps.finder.name")              // "Finder"
t("common.dialog.aboutApp", { appName: "Finder" })`}</Pre>
        </>
      }
    />
  );
}

// Content map
const CONTENT_MAP: Record<string, () => React.ReactElement> = {
  overview: OverviewContent,
  "state-management": StateManagementContent,
  "window-manager": WindowManagerContent,
  "api-layer": ApiLayerContent,
  "theme-system": ThemeSystemContent,
  components: ComponentsContent,
  "chat-system": ChatSystemContent,
  "file-system": FileSystemContent,
  "ai-integration": AiIntegrationContent,
  "build-system": BuildSystemContent,
  "i18n-hooks": I18nHooksContent,
};

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================

export function DocsPage() {
  const [activeSection, setActiveSection] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && CONTENT_MAP[hash]) {
      setActiveSection(hash);
    }
  }, []);

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId);
    window.location.hash = sectionId;
    setSidebarOpen(false);
    window.scrollTo(0, 0);
  };

  const ContentComponent = CONTENT_MAP[activeSection];
  const currentIndex = sections.findIndex((s) => s.id === activeSection);

  return (
    <div
      className="bg-[#c0c0c0] font-[Geneva,Chicago,sans-serif] text-black"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h2v2H0zM2 2h2v2H2z' fill='%23a0a0a0' fill-opacity='0.3'/%3E%3C/svg%3E")`,
      }}
    >
      {/* Header */}
      <header className="bg-white border-b-2 border-black">
        <div className="flex items-center justify-between px-3 sm:px-4 h-10">
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1 border-2 border-black bg-white md:hidden"
              aria-label="Toggle menu"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <a href="/" className="flex items-center gap-2 hover:underline">
              <img src="/icons/mac-192.png" alt="ryOS" className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="font-bold text-sm sm:text-base">ryOS</span>
            </a>
            <span className="text-gray-600 text-xs sm:text-sm hidden sm:inline">/ Docs</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <a
              href="https://github.com/ryokun6/ryos"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline text-xs sm:text-sm hidden sm:inline"
            >
              GitHub
            </a>
            <a
              href="/"
              className="px-2 sm:px-3 py-1 bg-black text-white border-2 border-black hover:bg-gray-800 text-xs sm:text-sm font-bold"
            >
              Launch
            </a>
          </div>
        </div>
      </header>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar - slides in from left */}
      <aside
        className={`fixed top-0 left-0 z-50 h-full w-56 bg-white border-r-2 border-black p-2 pt-12 transition-transform duration-200 md:hidden ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute top-2 right-2 p-1 border-2 border-black bg-white"
          aria-label="Close menu"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <nav className="space-y-1">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => handleSectionChange(section.id)}
              className={`w-full text-left px-3 py-2 text-sm border-2 transition-colors ${
                activeSection === section.id
                  ? "bg-black text-white border-black"
                  : "bg-white text-black border-transparent hover:border-black"
              }`}
            >
              {section.title}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:block w-56 shrink-0 bg-white border-r-2 border-black p-2">
          <nav className="space-y-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => handleSectionChange(section.id)}
                className={`w-full text-left px-3 py-2 text-sm border-2 transition-colors ${
                  activeSection === section.id
                    ? "bg-black text-white border-black"
                    : "bg-white text-black border-transparent hover:border-black"
                }`}
              >
                {section.title}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="max-w-4xl mx-auto p-3 sm:p-6">
            {/* Content Window */}
            <div className="bg-white border-2 border-black shadow-[2px_2px_0_0_rgba(0,0,0,1)] sm:shadow-[4px_4px_0_0_rgba(0,0,0,1)]">
              {/* Window Title Bar */}
              <div
                className="h-6 border-b-2 border-black flex items-center px-2"
                style={{
                  background: `repeating-linear-gradient(
                    90deg,
                    #000 0px,
                    #000 1px,
                    #fff 1px,
                    #fff 3px
                  )`,
                }}
              >
                <div className="w-3 h-3 border-2 border-black bg-white mr-2 shrink-0" />
                <span className="bg-white px-2 text-xs sm:text-sm font-bold truncate">
                  {sections.find((s) => s.id === activeSection)?.title}
                </span>
              </div>

              {/* Window Content */}
              <div className="p-3 sm:p-6">
                <ContentComponent />
              </div>
            </div>

            {/* Navigation */}
            <div className="flex justify-between gap-2 mt-4 sm:mt-6 pb-6">
              {currentIndex > 0 ? (
                <button
                  onClick={() => handleSectionChange(sections[currentIndex - 1].id)}
                  className="px-2 sm:px-4 py-2 bg-white border-2 border-black hover:bg-gray-100 text-xs sm:text-sm font-bold shadow-[2px_2px_0_0_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] truncate max-w-[45%]"
                >
                  ← <span className="hidden sm:inline">{sections[currentIndex - 1].title}</span>
                  <span className="sm:hidden">Prev</span>
                </button>
              ) : (
                <div />
              )}
              {currentIndex < sections.length - 1 ? (
                <button
                  onClick={() => handleSectionChange(sections[currentIndex + 1].id)}
                  className="px-2 sm:px-4 py-2 bg-white border-2 border-black hover:bg-gray-100 text-xs sm:text-sm font-bold shadow-[2px_2px_0_0_rgba(0,0,0,1)] active:shadow-none active:translate-x-[2px] active:translate-y-[2px] truncate max-w-[45%]"
                >
                  <span className="hidden sm:inline">{sections[currentIndex + 1].title}</span>
                  <span className="sm:hidden">Next</span> →
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
