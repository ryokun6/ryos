import { AppManager } from "./apps/base/AppManager";
import { appRegistry } from "./config/appRegistry";
import { useEffect, useState } from "react";
import { applyDisplayMode } from "./utils/displayMode";
import { Toaster } from "./components/ui/sonner";
import { useAppStoreShallow } from "@/stores/helpers";
import { BootScreen } from "./components/dialogs/BootScreen";
import { getNextBootMessage, clearNextBootMessage } from "./utils/bootMessage";
import { AnyApp } from "./apps/base/types";
import { useAppStore } from "./stores/useAppStore";
import { debugAndClearCorruptedStates } from "./stores/useAppStore";

// Convert registry to array
const apps: AnyApp[] = Object.values(appRegistry);

function App() {
  const { displayMode, isFirstBoot, setHasBooted, debugMode, setDebugMode } = useAppStoreShallow(
    (state) => ({
      displayMode: state.displayMode,
      isFirstBoot: state.isFirstBoot,
      setHasBooted: state.setHasBooted,
      debugMode: state.debugMode,
      setDebugMode: state.setDebugMode,
    })
  );
  const [bootScreenMessage, setBootScreenMessage] = useState<string | null>(
    null
  );
  const [showBootScreen, setShowBootScreen] = useState(false);

  // Global error handler for video link crashes
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      console.error('[Global Error Handler]', event.error);
      
      // Check if the error is related to video processing or app launching
      const errorMessage = event.error?.message || event.message || '';
      const isVideoRelated = errorMessage.includes('video') || 
                            errorMessage.includes('initialData') || 
                            errorMessage.includes('instance') ||
                            errorMessage.includes('launchApp');
      
      if (isVideoRelated) {
        console.log('[Global Error Handler] Video-related error detected, attempting recovery...');
        try {
          const appStore = useAppStore.getState();
          if (appStore.recoverFromCrash) {
            appStore.recoverFromCrash();
          }
          if (appStore.clearCorruptedStates) {
            appStore.clearCorruptedStates();
          }
        } catch (recoveryError) {
          console.error('[Global Error Handler] Recovery failed:', recoveryError);
        }
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[Global Error Handler] Unhandled Promise Rejection:', event.reason);
      
      // Check if the rejection is related to video processing
      const reason = event.reason?.message || String(event.reason);
      const isVideoRelated = reason.includes('video') || 
                            reason.includes('initialData') || 
                            reason.includes('instance');
      
      if (isVideoRelated) {
        console.log('[Global Error Handler] Video-related promise rejection, attempting recovery...');
        try {
          const appStore = useAppStore.getState();
          if (appStore.clearCorruptedStates) {
            appStore.clearCorruptedStates();
          }
        } catch (recoveryError) {
          console.error('[Global Error Handler] Recovery failed:', recoveryError);
        }
      }
    };

    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Debug mode keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key === "D") {
        setDebugMode(!debugMode);
        console.log(`Debug mode ${!debugMode ? "enabled" : "disabled"}`);
        
        if (!debugMode) {
          // When enabling debug mode, also clear any corrupted states
          debugAndClearCorruptedStates();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [debugMode, setDebugMode]);

  useEffect(() => {
    applyDisplayMode(displayMode);
  }, [displayMode]);

  useEffect(() => {
    // Only show boot screen for system operations (reset/restore/format/debug)
    const persistedMessage = getNextBootMessage();
    if (persistedMessage) {
      setBootScreenMessage(persistedMessage);
      setShowBootScreen(true);
    }

    // Set first boot flag without showing boot screen
    if (isFirstBoot) {
      setHasBooted();
    }
  }, [isFirstBoot, setHasBooted]);

  if (showBootScreen) {
    return (
      <BootScreen
        isOpen={true}
        onOpenChange={() => {}}
        title={bootScreenMessage || "System Restoring..."}
        onBootComplete={() => {
          clearNextBootMessage();
          setShowBootScreen(false);
        }}
      />
    );
  }

  return (
    <>
      <AppManager apps={apps} />
      <Toaster
        position="bottom-left"
        offset={`calc(env(safe-area-inset-bottom, 0px) + 32px)`}
      />
    </>
  );
}

export default App;
