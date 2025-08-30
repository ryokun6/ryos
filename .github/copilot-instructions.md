# Copilot AI Coding Agent Instructions

This guide captures the concrete patterns that make this repo tick so you can ship changes fast and safely.

## Big picture: app + window system
- App registry: `src/config/appRegistry.ts` is the single source of truth for app metadata, icon, component, and per-app windowConfig (min/default/max). Helpers: `getAppComponent`, `getWindowConfig`, `getAppIconPath`.
- Instance-based windows: `src/apps/base/AppManager.tsx` renders window instances from `useAppStore` and bridges old app-level state to the new per-instance model. It also listens for CustomEvent("launchApp") and dispatches "updateApp" when re-launching an already open app with new initialData.
- Store: `src/stores/useAppStore.ts` manages instances, z-order (`instanceOrder`), foregrounding, window position/size, and carries `initialData` per instance. Key methods: `launchApp`, `createAppInstance`, `bringInstanceToForeground`, `closeAppInstance`, `clearInstanceInitialData`.
- Launching apps: use the hook `src/hooks/useLaunchApp.ts` to call `launchApp(appId, { initialData, multiWindow })`. Multi-window is supported by Finder/TextEdit by default; others are single-window unless you pass `multiWindow: true`.
- Dock/menu integration: The Dock at `src/components/layout/Dock.tsx` and MenuBar/AppleMenu read from the store and `appRegistry`. The Dock pins Finder, Chats, and Internet Explorer by default and shows open apps uniquely by first-open time.

## How Internet Explorer (IE) app works (embedded URLs)
- Component entry: `src/apps/internet-explorer/index.tsx` exports `InternetExplorerApp` with help items and `InternetExplorerAppComponent`.
- Window behavior: IE supports `initialData` with `{ url?: string; year?: string; shareCode?: string }`. It handles:
   - First open: navigates using `initialData.shareCode` or `initialData.url/year` if supplied; otherwise default URL/year.
   - Already open: listens for `updateApp` events to navigate current instance without spawning a new window.
   - Share links: `AppManager` parses `/internet-explorer/:code` and launches IE with `initialData.shareCode`.
- Embedding and safety: IE renders an `iframe` for normal/Wayback-proxied URLs with `sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock"`. For very old/future years it can render AI-generated HTML. Server helper: `/api/iframe-check` (see `api/iframe-check.ts`).
- Programmatic launch examples:
   - Hook: `useLaunchApp()("internet-explorer", { initialData: { url: "https://example.com", year: "current" } })`.
   - Event: `window.dispatchEvent(new CustomEvent("launchApp", { detail: { appId: "internet-explorer", initialData: { url: "example.com" } } }))`.

## Adding a new app (follow existing windows like Finder/TextEdit/IE)
1) Create component and index:
- Put files under `src/apps/<your-app>/`. Export a `BaseApp` from `index.ts(x)` with shape similar to `src/apps/finder/index.ts` or `src/apps/internet-explorer/index.tsx`:
   - `id`, `name`, `icon` (string path or { type: "image", src }), `component`, optional `helpItems`, and `metadata`.
   - Component props contract is `AppProps<TInitialData>` from `src/apps/base/types.ts` and must support `initialData` and `instanceId`.
2) Register in `src/config/appRegistry.ts`:
- Import your app and add to `appRegistry` with a `windowConfig`:
   - Example windowConfig patterns: Finder (400x300), TextEdit (430x475), IE (730x600), Terminal (600x400). Use `WindowConstraints` to specify `defaultSize`, optional `minSize`/`maxSize`, and optional `mobileDefaultSize`.
3) Make it discoverable:
- Dock: Add your appId to the pinned array in `src/components/layout/Dock.tsx` if you want a permanent icon (see `const pinnedLeft: AppId[] = ["finder", "chats", "internet-explorer"]`). Otherwise it will appear when opened.
- Menus/Desktop: These read from `appRegistry` and `useAppStore`; no extra wiring usually needed.
4) Launch from code:
- Use `const launchApp = useLaunchApp(); launchApp("your-app", { initialData: {...} });`.
- If re-launching with new data and app is single-window, `AppManager` will dispatch `updateApp` and your component can listen or just read `initialData` changes via props.

## Data flow and cross-component patterns
- URL routing to apps: `AppManager` inspects `window.location.pathname` on boot to support IE share codes (`/internet-explorer/:code`), iPod (`/ipod/:id`), and Videos (`/videos/:id`); it then cleans the URL.
- Persisted windowing: `useAppStore` is persisted (Zustand `persist`). Migrations ensure `instanceOrder` consistency and legacy app states are migrated to instance-based windows on load.
- IndexedDB-backed file system: Finder uses hooks and stores in `src/apps/finder` + `src/utils/indexedDB*` to simulate a desktop.

## Dev workflows (what actually works here)
- Package manager: Bun (see `package.json` with `packageManager: "bun@..."`).
   - Install: `bun install`
   - Dev server: `PORT=5173 bun run dev` (the `dev` script assumes PORT is provided)
   - Build: `bun run build` (runs `tsc -b` then `vite build`)
- Static assets: under `public/` (icons, wallpapers, fonts). Scripts: `scripts/generate-icon-manifest.ts`, `scripts/generate-wallpaper-manifest.ts` (run via `bun run generate:icons`/`generate:wallpapers`).

## Quick examples from this repo
- App registry entry (see `src/config/appRegistry.ts`):
   - `appRegistry[InternetExplorerApp.id] = { ...(InternetExplorerApp as BaseApp<InternetExplorerInitialData>), windowConfig: { defaultSize: { width: 730, height: 600 }, minSize: { width: 400, height: 300 } } }`.
- Dock pinning (see `src/components/layout/Dock.tsx`): `const pinnedLeft: AppId[] = ["finder", "chats", "internet-explorer"]`.
- Launch from Finder/File system (see `src/apps/finder/hooks/useFileSystem.ts`): uses `useLaunchApp()` to open apps and may bring an existing instance to the foreground if appropriate.

If any of the above feels unclear or you spot patterns not covered here, tell us and we’ll tighten this doc.

## Embed app and window-frame requirement

- New app: The project includes an `Embed` app (appId: `embed`) under `src/apps/embed/` used to open arbitrary URLs inside a sandboxed iframe. It accepts `initialData` in the same shape as the IE app (commonly `{ url?: string; year?: string; shareCode?: string }`).
- WindowFrame requirement: Any app that should behave like a normal window (draggable, resizable, stacked, persisted) must either render `WindowFrame` itself or be wrapped by a parent that does. `WindowFrame` is the shared chrome that handles position, size, z-order, and menuBar props (`src/components/layout/WindowFrame.tsx`). Missing this wrapper will leave the app pinned to the top-left and not participating in the instance/window system.
- Launch examples:
   - Hook: `const launchApp = useLaunchApp(); launchApp("embed", { initialData: { url: "https://example.com" } });`
   - Event: `window.dispatchEvent(new CustomEvent("launchApp", { detail: { appId: "embed", initialData: { url: "https://example.com" } } }));`
- UI notes: The Embed app uses a small address bar + a sandboxed `<iframe>` and supplies a `menuBar` (or inline address bar) so it matches theme-specific chrome. If you add a new embed-like app, mirror this pattern for parity.
- Testing: Open the Dock icon or use `useLaunchApp()` with `embed` and confirm the window is draggable/resizable and that navigation via `initialData.url` moves the iframe. If the window is stuck at top-left, check that `WindowFrame` is present.

### Recipe: create an "embed-like" app (step-by-step)

Follow these steps to add a new app that behaves like `Embed` (or `Internet Explorer`) and participates in the instance/window system.

1. Create the component
   - Folder: `src/apps/<your-app>/components/`
   - File: `<YourApp>Component.tsx`
   - Component contract: use the `AppProps<TInitialData>` type from `src/apps/base/types.ts`. The component should accept `initialData`, `instanceId`, `onClose`, `isForeground`, `isWindowOpen`, and `skipInitialSound`.
   - Important: either render `WindowFrame` inside this component or ensure the parent will wrap it. `WindowFrame` (`src/components/layout/WindowFrame.tsx`) is required for draggable/resizable/stacked windows.
   - If your app embeds external content, use a sandboxed `<iframe>` and treat `initialData.url` as the navigation source.

2. Create the app descriptor
   - File: `src/apps/<your-app>/index.tsx`
   - Export a `BaseApp<TInitialData>` object with `id`, `name`, `icon`, `component`, optional `helpItems`, and `metadata`.

3. Register the app
   - Import and add your app to `src/config/appRegistry.ts` with a `windowConfig` describing `defaultSize` and optional `minSize`/`maxSize`.
   - Add your app id to `src/config/appIds.ts` so the type unions stay accurate.

4. Make it discoverable
   - Optionally add your app id to `pinnedLeft` in `src/components/layout/Dock.tsx` to have it appear in the Dock by default.
   - Menus and the desktop read from `appRegistry` and `useAppStore`, so no extra wiring is usually necessary.

5. Launching the app
   - Hook example: `const launchApp = useLaunchApp(); launchApp("your-app", { initialData: { url: "https://example.com" } });`
   - Event example: `window.dispatchEvent(new CustomEvent("launchApp", { detail: { appId: "your-app", initialData: { url: "https://example.com" } } }));`
   - For single-window apps, re-launching with new `initialData` will dispatch an `updateApp` event to the existing instance — handle `initialData` changes reactively.

6. Quick tests and validation
   - Run the dev server: `PORT=5173 bun run dev` and open `http://localhost:5173/`.
   - Use `useLaunchApp()` or the Dock icon to open the app and confirm it is draggable, resizable, and that `initialData` drives the UI (for example, the iframe navigates to `initialData.url`).
   - Run TypeScript build to catch typing issues: `bunx tsc -b`.

7. Files you likely create for an embed-like app
   - `src/apps/<your-app>/index.tsx` (app descriptor)
   - `src/apps/<your-app>/components/<YourApp>Component.tsx` (main UI, must use `WindowFrame`)
   - Optional: styles, test harness, hooks under `src/apps/<your-app>/`

If you'd like, I can add a small template `index.tsx` + component file for you to copy into a new app folder so you can scaffold new apps quickly.
