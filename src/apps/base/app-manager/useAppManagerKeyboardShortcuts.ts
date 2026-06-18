import { useEffect, type Dispatch, type MutableRefObject } from "react";
import type { AppId } from "@/config/appRegistry";
import type { SwitcherApp } from "@/components/layout/AppSwitcher";
import { requestCloseWindow } from "@/utils/windowUtils";
import { toggleSpotlightSearch } from "@/utils/appEventBus";
import { isDesktop } from "@/utils/platform";
import { getShortcutPlatform } from "@/utils/shortcuts";
import type { useAppStore } from "@/stores/useAppStore";
import type { SwitcherAction } from "./types";

type AppStoreState = ReturnType<typeof useAppStore.getState>;

export interface AppManagerKeyboardRefs {
  instancesRef: MutableRefObject<AppStoreState["instances"]>;
  instanceOrderRef: MutableRefObject<string[]>;
  foregroundInstanceIdRef: MutableRefObject<string | null>;
  minimizeInstanceRef: MutableRefObject<(id: string) => void>;
  restoreInstanceRef: MutableRefObject<(id: string) => void>;
  bringInstanceToForegroundRef: MutableRefObject<(id: string) => void>;
  navigateToNextInstanceRef: MutableRefObject<(id: string) => void>;
  navigateToPreviousInstanceRef: MutableRefObject<(id: string) => void>;
  switcherVisibleRef: MutableRefObject<boolean>;
  switcherAppsRef: MutableRefObject<SwitcherApp[]>;
  switcherIndexRef: MutableRefObject<number>;
}

export function useAppManagerKeyboardShortcuts(
  refs: AppManagerKeyboardRefs,
  dispatchSwitcher: Dispatch<SwitcherAction>
): void {
  useEffect(() => {
    const buildMruApps = (): SwitcherApp[] => {
      const insts = refs.instancesRef.current;
      const order = refs.instanceOrderRef.current;
      const seen = new Set<string>();
      const result: SwitcherApp[] = [];
      for (let i = order.length - 1; i >= 0; i--) {
        const inst = insts[order[i]];
        if (inst?.isOpen && !seen.has(inst.appId)) {
          seen.add(inst.appId);
          result.push({
            appId: inst.appId as AppId,
            instanceId: inst.instanceId,
          });
        }
      }
      return result;
    };

    const commitSwitcher = () => {
      if (!refs.switcherVisibleRef.current) return;
      const apps = refs.switcherAppsRef.current;
      if (apps.length === 0) {
        refs.switcherVisibleRef.current = false;
        refs.switcherIndexRef.current = 0;
        refs.switcherAppsRef.current = [];
        dispatchSwitcher({ type: "reset" });
        return;
      }

      const index =
        ((refs.switcherIndexRef.current % apps.length) + apps.length) %
        apps.length;
      const selected = apps[index];
      if (selected) {
        const insts = refs.instancesRef.current;
        const order = refs.instanceOrderRef.current;
        let targetId: string | null = null;
        for (let i = order.length - 1; i >= 0; i--) {
          const inst = insts[order[i]];
          if (
            inst?.isOpen &&
            !inst.isMinimized &&
            inst.appId === selected.appId
          ) {
            targetId = inst.instanceId;
            break;
          }
        }
        if (!targetId) {
          for (let i = order.length - 1; i >= 0; i--) {
            const inst = insts[order[i]];
            if (inst?.isOpen && inst.appId === selected.appId) {
              refs.restoreInstanceRef.current(inst.instanceId);
              targetId = inst.instanceId;
              break;
            }
          }
        }
        if (targetId) {
          refs.bringInstanceToForegroundRef.current(targetId);
        }
      }
      refs.switcherVisibleRef.current = false;
      refs.switcherIndexRef.current = 0;
      refs.switcherAppsRef.current = [];
      dispatchSwitcher({ type: "reset" });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const fgId = refs.foregroundInstanceIdRef.current;

      // Desktop shell (Electron) supports the real command-modifier window
      // shortcuts (⌘W / Ctrl+W to close, ⌘M / Ctrl+M to minimize). On the web
      // these combos are reserved by the browser, so the Alt-based fallbacks
      // below are used instead.
      if (isDesktop() && !e.altKey && !e.shiftKey) {
        const isMac = getShortcutPlatform() === "mac";
        const cmdKey = isMac ? e.metaKey : e.ctrlKey;
        const strayCmd = isMac ? e.ctrlKey : e.metaKey;
        if (cmdKey && !strayCmd) {
          if (e.code === "KeyW") {
            if (fgId) {
              e.preventDefault();
              requestCloseWindow(fgId);
            }
            return;
          }
          if (e.code === "KeyM") {
            if (fgId) {
              e.preventDefault();
              refs.minimizeInstanceRef.current(fgId);
            }
            return;
          }
        }
      }

      if (!e.altKey) return;

      if (e.code === "Space") {
        e.preventDefault();
        toggleSpotlightSearch();
        return;
      }

      if (e.code === "KeyW" && !e.shiftKey) {
        if (fgId) {
          e.preventDefault();
          requestCloseWindow(fgId);
        }
        return;
      }

      if (e.code === "KeyM" && !e.shiftKey) {
        if (fgId) {
          e.preventDefault();
          refs.minimizeInstanceRef.current(fgId);
        }
        return;
      }

      if (e.code === "KeyH" && e.shiftKey) {
        e.preventDefault();
        const insts = refs.instancesRef.current;
        Object.values(insts).forEach((inst) => {
          if (inst.isOpen && !inst.isMinimized && inst.instanceId !== fgId) {
            refs.minimizeInstanceRef.current(inst.instanceId);
          }
        });
        return;
      }

      if (e.code === "KeyH" && !e.shiftKey) {
        e.preventDefault();
        const insts = refs.instancesRef.current;
        const fgInst = fgId ? insts[fgId] : null;
        if (fgInst) {
          const appId = fgInst.appId;
          Object.values(insts).forEach((inst) => {
            if (inst.isOpen && !inst.isMinimized && inst.appId === appId) {
              refs.minimizeInstanceRef.current(inst.instanceId);
            }
          });
        }
        return;
      }

      if (e.code === "Backquote" && !e.shiftKey) {
        e.preventDefault();
        if (fgId) refs.navigateToNextInstanceRef.current(fgId);
        return;
      }

      if (e.code === "Backquote" && e.shiftKey) {
        e.preventDefault();
        if (fgId) refs.navigateToPreviousInstanceRef.current(fgId);
        return;
      }

      if (e.code === "Tab") {
        e.preventDefault();
        if (!refs.switcherVisibleRef.current) {
          const mruApps = buildMruApps();
          if (mruApps.length === 0) return;
          refs.switcherAppsRef.current = mruApps;
          refs.switcherVisibleRef.current = true;
          const startIndex =
            ((e.shiftKey ? -1 : 1) + mruApps.length) % mruApps.length;
          refs.switcherIndexRef.current = startIndex;
          dispatchSwitcher({ type: "open", apps: mruApps, index: startIndex });
        } else {
          const len = refs.switcherAppsRef.current.length;
          const cur = refs.switcherIndexRef.current;
          const next = e.shiftKey ? (cur - 1 + len) % len : (cur + 1) % len;
          refs.switcherIndexRef.current = next;
          dispatchSwitcher({ type: "setIndex", value: next });
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        commitSwitcher();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);
}
