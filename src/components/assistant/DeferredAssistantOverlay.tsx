import {
  Component,
  Suspense,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { useAssistantStore } from "@/stores/useAssistantStore";
import { safeLazy } from "@/utils/safeLazy";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("Assistant");

const AssistantOverlay = safeLazy(
  () =>
    import("./AssistantOverlay").then((m) => ({
      default: m.AssistantOverlay,
    })),
  { name: "AssistantOverlay" }
);

/**
 * Keep Rover's AI-SDK chunk off the desktop error boundary. A failed
 * `import()` becomes `TypeError: Importing a module script failed.` — if that
 * bubbles to DesktopErrorBoundary the Dock/Desktop unmount and the #000
 * html/body looks like a black screen.
 */
class AssistantOverlayBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.warn("Assistant overlay crashed; desktop will keep running", {
      errorName: error.name,
      errorMessage: error.message,
      componentStack: info.componentStack,
    });
  }

  render(): ReactNode {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

export function DeferredAssistantOverlay() {
  const enabled = useAssistantStore((state) => state.enabled);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const arm = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof requestIdleCallback === "function") {
      const idleId = requestIdleCallback(arm, { timeout: 1200 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(arm, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!enabled || !ready) return null;

  return (
    <AssistantOverlayBoundary>
      <Suspense fallback={null}>
        <AssistantOverlay />
      </Suspense>
    </AssistantOverlayBoundary>
  );
}
