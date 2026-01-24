# App Structure Templates

Complete templates for each file in a ryOS application.

## Logic Hook Template

`hooks/use[AppName]Logic.ts`:

```typescript
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { helpItems } from "..";

interface Use[AppName]LogicProps {
  isWindowOpen: boolean;
  isForeground?: boolean;
  instanceId: string;
  initialData?: [AppInitialData]; // Replace with your type
}

export function use[AppName]Logic({
  isWindowOpen,
  isForeground,
  instanceId,
  initialData,
}: Use[AppName]LogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("[app-name]", helpItems);
  
  // Theme state
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  
  // Dialog state
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  
  // App-specific state
  // const [myState, setMyState] = useState(initialData?.value ?? defaultValue);
  
  // App-specific handlers
  // const handleAction = useCallback(() => {
  //   // ...
  // }, []);

  return {
    // Translations
    t,
    translatedHelpItems,
    
    // Theme
    currentTheme,
    isXpTheme,
    
    // Dialogs
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    
    // App state & handlers
    // myState,
    // handleAction,
  };
}
```

## Menu Bar Template

`components/[AppName]MenuBar.tsx`:

```typescript
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarCheckboxItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";

interface [AppName]MenuBarProps {
  onClose: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  // Add app-specific props
}

export function [AppName]MenuBar({
  onClose,
  onShowHelp,
  onShowAbout,
}: [AppName]MenuBarProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOsxTheme = currentTheme === "macosx";

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      {/* File Menu */}
      <MenubarMenu>
        <MenubarTrigger>{t("common.menu.file")}</MenubarTrigger>
        <MenubarContent>
          {/* Add app-specific file actions */}
          <MenubarSeparator />
          <MenubarItem onClick={onClose}>
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* Edit Menu (if needed) */}
      <MenubarMenu>
        <MenubarTrigger>{t("common.menu.edit")}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>{t("common.menu.undo")}</MenubarItem>
          <MenubarItem>{t("common.menu.redo")}</MenubarItem>
          <MenubarSeparator />
          <MenubarItem>{t("common.menu.cut")}</MenubarItem>
          <MenubarItem>{t("common.menu.copy")}</MenubarItem>
          <MenubarItem>{t("common.menu.paste")}</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      {/* View Menu (if needed) */}
      <MenubarMenu>
        <MenubarTrigger>{t("common.menu.view")}</MenubarTrigger>
        <MenubarContent>
          {/* Add view options */}
        </MenubarContent>
      </MenubarMenu>

      {/* Help Menu */}
      <MenubarMenu>
        <MenubarTrigger>{t("common.menu.help")}</MenubarTrigger>
        <MenubarContent>
          <MenubarItem onClick={onShowHelp}>
            {t("apps.[app-name].menu.help")}
          </MenubarItem>
          {!isMacOsxTheme && (
            <>
              <MenubarSeparator />
              <MenubarItem onClick={onShowAbout}>
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

## App Definition Template

`index.tsx`:

```typescript
import { BaseApp } from "../base/types";
import { [AppName]AppComponent } from "./components/[AppName]AppComponent";

export const appMetadata = {
  name: "[App Name]",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/[app-name].png",
};

export const helpItems = [
  {
    icon: "🚀",
    title: "Getting Started",
    description: "How to use this app",
  },
  {
    icon: "⚡",
    title: "Feature Name",
    description: "Description of the feature",
  },
  {
    icon: "💡",
    title: "Tips",
    description: "Helpful tips for using the app",
  },
];

// Optional: Full BaseApp export for type checking
export const [AppName]App: BaseApp = {
  id: "[app-name]",
  name: "[App Name]",
  icon: { type: "image", src: appMetadata.icon },
  description: "Brief description of the app",
  component: [AppName]AppComponent,
  helpItems,
  metadata: appMetadata,
};
```

## Full Main Component Template

`components/[AppName]AppComponent.tsx`:

```typescript
import { WindowFrame } from "@/components/layout/WindowFrame";
import { [AppName]MenuBar } from "./[AppName]MenuBar";
import { AppProps } from "@/apps/base/types";
import { use[AppName]Logic } from "../hooks/use[AppName]Logic";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "..";
import { cn } from "@/lib/utils";

// Define initial data type if needed
// interface [AppName]InitialData {
//   file?: string;
//   mode?: "view" | "edit";
// }

export function [AppName]AppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  initialData,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps/* <[AppName]InitialData> */) {
  const {
    t,
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isXpTheme,
    currentTheme,
    // App-specific state
  } = use[AppName]Logic({
    isWindowOpen,
    isForeground,
    instanceId,
    initialData,
  });

  // Build menu bar
  const menuBar = (
    <[AppName]MenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      // Pass app-specific props
    />
  );

  // Early return if window not open
  if (!isWindowOpen) return null;

  return (
    <>
      {/* Menu bar for macOS/System7 themes */}
      {!isXpTheme && isForeground && menuBar}

      <WindowFrame
        title={t("apps.[app-name].title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="[app-name]"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        windowConstraints={{
          minWidth: 400,
          minHeight: 300,
        }}
      >
        {/* Main app content */}
        <div className={cn(
          "flex flex-col h-full",
          "bg-os-window-bg font-os-ui"
        )}>
          {/* Toolbar (optional) */}
          <div className="flex items-center gap-2 p-2 border-b border-os-window-border">
            {/* Toolbar content */}
          </div>

          {/* Main content area */}
          <div className="flex-1 overflow-auto p-4">
            <h1>Hello from [App Name]!</h1>
            {/* Your app content */}
          </div>

          {/* Status bar (optional) */}
          <div className="flex items-center px-2 py-1 border-t border-os-window-border text-xs text-os-text-secondary">
            Ready
          </div>
        </div>
      </WindowFrame>

      {/* Help Dialog */}
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="[app-name]"
        helpItems={translatedHelpItems}
      />

      {/* About Dialog */}
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

## App Registry Entry Template

Add to `src/config/appRegistry.tsx`:

```typescript
// ============ [APP NAME] ============
// Import metadata
import {
  appMetadata as [appName]Metadata,
  helpItems as [appName]HelpItems,
} from "@/apps/[app-name]";

// Create lazy component
const Lazy[AppName]App = createLazyComponent<unknown>(
  () =>
    import("@/apps/[app-name]/components/[AppName]AppComponent").then((m) => ({
      default: m.[AppName]AppComponent,
    })),
  "[app-name]"
);

// Add to appRegistry object:
export const appRegistry = {
  // ... existing apps ...
  
  ["[app-name]"]: {
    id: "[app-name]",
    name: "[App Name]",
    icon: { type: "image", src: [appName]Metadata.icon },
    description: "Description of what the app does",
    component: Lazy[AppName]App,
    helpItems: [appName]HelpItems,
    metadata: [appName]Metadata,
    windowConfig: {
      defaultSize: { width: 650, height: 475 },
      minSize: { width: 400, height: 300 },
      // maxSize: { width: 800, height: 600 }, // optional
    } as WindowConstraints,
  },
} as const;
```

## Translation Keys

Add to `src/locales/en/translation.json`:

```json
{
  "apps": {
    "[app-name]": {
      "title": "[App Name]",
      "menu": {
        "help": "[App Name] Help",
        "about": "About [App Name]"
      }
    }
  }
}
```

## App Icon

Place icon at: `public/icons/default/[app-name].png`

- Recommended size: 128x128 or 256x256
- Format: PNG with transparency
- Style: Match the retro OS aesthetic
