# Application Framework

The ryOS application framework provides a unified system for building and managing desktop-style applications within the browser. It handles window rendering, state management, theming, and app lifecycle, allowing developers to focus on application logic rather than window management infrastructure.

## Overview

The ryOS application framework is built around three core pillars: **Window Management**, **State Management**, and **Theme System**. Together, these systems enable apps to have native desktop-like behavior including multiple windows, window positioning, resizing, minimizing, and theming that adapts to different operating system aesthetics.

Apps in ryOS are still organized as self-contained modules in `src/apps/[app-name]/`, but app registration is centralized in `src/config/appRegistry.tsx`. The registry combines lightweight app metadata with lazily loaded app components via `createLazyComponent`, so non-critical apps are loaded on demand while core shell behavior stays responsive. The framework handles window lifecycle, state persistence, and theme-aware rendering automatically, while apps focus on their specific functionality.

The framework supports multiple window instances per app (multi-window), allowing users to open several windows of the same application simultaneously. Window state, including position and size, is persisted across sessions. Apps can also define custom window constraints, menu bars, and help content that integrates seamlessly with the system. A universal undo/redo mechanism (`useUndoRedoStore` + `useGlobalUndoRedo`) lets apps like Finder, Paint, and TextEdit register instance-scoped undo/redo handlers that are dispatched via `Cmd/Ctrl+Z` to the foreground window. Runtime resilience is handled by desktop-level and app-level error boundaries with crash dialogs that offer both relaunch and quit options, so a crashing app instance does not bring down the full desktop shell.

```mermaid
graph TD
    subgraph Framework["Application Framework"]
        WM[Window Management]
        SM[State Management]
        TS[Theme System]
    end

    subgraph Apps["App Modules"]
        APP1[App Component]
        APP2[App Definition]
        APP3[App Menu Bar]
    end

    WM -->|renders| WF[WindowFrame]
    SM -->|persists| STORE[(Zustand Store)]
    TS -->|applies| THEME[Theme Context]

    WF --> APP1
    STORE --> APP1
    THEME --> APP1

    APP2 -->|registers| WM
    APP3 -->|integrates| WF
```

## Key Components

| Component | Purpose |
|-----------|---------|
| Window Management | Handles window rendering, positioning, resizing, minimizing, maximizing, and multi-instance support through the `WindowFrame` component and `useWindowManager` hook |
| State Management | Manages app state, window instances, foreground ordering, and persistence using Zustand stores with localStorage integration and cloud sync |
| Theme System | Provides OS-themed appearance (Mac OS X, System 7, Windows XP, Windows 98) with theme-aware components, colors, fonts, and layout metadata |
| App Registration & Lazy Loading | Centralizes app configuration in `appRegistry`, lazy-loads app components with `createLazyComponent`, and marks lazy instances ready via `LazyLoadSignal` using `requestIdleCallback` |
| Undo/Redo | Universal undo/redo via `useUndoRedoStore` and `useGlobalUndoRedo`, allowing Finder, Paint, and TextEdit to register per-instance handlers dispatched to the foreground window |
| Error Isolation & Eventing | Wraps the desktop and each app instance with error boundaries (with relaunch/quit crash dialogs), and uses typed `appEventBus` primitives for launch/focus/expose/spotlight/document events |

## App Structure

Apps follow a standardized structure and naming convention. Each app is defined in `src/apps/[app-name]/` with the following typical organization:

- **Main Component**: `[AppName]AppComponent.tsx` - The primary app component that receives `AppProps` and renders the app content wrapped in `WindowFrame`. Components may be wrapped with `React.memo` for memoization.
- **Menu Bar**: `[AppName]MenuBar.tsx` - App-specific menu bar component (rendered outside `WindowFrame` for macOS themes, inside for Windows themes)
- **App Metadata**: `metadata.ts` (or lightweight `index.ts`) - Exports app metadata/help content without importing heavy UI components
- **App Registration**: `src/config/appRegistry.tsx` - Wires metadata, lazy component loaders, and window constraints into a single runtime registry. Most apps are code-split via `createLazyComponent` with `LazyLoadSignal` marking readiness through `requestIdleCallback`.
- **Optional Folders**: `hooks/`, `utils/`, `types/`, `components/` - App-specific logic, utilities, types, and sub-components

Apps receive common props via the `AppProps` interface, including `isWindowOpen`, `onClose`, `isForeground`, `instanceId`, and `initialData`. The `WindowFrame` component handles all window chrome, controls, and interactions, while apps focus on their content and functionality. Non-default locale bundles are also loaded lazily, so internationalization support does not eagerly inflate the initial JS payload.

```mermaid
graph TD
    subgraph AppModule["src/apps/[app-name]/"]
        INDEX[index.tsx<br/>App Definition]
        MAIN["[AppName]AppComponent.tsx"]
        MENU["[AppName]MenuBar.tsx"]
        HOOKS[hooks/<br/>use*Logic.ts]
        UTILS[utils/]
        COMPS[components/]
    end

    INDEX -->|exports| DEF{BaseApp Interface}
    DEF -->|component| MAIN
    DEF -->|metadata| META[id, name, icon]
    DEF -->|constraints| CONS[minWidth, minHeight]
    DEF -->|helpItems| HELP[Help Content]

    MAIN -->|renders| WF[WindowFrame]
    MAIN -->|uses| MENU
    MAIN -->|imports| HOOKS
    MAIN -->|imports| UTILS
    MAIN -->|imports| COMPS

    WF -->|receives| PROPS[AppProps]
    PROPS -->|isWindowOpen| P1[ ]
    PROPS -->|onClose| P2[ ]
    PROPS -->|isForeground| P3[ ]
    PROPS -->|instanceId| P4[ ]
```

### App-Specific Hooks Pattern

Each app typically has a **main logic hook** that encapsulates most of the app's state and behavior. This pattern separates UI concerns from business logic and makes apps easier to test and maintain.

**Location:** `src/apps/[app-name]/hooks/use[AppName]Logic.ts`

**Pattern Overview:**

| Aspect | Description |
|--------|-------------|
| Input | Options object with `isWindowOpen`, `isForeground`, `initialData`, `instanceId` |
| Output | Unified object containing state, actions, and UI state |
| Composition | Combines global hooks (useSound, useLyrics, etc.) with Zustand store state |

**Example: iPod Logic Hook**

```typescript
// src/apps/ipod/hooks/useIpodLogic.ts

export interface UseIpodLogicOptions {
  isWindowOpen: boolean;
  isForeground: boolean | undefined;
  initialData: IpodInitialData | undefined;
  instanceId: string | undefined;
}

export function useIpodLogic({
  isWindowOpen,
  isForeground,
  initialData,
  instanceId,
}: UseIpodLogicOptions) {
  // 1. Global hooks for cross-cutting concerns
  const { play: playClickSound } = useSound(Sounds.BUTTON_CLICK);
  const { play: playScrollSound } = useSound(Sounds.IPOD_CLICK_WHEEL);
  const vibrate = useVibration(100, 50);
  const isOffline = useOffline();
  
  // 2. Store state (fine-grained selectors)
  const { tracks, currentSongId, isPlaying, loopCurrent } = useIpodStore(
    useShallow((s) => ({
      tracks: s.tracks,
      currentSongId: s.currentSongId,
      isPlaying: s.isPlaying,
      loopCurrent: s.loopCurrent,
    }))
  );
  
  // 3. Media hooks for specialized functionality
  const { lyrics, isLoading: lyricsLoading } = useLyrics({
    songId: currentSongId,
    title: currentTrack?.title,
    artist: currentTrack?.artist,
  });
  
  const { furiganaMap, soramimiMap } = useFurigana({
    songId: currentSongId,
    lines: lyrics,
    enabled: showFurigana,
  });
  
  // 4. Local state for UI concerns
  const [menuPath, setMenuPath] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // 5. Handlers that combine state and actions
  const playTrack = useCallback((track: Track) => {
    playClickSound();
    vibrate();
    useIpodStore.getState().setCurrentSongId(track.id);
    useIpodStore.getState().setIsPlaying(true);
  }, [playClickSound, vibrate]);
  
  // 6. Return unified interface for component
  return {
    // State
    tracks,
    currentTrack,
    isPlaying,
    lyrics,
    furiganaMap,
    
    // Actions
    playTrack,
    pauseTrack,
    nextTrack,
    previousTrack,
    
    // UI state
    menuPath,
    setMenuPath,
    isFullscreen,
    setIsFullscreen,
    
    // Status
    isOffline,
    lyricsLoading,
  };
}
```

**Benefits of this pattern:**

1. **Separation of concerns** - UI component focuses on rendering, logic hook handles state
2. **Composability** - Logic hooks compose global hooks and store state cleanly
3. **Testability** - Logic can be tested independently of UI
4. **Reusability** - Same logic can power multiple UI variations (e.g., iPod and Karaoke share patterns)

**Apps using this pattern:**

| App | Logic Hook | Key Responsibilities |
|-----|------------|---------------------|
| iPod | `useIpodLogic` | Playback, lyrics, navigation, fullscreen |
| Finder | `useFinderLogic` | File navigation, selection, operations |
| Chats | `useAiChat` | AI chat, message handling, tool execution |
| Terminal | `useTerminalLogic` | Command execution, history, Vim mode |
| Paint | `usePaintLogic` | Canvas operations, tools, filters |
| Karaoke | `useKaraokeLogic` | Karaoke playback, lyrics sync |
| TextEdit | `useTextEditState` | Document state, file operations |
| Photo Booth | `usePhotoBoothLogic` | Camera, effects, capture |
| Soundboard | `useSoundboardLogic` | Audio recording, playback, boards |
| Synth | `useSynthLogic` | Synthesis, presets, waveform |

Framework-level search performance is also optimized by moving Spotlight indexing/querying work to a dedicated worker (`src/workers/spotlightSearch.worker.ts`), while hooks and UI subscribe to typed request/response payloads.

## Subsections

- [Window Management](/docs/window-management) - Window rendering, positioning, and frame components
- [State Management](/docs/state-management) - Zustand stores and data persistence
- [Theme System](/docs/theme-system) - Themes, appearance, and visual customization
- [Hooks Architecture](/docs/hooks-architecture) - Custom React hooks for audio, media, and utilities
- [Component Architecture](/docs/component-architecture) - UI component organization and patterns
