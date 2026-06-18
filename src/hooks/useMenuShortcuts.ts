import { useEffect, useRef } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { matchesShortcut, type ShortcutId } from "@/utils/shortcuts";

export type MenuShortcutHandlers = Partial<Record<ShortcutId, () => void>>;

/**
 * Bind menu-action keyboard shortcuts (e.g. ⌘S / Ctrl+S to Save) for an app
 * instance. Only the foreground instance reacts, so multiple open windows of
 * the same app don't all fire.
 *
 * Handlers should be provided for actions that are NOT already handled by the
 * global shells (undo/redo, cut/copy/paste, bold/italic/underline are native or
 * global and should only be *displayed*, not wired here, to avoid double firing).
 *
 * Browser-reserved combos (e.g. ⌘N) only fire inside the Electron desktop shell;
 * see {@link matchesShortcut}.
 */
export function useMenuShortcuts(
  instanceId: string | undefined,
  handlers: MenuShortcutHandlers
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!instanceId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Foreground gating: ignore unless this instance owns focus.
      if (useAppStore.getState().foregroundInstanceId !== instanceId) return;

      const current = handlersRef.current;
      for (const key of Object.keys(current) as ShortcutId[]) {
        const handler = current[key];
        if (!handler) continue;
        if (matchesShortcut(e, key)) {
          e.preventDefault();
          e.stopPropagation();
          handler();
          return;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [instanceId]);
}
