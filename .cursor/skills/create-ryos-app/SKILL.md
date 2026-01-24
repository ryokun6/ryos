---
name: create-ryos-app
description: Create new applications for ryOS following established patterns and conventions. Use when building a new app, adding an application to the desktop, creating app components, or scaffolding app structures.
---

# Creating ryOS Applications

## Quick Start Checklist

```
- [ ] 1. Create app directory structure in src/apps/[app-name]/
- [ ] 2. Create main component: [AppName]AppComponent.tsx
- [ ] 3. Create menu bar: [AppName]MenuBar.tsx
- [ ] 4. Create logic hook: use[AppName]Logic.ts
- [ ] 5. Create app definition: index.tsx
- [ ] 6. Add app icon to public/icons/default/
- [ ] 7. Register app in src/config/appRegistry.tsx
- [ ] 8. Add translations to src/locales/
```

## Directory Structure

```
src/apps/[app-name]/
├── components/
│   ├── [AppName]AppComponent.tsx  # Main component (required)
│   └── [AppName]MenuBar.tsx       # Menu bar (required)
├── hooks/
│   └── use[AppName]Logic.ts       # Logic hook (recommended)
├── types/                         # Types (optional)
├── utils/                         # Utilities (optional)
└── index.tsx                      # App definition (required)
```

## Essential Files

### 1. Main Component (`[AppName]AppComponent.tsx`)

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
    isXpTheme,
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
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.[app-name].title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="[app-name]"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="flex flex-col h-full">
          {/* App content here */}
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

### 2. App Definition (`index.tsx`)

```tsx
export const appMetadata = {
  name: "[App Name]",
  version: "1.0.0",
  creator: { name: "Ryo Lu", url: "https://ryo.lu" },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/[app-name].png",
};

export const helpItems = [
  { icon: "🎯", title: "Feature", description: "Description" },
];
```

### 3. Register in `appRegistry.tsx`

```tsx
// Add import
import { appMetadata as [appName]Metadata, helpItems as [appName]HelpItems } from "@/apps/[app-name]";

// Add lazy component
const Lazy[AppName]App = createLazyComponent<unknown>(
  () => import("@/apps/[app-name]/components/[AppName]AppComponent")
    .then(m => ({ default: m.[AppName]AppComponent })),
  "[app-name]"
);

// Add to registry object
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

## AppProps Interface

All apps receive these props:

| Prop | Type | Description |
|------|------|-------------|
| `isWindowOpen` | `boolean` | Window visibility state |
| `onClose` | `() => void` | Close window handler |
| `isForeground` | `boolean` | Window is active/focused |
| `instanceId` | `string` | Unique instance identifier |
| `skipInitialSound` | `boolean` | Skip window open sound |
| `initialData` | `TInitialData` | Optional data passed when opening |
| `onNavigateNext` | `() => void` | Navigate to next instance |
| `onNavigatePrevious` | `() => void` | Navigate to previous instance |

## WindowFrame Options

```tsx
<WindowFrame
  title="Window Title"
  onClose={onClose}
  isForeground={isForeground}
  appId="app-id"
  instanceId={instanceId}
  
  // Optional
  menuBar={menuBar}                    // For XP/98 themes
  material="default"                   // "default" | "transparent" | "notitlebar"
  windowConstraints={{ minWidth: 400 }}
  interceptClose={true}                // For save dialogs
  keepMountedWhenMinimized={true}      // Keep state when minimized
/>
```

## Menu Bar Placement

Menu bars render differently based on theme:

```tsx
const currentTheme = useThemeStore((state) => state.current);
const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

return (
  <>
    {/* macOS/System7: Outside WindowFrame when foreground */}
    {!isXpTheme && isForeground && menuBar}
    
    <WindowFrame
      {/* XP/Win98: Inside WindowFrame via prop */}
      menuBar={isXpTheme ? menuBar : undefined}
    >
      {/* content */}
    </WindowFrame>
  </>
);
```

## Common Imports

```tsx
// Core
import { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { MenuBar } from "@/components/layout/MenuBar";

// UI Components
import { Button } from "@/components/ui/button";
import { MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from "@/components/ui/menubar";

// Dialogs
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";

// Stores & Hooks
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
```

## Additional Resources

- For complete file templates, see [STRUCTURE.md](STRUCTURE.md)
- For code examples, see [EXAMPLES.md](EXAMPLES.md)
