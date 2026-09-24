import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("SafeLazy");

function EmptyLazyFallback() {
  return null;
}

/**
 * Resolve a React.lazy() module, substituting a no-op component when the
 * dynamic import fails (404, Safari "Importing a module script failed.",
 * parse error). Without this, React.lazy() rejects and any parent error
 * boundary unmounts — for DesktopErrorBoundary that is a black #000 page.
 */
export async function resolveLazyModule<T extends ComponentType<unknown>>(
  loader: () => Promise<{ default: T }>,
  name: string
): Promise<{ default: T | typeof EmptyLazyFallback }> {
  try {
    return await loader();
  } catch (error) {
    log.warn(`Failed to import ${name}`, {
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { default: EmptyLazyFallback };
  }
}

export function safeLazy<T extends ComponentType<unknown>>(
  loader: () => Promise<{ default: T }>,
  options: { name: string }
): LazyExoticComponent<ComponentType<unknown>> {
  return lazy(() => resolveLazyModule(loader, options.name));
}
