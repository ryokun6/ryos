# Creating Iframe-Based Apps in auxOS

This guide explains how to create new apps that embed external websites using the iframe pattern, based on the improved DeLorean app template.

## Overview

Iframe-based apps in auxOS are perfect for:
- Embedding external websites
- Third-party services and tools
- Web applications that need to run in a contained environment
- Services that don't need deep OS integration

## Quick Setup (5 minutes)

### 1. Create the App Structure

```bash
# Create the app directory structure
mkdir -p src/apps/your-app-name/components

# Create the main files
touch src/apps/your-app-name/index.tsx
touch src/apps/your-app-name/components/YourAppComponent.tsx
```

### 2. Copy the Component Template

Create `src/apps/your-app-name/components/YourAppComponent.tsx`:

```tsx
import React, { useRef, useState, useCallback } from "react";
import type { AppProps } from "@/apps/base/types";
import { Button } from "@/components/ui/button";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { RefreshCw, ExternalLink, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface YourAppInitialData {
  url?: string;
}

export const YourAppComponent: React.FC<AppProps<YourAppInitialData>> = ({
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  initialData,
}) => {
  // 🔧 CUSTOMIZE THESE URLS
  const defaultUrl = "https://your-service.com";
  const fallbackUrl = "https://your-fallback.com"; // Optional fallback
  const currentUrl = initialData?.url || defaultUrl;
  
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [url, setUrl] = useState(currentUrl);
  const [retryCount, setRetryCount] = useState(0);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  const handleReload = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    
    // Try fallback after 2 failed attempts
    if (retryCount >= 2 && url === defaultUrl) {
      setUrl(fallbackUrl);
      setRetryCount(0);
    } else {
      setRetryCount(prev => prev + 1);
    }
    
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  }, [retryCount, url, defaultUrl, fallbackUrl]);
  
  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
  }, []);
  
  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);
  
  const openInNewTab = useCallback(() => {
    window.open(url, '_blank');
  }, [url]);
  
  const menuBar = (
    <div className="flex items-center px-2 gap-1">
      <Button 
        size="sm" 
        variant="ghost" 
        onClick={handleReload} 
        title="Reload"
        disabled={isLoading}
      >
        <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
      </Button>
      <Button 
        size="sm" 
        variant="ghost" 
        onClick={openInNewTab} 
        title="Open in new tab"
      >
        <ExternalLink className="h-4 w-4" />
      </Button>
      <div className="flex-1 px-2 text-xs text-muted-foreground truncate">
        {url}
      </div>
    </div>
  );

  return (
    <WindowFrame
      title="Your App Name" // 🔧 CUSTOMIZE THIS
      appId="your-app-id" // 🔧 CUSTOMIZE THIS
      onClose={onClose}
      isForeground={isForeground}
      skipInitialSound={skipInitialSound}
      instanceId={instanceId}
      menuBar={menuBar}
    >
      <div className="w-full h-full bg-white relative">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-500" />
              <span className="text-sm text-gray-600">Loading Your App...</span> {/* 🔧 CUSTOMIZE THIS */}
            </div>
          </div>
        )}
        
        {/* Error overlay */}
        {hasError && !isLoading && (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-4 p-6 text-center max-w-md">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Failed to load Your App {/* 🔧 CUSTOMIZE THIS */}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {url === fallbackUrl 
                    ? "Unable to connect to the service. Please check your internet connection."
                    : "The service might be temporarily unavailable."
                  }
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleReload} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {url === defaultUrl ? "Try Again" : "Use Fallback"}
                  </Button>
                  {url === defaultUrl && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setUrl(fallbackUrl);
                        setRetryCount(0);
                        handleReload();
                      }}
                      className="gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Use Fallback
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <iframe
          ref={iframeRef}
          src={url}
          title="Your App" // 🔧 CUSTOMIZE THIS
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-pointer-lock allow-popups-to-escape-sandbox"
          onLoad={handleLoad}
          onError={handleError}
        />
      </div>
    </WindowFrame>
  );
};
```

### 3. Create the App Index

Create `src/apps/your-app-name/index.tsx`:

```tsx
import type { BaseApp } from "@/apps/base/types";
import { YourAppComponent } from "./components/YourAppComponent";

interface YourAppInitialData {
  url?: string;
}

export const helpItems = [
  {
    icon: "🌐", // 🔧 CUSTOMIZE THIS
    title: "Navigate",
    description: "Use your app inside this secure window.",
  },
  {
    icon: "🔄",
    title: "Reload",
    description: "Refresh the page if it's not loading properly.",
  },
  {
    icon: "🔗",
    title: "Open Externally",
    description: "Open the service in a new browser tab.",
  },
];

export const appMetadata = {
  name: "Your App Name", // 🔧 CUSTOMIZE THIS
  version: "1.0.0",
  creator: { name: "auxe-os", url: "https://github.com/auxe-os" },
  github: "https://github.com/auxe-os/auxOSv1",
  icon: "/icons/default/mac-classic.png", // 🔧 CUSTOMIZE THIS
};

export const YourApp: BaseApp<YourAppInitialData> = {
  id: "your-app-id", // 🔧 CUSTOMIZE THIS (must match appIds.ts)
  name: "Your App Name", // 🔧 CUSTOMIZE THIS
  description: "Access Your Service with enhanced functionality", // 🔧 CUSTOMIZE THIS
  icon: { type: "image", src: appMetadata.icon },
  component: YourAppComponent,
  helpItems,
  metadata: appMetadata,
};

export default YourApp;
```

### 4. Register the App

1. **Add to App IDs** - Edit `src/config/appIds.ts`:
```tsx
export const appIds = [
  "finder",
  "soundboard",
  // ... other apps
  "your-app-id", // 🔧 ADD THIS
] as const;
```

2. **Add to App Registry** - Edit `src/config/appRegistry.ts`:
```tsx
// Add import at top
import YourApp from "@/apps/your-app-name";

// Add to registry object
export const appRegistry = {
  // ... other apps
  [YourApp.id]: {
    ...(YourApp as BaseApp<{ url?: string }>),
    windowConfig: {
      defaultSize: { width: 1000, height: 700 }, // 🔧 CUSTOMIZE SIZE
      minSize: { width: 800, height: 600 },
    } as WindowConstraints,
  },
} as const;
```

3. **Add to Types** - Edit `src/apps/base/types.ts`:
```tsx
export type AppId =
  | "finder"
  | "soundboard"
  // ... other apps
  | "your-app-id"; // 🔧 ADD THIS
```

### 5. Add to Dock (Optional)

Edit `src/components/layout/Dock.tsx`:
```tsx
const pinnedLeft: AppId[] = [
  "finder", 
  "chats", 
  "internet-explorer", 
  "embed", 
  "delorean",
  "your-app-id", // 🔧 ADD THIS for permanent dock icon
];
```

## Customization Points

When creating your app, customize these marked sections:

### 🔧 Required Customizations:
1. **URLs**: `defaultUrl`, `fallbackUrl` 
2. **App ID**: Must be unique and match across all files
3. **App Name**: Display name for the app
4. **Window Title**: What appears in the title bar
5. **Loading/Error Messages**: User-friendly text
6. **Icon**: Path to your app's icon
7. **Window Size**: Default and minimum dimensions
8. **Help Items**: User guidance content

### Optional Enhancements:
- **Custom Menu Bar**: Add app-specific buttons
- **Initial Data Handling**: Support URL parameters or configuration
- **Theme Integration**: Match your app's UI to auxOS themes
- **Keyboard Shortcuts**: Add app-specific hotkeys
- **Context Menus**: Right-click functionality

## Advanced Features

### URL Parameter Support
Your app automatically supports being launched with custom URLs:
```tsx
// Launch with custom URL
launchApp("your-app-id", { initialData: { url: "https://custom-url.com" } });
```

### Multiple Instances
Enable multi-window support by setting `multiWindow: true` when launching:
```tsx
launchApp("your-app-id", { multiWindow: true });
```

### Custom Sandbox Permissions
Adjust iframe sandbox attributes based on your app's needs:
```tsx
sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
```

Common sandbox permissions:
- `allow-scripts`: JavaScript execution
- `allow-forms`: Form submission
- `allow-same-origin`: Access to same-origin resources
- `allow-popups`: Open popup windows
- `allow-pointer-lock`: Mouse pointer lock
- `allow-popups-to-escape-sandbox`: Popups without sandbox

## Testing Your App

1. **Start Dev Server**: `PORT=5173 bun run dev`
2. **Open auxOS**: Navigate to `http://localhost:5173`
3. **Launch Your App**: Click the dock icon or use the Apple menu
4. **Test Features**:
   - Loading states
   - Error handling (try invalid URLs)
   - Reload functionality
   - External link opening
   - Window resizing/dragging

## Common Issues & Solutions

### TypeScript Errors
- Ensure app ID is added to `appIds.ts`
- Check that interfaces match between files
- Verify import paths are correct

### App Not Appearing
- Check app is registered in `appRegistry.ts`
- Verify component export names match
- Ensure no TypeScript compilation errors

### Loading Issues
- Test your target URL in a regular browser first
- Check sandbox permissions for your service
- Verify CORS/X-Frame-Options allow embedding

### Window Behavior
- Ensure `WindowFrame` component is properly wrapped
- Check `appId` matches across all files
- Verify window constraints are reasonable

## Best Practices

1. **Choose Good Fallback URLs**: Always provide a meaningful fallback
2. **Test Error States**: Verify error handling with unreachable URLs
3. **Optimize Window Sizes**: Consider typical usage patterns
4. **Provide Clear Help**: Write helpful help items for users
5. **Use Descriptive Names**: Make app purpose clear from the name
6. **Handle Loading States**: Always show loading feedback to users

## Example Apps You Can Create

- **GitHub**: `"https://github.com"`
- **CodePen**: `"https://codepen.io"`
- **Figma**: `"https://figma.com"`
- **Discord**: `"https://discord.com/app"`
- **Notion**: `"https://notion.so"`
- **Linear**: `"https://linear.app"`
- **Excalidraw**: `"https://excalidraw.com"`

This pattern works for any website that allows iframe embedding!
