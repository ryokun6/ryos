import { AppManager } from "./apps/base/AppManager";
import { appRegistry } from "./config/appRegistry";
import { useEffect, useState } from "react";
import { applyDisplayMode } from "./utils/displayMode";
import { Toaster } from "./components/ui/sonner";
import { useAppStoreShallow } from "@/stores/helpers";
import { BootScreen } from "./components/dialogs/BootScreen";
import { getNextBootMessage, clearNextBootMessage } from "./utils/bootMessage";
import { AnyApp } from "./apps/base/types";

// Convert registry to array
const apps: AnyApp[] = Object.values(appRegistry);

export function App() {
  const { displayMode, isFirstBoot, setHasBooted } = useAppStoreShallow(
    (state) => ({
      displayMode: state.displayMode,
      isFirstBoot: state.isFirstBoot,
      setHasBooted: state.setHasBooted,
    })
  );
  const [bootScreenMessage, setBootScreenMessage] = useState<string | null>(
    null
  );
  const [showBootScreen, setShowBootScreen] = useState(false);

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
        offset="32px"
      />
    </>
  );
}
