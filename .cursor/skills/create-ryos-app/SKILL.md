---
name: create-ryos-app
description: Create new applications for ryOS following established patterns and conventions. Use when building a new app, adding an application to the desktop, creating app components, or scaffolding app structures.
---

# Creating ryOS Applications

## Quick Start Checklist

```
- [ ] 1. Create app directory: src/apps/[app-name]/
- [ ] 2. Create main component: components/[AppName]AppComponent.tsx
- [ ] 3. Create menu bar: components/[AppName]MenuBar.tsx
- [ ] 4. Create logic hook: hooks/use[AppName]Logic.ts
- [ ] 5. Create metadata: metadata.ts (appMetadata + exactly 6 help items)
- [ ] 6. Create app definition: index.tsx (re-export metadata, declare initialData type)
- [ ] 7. Add icon: public/icons/default/[app-name].png
- [ ] 8. Register the app id: add to appIds + appNames in src/config/appRegistryData.ts
- [ ] 9. Register the app: lazy component + registry entry in src/config/appRegistry.tsx
- [ ] 10. Register help key order in src/hooks/useTranslatedHelpItems.ts
- [ ] 11. Add translation keys to src/lib/locales/en/translation.json
- [ ] 12. Localize (last): add en strings, sync locales; use the localize skill to finish
```

## Directory Structure

```
src/apps/[app-name]/
├── components/
│   ├── [AppName]AppComponent.tsx  # Main component (required)
│   └── [AppName]MenuBar.tsx       # Menu bar (required)
├── hooks/
│   └── use[AppName]Logic.ts       # Logic hook (recommended)
├── metadata.ts                    # appMetadata + helpItems (required)
└── index.tsx                      # App definition: re-export metadata, initialData types (required)
```

### Why metadata lives in its own file

`appRegistry.tsx` imports `appMetadata`/`helpItems` **eagerly** so the dock, About/Help dialogs, and search can show app info without loading the (lazy) component bundle. Keep these in a tiny `metadata.ts` that imports nothing heavy. Most current apps follow this split (`@/apps/<id>/metadata`). `index.tsx` then re-exports from `metadata.ts` and is the home for `initialData` types and any app-specific exported types.

## 1. Metadata (`metadata.ts`)

Keep app metadata and help items in `metadata.ts` so the registry can load them eagerly without pulling in the component.

```tsx
export const appMetadata = {
  name: "[App Name]",
  version: "1.0.0",
  creator: { name: "Ryo Lu", url: "https://ryo.lu" },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/[app-name].png",
};

// Always include exactly 6 help items (icon, title, description each).
export const helpItems = [
  { icon: "🚀", title: "Getting Started", description: "How to use this app" },
  { icon: "📂", title: "Open & Save", description: "Open and save files from the File menu" },
  { icon: "✏️", title: "Editing", description: "Use the Edit menu for cut, copy, paste" },
  { icon: "👁️", title: "View Options", description: "Adjust view and layout from the View menu" },
  { icon: "⌨️", title: "Shortcuts", description: "Use keyboard shortcuts for faster workflows" },
  { icon: "❓", title: "Help & About", description: "Open Help from the Help menu for more info" },
];
```

### App Definition (`index.tsx`)

Re-export the metadata and declare any `initialData` type. This is what other files import as `@/apps/[app-name]`.

```tsx
export { appMetadata, helpItems } from "./metadata";

// Optional: typed startup payload for launchApp("[app-name]", { ... })
export interface [AppName]InitialData {
  // e.g. filePath?: string;
}
```

## 2. Main Component (`[AppName]AppComponent.tsx`)

```tsx
import { WindowFrame } from "@/components/layout/WindowFrame";
import { [AppName]MenuBar } from "./[AppName]MenuBar";
import { AppProps } from "@/apps/base/types";
import { use[AppName]Logic } from "../hooks/use[AppName]Logic";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "..";

export function [AppName]AppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isWindowsTheme,
  } = use[AppName]Logic({ isWindowOpen, isForeground, instanceId });

  const menuBar = (
    <[AppName]MenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isWindowsTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.[app-name].title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="[app-name]"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isWindowsTheme ? menuBar : undefined}
      >
        <div className="flex flex-col h-full bg-os-window-bg font-os-ui">
          {/* App content */}
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="[app-name]"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="[app-name]"
      />
    </>
  );
}
```

## 3. Logic Hook (`use[AppName]Logic.ts`)

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { helpItems } from "..";

export function use[AppName]Logic({ instanceId }: { instanceId: string }) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("[app-name]", helpItems);
  const currentTheme = useThemeStore((state) => state.current);
  const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  return {
    t,
    translatedHelpItems,
    isWindowsTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  };
}
```

## 4. Menu Bar (`[AppName]MenuBar.tsx`)

Match existing app menubars: structure, classes, and spacing.

- **Wrapper**: `<MenuBar inWindowFrame={isWindowsTheme}>` — no extra gap between menus (layout uses `space-x-0`).
- **Trigger**: `MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0"`.
- **Content**: `MenubarContent align="start" sideOffset={1} className="px-0"`.
- **Items**: `MenubarItem className="text-md h-6 px-3"`.
- **Separators**: `MenubarSeparator className="h-[2px] bg-black my-1"`.

```tsx
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";

interface [AppName]MenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
}

export function [AppName]MenuBar({ onClose, onShowHelp, onShowAbout }: [AppName]MenuBarProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSTheme = currentTheme === "macosx";

  return (
    <MenuBar inWindowFrame={isWindowsTheme}>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem onClick={onClose} className="text-md h-6 px-3">
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem onClick={onShowHelp} className="text-md h-6 px-3">
            {t("apps.[app-name].menu.help")}
          </MenubarItem>
          {!isMacOSTheme && (
            <>
              <MenubarSeparator className="h-[2px] bg-black my-1" />
              <MenubarItem onClick={onShowAbout} className="text-md h-6 px-3">
                {t("apps.[app-name].menu.about")}
              </MenubarItem>
            </>
          )}
        </MenubarContent>
      </MenubarMenu>
    </MenuBar>
  );
}
```

## 5. Register the App ID (`appRegistryData.ts`)

The `AppId` union type, dock/search ordering, and store lookups all derive from `src/config/appRegistryData.ts`. **Add the id here first** — otherwise `appRegistry.tsx` (and everything typed against `AppId`) will not compile.

```tsx
// src/config/appRegistryData.ts
export const appIds = [
  // ...existing ids...
  "[app-name]",
] as const;

export const appNames: Record<AppId, string> = {
  // ...existing names...
  "[app-name]": "[App Name]",
};
```

If you ever rename an app's id, add the old id to `LEGACY_APP_ID_ALIASES` so persisted/bookmarked references still resolve.

## 6. Register in `appRegistry.tsx`

`createLazyComponent` lives in `src/config/lazyAppComponent.tsx` (already imported at the top of `appRegistry.tsx`) and registers the chunk for intent-based prefetch. Import metadata from the lightweight `metadata.ts`, not the component.

```tsx
// Metadata import (eager, lightweight) — note the /metadata path
import { appMetadata as [appName]Metadata, helpItems as [appName]HelpItems } from "@/apps/[app-name]/metadata";

// Lazy component (loaded on open). Use your initialData type instead of unknown if you declared one.
const Lazy[AppName]App = createLazyComponent<unknown>(
  () => import("@/apps/[app-name]/components/[AppName]AppComponent")
    .then(m => ({ default: m.[AppName]AppComponent })),
  "[app-name]" // cache key = app id, keeps refs stable across HMR + enables prefetch
);

// Add to the appRegistry object
["[app-name]"]: {
  id: "[app-name]",
  name: "[App Name]",
  icon: { type: "image", src: [appName]Metadata.icon },
  description: "App description",
  component: Lazy[AppName]App,
  helpItems: [appName]HelpItems,
  metadata: [appName]Metadata,
  windowConfig: {
    defaultSize: { width: 650, height: 475 },
    minSize: { width: 400, height: 300 },
  } as WindowConstraints,
},
```

## 7. Register help keys

`useTranslatedHelpItems("[app-name]", helpItems)` needs a matching key list in `APP_HELP_I18N_KEYS` in `src/hooks/useTranslatedHelpItems.ts`. Keep the list in the same order as `metadata.ts` `helpItems`; the hook preserves the icons and swaps in `apps.[app-name].help.[key].title` and `.description`.

For longer help lists, create `src/apps/[app-name]/helpKeys.ts` and spread that exported list into `APP_HELP_I18N_KEYS`. Calculator, Maps, and Internet Explorer are good examples.

Run `bun test tests/test-help-i18n-alignment.test.ts` after adding the app. It catches missing help keys and row-count drift across every registered app.

## AppProps Interface

| Prop | Type | Description |
|------|------|-------------|
| `isWindowOpen` | `boolean` | Window visibility |
| `onClose` | `() => void` | Close handler |
| `isForeground` | `boolean` | Window is active |
| `instanceId` | `string` | Unique instance ID |
| `skipInitialSound` | `boolean` | Skip open sound |
| `initialData` | `TInitialData` | Optional startup data |

## Menu Bar Placement

- **macOS/System7**: Render outside WindowFrame when `isForeground`
- **XP/Win98**: Pass via `menuBar` prop to WindowFrame

```tsx
const isWindowsTheme = currentTheme === "xp" || currentTheme === "win98";
return (
  <>
    {!isWindowsTheme && isForeground && menuBar}
    <WindowFrame menuBar={isWindowsTheme ? menuBar : undefined}>
```

## WindowFrame Options

| Prop | Values | Use |
|------|--------|-----|
| `material` | `"default"`, `"transparent"`, `"notitlebar"` | Window style |
| `interceptClose` | `boolean` | Show save dialog before close |
| `keepMountedWhenMinimized` | `boolean` | Preserve state when minimized |

## Common Patterns

### Initial Data
```tsx
interface ViewerInitialData { filePath: string; }
export function ViewerAppComponent({ initialData }: AppProps<ViewerInitialData>) {
  const filePath = initialData?.filePath ?? "";
}
```

### Launch Other Apps
```tsx
import { useLaunchApp } from "@/hooks/useLaunchApp";
const launchApp = useLaunchApp();
launchApp("photos", { path: "/image.png" });
```

### Global Store (Zustand)
```tsx
// src/stores/use[AppName]Store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const use[AppName]Store = create<State>()(
  persist((set) => ({ /* state and actions */ }), { name: "[app-name]-storage" })
);
```

## 8. Localize (Do Last)

After the app is built and wired up, finish by localizing:

1. **Add translation keys** for all user-facing strings (menu labels, dialogs, status, help).
2. **Add English entries** under `apps.[app-name].*` in `src/lib/locales/en/translation.json`.
3. **Sync other locales** with `bun run i18n:sync:mark-todo`.
4. **Validate** with `bun run i18n:sync:dry-run`, `bun run i18n:audit`, and the help alignment test.

Use the **localize** skill for the full workflow: extract strings → `t()` calls → en keys → sync. Do this step last so all UI copy is stable before extracting and syncing.
