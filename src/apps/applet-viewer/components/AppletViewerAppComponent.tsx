import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps } from "@/apps/base/types";
import { useState, useRef, useEffect } from "react";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { AppletViewerMenuBar } from "./AppletViewerMenuBar";
import { appMetadata, helpItems, AppletViewerInitialData } from "../index";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppletStore } from "@/stores/useAppletStore";
import { useAppStore } from "@/stores/useAppStore";
import { Button } from "@/components/ui/button";
import { useLaunchApp } from "@/hooks/useLaunchApp";

export function AppletViewerAppComponent({
  onClose,
  isWindowOpen,
  isForeground = true,
  skipInitialSound,
  instanceId,
  initialData,
}: AppProps<AppletViewerInitialData>) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";
  const isSystem7Theme = currentTheme === "system7";

  const typedInitialData = initialData as AppletViewerInitialData | undefined;
  const appletPath = typedInitialData?.path || "";
  const htmlContent = typedInitialData?.content || "";
  const hasAppletContent = htmlContent.trim().length > 0;

  // Debug logging
  useEffect(() => {
    console.log("[AppletViewer] Loaded applet:", {
      path: appletPath,
      contentLength: htmlContent.length,
      hasContent: !!htmlContent,
    });
  }, [appletPath, htmlContent]);

  // Get the applet-specific window size
  const { getAppletWindowSize, setAppletWindowSize } = useAppletStore();
  const savedSize = appletPath ? getAppletWindowSize(appletPath) : undefined;

  // Get current window state from app store
  const currentWindowState = useAppStore((state) =>
    instanceId ? state.instances[instanceId] : state.apps["applet-viewer"]
  );

  // Apply saved size to the window instance ONLY once when available
  const appliedInitialSizeRef = useRef(false);
  useEffect(() => {
    if (appliedInitialSizeRef.current) return;
    if (!instanceId || !savedSize) return;
    const appStore = useAppStore.getState();
    const inst = appStore.instances[instanceId];
    if (!inst) return;
    const currentSize = inst.size;
    if (
      !currentSize ||
      currentSize.width !== savedSize.width ||
      currentSize.height !== savedSize.height
    ) {
      const pos = inst.position || { x: 0, y: 0 };
      appStore.updateInstanceWindowState(instanceId, pos, savedSize);
    }
    appliedInitialSizeRef.current = true;
  }, [instanceId, savedSize]);

  // Save window size to custom store whenever it changes in the app store (avoid loops)
  useEffect(() => {
    if (!appletPath || !currentWindowState?.size) return;
    const next = currentWindowState.size;
    // Only write when different from saved size to prevent infinite update loops
    if (
      !savedSize ||
      savedSize.width !== next.width ||
      savedSize.height !== next.height
    ) {
      setAppletWindowSize(appletPath, next);
    }
  }, [appletPath, currentWindowState?.size, savedSize, setAppletWindowSize]);

  // Get filename from path for window title
  const getFileName = (path: string): string => {
    const parts = path.split("/");
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(html|app)$/i, "");
  };

  // Ensure macOSX theme uses Lucida Grande/system/emoji-safe fonts inside iframe content
  const ensureMacFonts = (content: string): string => {
    if (!isMacTheme || !content) return content;
    // Ensure fonts.css is available and prefer Lucida Grande
    const preload = `<link rel="stylesheet" href="/fonts/fonts.css">`;
    const fontStyle = `<style data-ryos-applet-font-fix>
      html,body{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
      *{font-family:inherit!important}
      h1,h2,h3,h4,h5,h6,p,div,span,a,li,ul,ol,button,input,select,textarea,label,code,pre,blockquote,small,strong,em,table,th,td{font-family:"LucidaGrande","Lucida Grande",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,"Apple Color Emoji","Noto Color Emoji",sans-serif!important}
    </style>`;

    // If there's a </head>, inject before it
    const headCloseIdx = content.toLowerCase().lastIndexOf("</head>");
    if (headCloseIdx !== -1) {
      return (
        content.slice(0, headCloseIdx) +
        preload +
        fontStyle +
        content.slice(headCloseIdx)
      );
    }

    // If there's an <head>, inject after it
    const headOpenMatch = /<head[^>]*>/i.exec(content);
    if (headOpenMatch) {
      const idx = headOpenMatch.index + headOpenMatch[0].length;
      return content.slice(0, idx) + preload + fontStyle + content.slice(idx);
    }

    // If there's an <html>, create head and inject
    const htmlOpenMatch = /<html[^>]*>/i.exec(content);
    if (htmlOpenMatch) {
      const idx = htmlOpenMatch.index + htmlOpenMatch[0].length;
      return (
        content.slice(0, idx) +
        `<head>${preload}${fontStyle}</head>` +
        content.slice(idx)
      );
    }

    // Otherwise, wrap minimally
    return `<!DOCTYPE html><html><head>${preload}${fontStyle}</head><body>${content}</body></html>`;
  };

  const menuBar = (
    <AppletViewerMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
    />
  );

  const launchApp = useLaunchApp();

  // Bring window to foreground when interacting inside the iframe while it's in the back
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !instanceId) return;

    const attachInteractionListeners = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) return;
        const handleInteract = () => {
          const state = useAppStore.getState();
          const inst = state.instances[instanceId];
          if (inst && !inst.isForeground) {
            state.bringInstanceToForeground(instanceId);
          }
        };
        // Use capturing to ensure we catch early
        doc.addEventListener("pointerdown", handleInteract, true);
        doc.addEventListener("mousedown", handleInteract, true);
        doc.addEventListener("touchstart", handleInteract, true);
        doc.addEventListener("keydown", handleInteract, true);

        return () => {
          doc.removeEventListener("pointerdown", handleInteract, true);
          doc.removeEventListener("mousedown", handleInteract, true);
          doc.removeEventListener("touchstart", handleInteract, true);
          doc.removeEventListener("keydown", handleInteract, true);
        };
      } catch {
        // If cross-origin or sandbox prevents access, silently ignore
        return;
      }
    };

    // Attach now (for srcDoc) and also on load in case content re-renders
    const cleanup = attachInteractionListeners();
    const onLoad = () => {
      if (cleanup) cleanup();
      attachInteractionListeners();
    };
    iframe.addEventListener("load", onLoad);

    return () => {
      iframe.removeEventListener("load", onLoad);
      if (cleanup) cleanup();
    };
  }, [instanceId]);

  if (!isWindowOpen) return null;

  const windowTitle =
    hasAppletContent && appletPath ? getFileName(appletPath) : "Applet Viewer";

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={windowTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="applet-viewer"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="w-full h-full bg-white overflow-hidden">
          {hasAppletContent ? (
            <iframe
              ref={iframeRef}
              srcDoc={ensureMacFonts(htmlContent)}
              title={windowTitle}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
              style={{
                display: "block",
              }}
            />
          ) : (
            <div
              className="h-full w-full flex items-center justify-center"
              style={
                isMacTheme
                  ? {
                      backgroundColor: "var(--os-color-window-bg)",
                      backgroundImage: "var(--os-pinstripe-window)",
                    }
                  : undefined
              }
            >
              <div className="text-center px-6 font-geneva-12">
                <h2 className="text-[13px] font-geneva-12 font-medium">
                  No applet open
                </h2>
                <p className="text-[11px] text-gray-600 font-geneva-12 mb-3">
                  Open applets from Finder or create from Chats
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant={
                      isMacTheme
                        ? "secondary"
                        : isSystem7Theme
                        ? "retro"
                        : "outline"
                    }
                    onClick={() =>
                      launchApp("finder", { initialPath: "/Applets" })
                    }
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      isMacTheme
                        ? "secondary"
                        : isSystem7Theme
                        ? "retro"
                        : "outline"
                    }
                    onClick={() => launchApp("chats")}
                  >
                    Create
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appName="Applet Viewer"
        helpItems={helpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
      />
    </>
  );
}
