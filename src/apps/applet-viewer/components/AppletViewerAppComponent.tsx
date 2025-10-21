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

  const typedInitialData = initialData as AppletViewerInitialData | undefined;
  const appletPath = typedInitialData?.path || "";
  const htmlContent = typedInitialData?.content || "";

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
  const savedSize = getAppletWindowSize(appletPath);

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
  }, [
    appletPath,
    currentWindowState?.size?.width,
    currentWindowState?.size?.height,
    savedSize?.width,
    savedSize?.height,
    setAppletWindowSize,
  ]);

  // Get filename from path for window title
  const getFileName = (path: string): string => {
    const parts = path.split("/");
    const fileName = parts[parts.length - 1];
    return fileName.replace(/\.(html|app)$/i, "");
  };

  const menuBar = (
    <AppletViewerMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
    />
  );

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

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getFileName(appletPath)}
        onClose={onClose}
        isForeground={isForeground}
        appId="applet-viewer"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="w-full h-full bg-white overflow-hidden">
          <iframe
            ref={iframeRef}
            srcDoc={htmlContent}
            title={getFileName(appletPath)}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation"
            style={{
              display: "block",
            }}
          />
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
