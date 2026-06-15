/**
 * Keyboard-shortcut audit + single source of truth.
 *
 * This module centralizes the menu accelerators shown on the right side of
 * menu items and the modifier mapping used to match keydown events. It is
 * intentionally host-platform aware (not theme aware): a shortcut label and
 * its matching combo follow the physical keyboard / runtime the user is on,
 * so the macOS Aqua theme on a Windows machine still shows/uses Ctrl.
 *
 * The "command" modifier is ⌘ on macOS and Ctrl on Windows/Linux.
 *
 * Some combos are reserved by web browsers and cannot be intercepted from a
 * web page (e.g. ⌘N opens a new window, ⌘W closes the tab). Those are flagged
 * `browserReserved` so they only fire inside the Electron desktop shell, and
 * an optional `webFallback` (an Alt/Option-based combo) is shown/handled on
 * the web instead.
 */

import { isDesktop } from "./platform";

export type ShortcutPlatform = "mac" | "other";

export interface ShortcutEnv {
  /** "mac" uses ⌘ symbols; "other" uses Ctrl/Alt/Shift text. */
  platform?: ShortcutPlatform;
  /** Whether we're running in the Electron desktop shell. */
  electron?: boolean;
}

/**
 * A modifier combo. `cmd` is the platform command modifier (⌘ on macOS, Ctrl
 * elsewhere). `alt` and `shift` are literal. `key` is matched case-insensitively
 * against `KeyboardEvent.key`.
 */
export interface Combo {
  cmd?: boolean;
  alt?: boolean;
  shift?: boolean;
  key: string;
}

interface ShortcutDef {
  /** Primary combo using the platform command modifier. */
  primary: Combo;
  /** Optional override on Windows/Linux (e.g. redo => Ctrl+Y instead of ⇧⌘Z). */
  otherPrimary?: Combo;
  /** Primary combo is reserved by the browser; only usable in the Electron shell. */
  browserReserved?: boolean;
  /** Combo shown/handled on the web when `browserReserved` is set (Alt-based). */
  webFallback?: Combo;
}

export type ShortcutId =
  | "newFile"
  | "newWindow"
  | "newFolder"
  | "open"
  | "save"
  | "saveAs"
  | "print"
  | "close"
  | "find"
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "bold"
  | "italic"
  | "underline"
  | "minimize";

export const SHORTCUTS: Record<ShortcutId, ShortcutDef> = {
  newFile: { primary: { cmd: true, key: "n" }, browserReserved: true },
  newWindow: { primary: { cmd: true, key: "n" }, browserReserved: true },
  newFolder: {
    primary: { cmd: true, shift: true, key: "n" },
    browserReserved: true,
  },
  open: { primary: { cmd: true, key: "o" } },
  save: { primary: { cmd: true, key: "s" } },
  saveAs: { primary: { cmd: true, shift: true, key: "s" } },
  print: { primary: { cmd: true, key: "p" } },
  close: {
    primary: { cmd: true, key: "w" },
    browserReserved: true,
    webFallback: { alt: true, key: "w" },
  },
  find: { primary: { cmd: true, key: "f" } },
  undo: { primary: { cmd: true, key: "z" } },
  redo: {
    primary: { cmd: true, shift: true, key: "z" },
    otherPrimary: { cmd: true, key: "y" },
  },
  cut: { primary: { cmd: true, key: "x" } },
  copy: { primary: { cmd: true, key: "c" } },
  paste: { primary: { cmd: true, key: "v" } },
  selectAll: { primary: { cmd: true, key: "a" } },
  bold: { primary: { cmd: true, key: "b" } },
  italic: { primary: { cmd: true, key: "i" } },
  underline: { primary: { cmd: true, key: "u" } },
  minimize: {
    primary: { cmd: true, key: "m" },
    browserReserved: true,
    webFallback: { alt: true, key: "m" },
  },
};

/**
 * Resolve the host platform for shortcut purposes. Prefers the Electron-reported
 * platform, then `navigator` hints. Defaults to "other" (Ctrl) when unknown.
 */
export function getShortcutPlatform(): ShortcutPlatform {
  if (typeof window !== "undefined" && window.ryosDesktop?.platform) {
    return window.ryosDesktop.platform === "darwin" ? "mac" : "other";
  }
  const nav =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & {
          userAgentData?: { platform?: string };
        })
      : undefined;
  const hint =
    nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(hint) ? "mac" : "other";
}

function resolveEnv(env?: ShortcutEnv): Required<ShortcutEnv> {
  return {
    platform: env?.platform ?? getShortcutPlatform(),
    electron: env?.electron ?? isDesktop(),
  };
}

/** The combo that is actually active in the given environment, or null. */
function activeCombo(
  def: ShortcutDef,
  { platform, electron }: Required<ShortcutEnv>
): Combo | null {
  if (def.browserReserved && !electron) {
    return def.webFallback ?? null;
  }
  if (platform === "other" && def.otherPrimary) {
    return def.otherPrimary;
  }
  return def.primary;
}

function formatKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  // Friendly labels for a few common non-letter keys.
  const map: Record<string, string> = {
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    enter: "↵",
    escape: "Esc",
    " ": "Space",
    space: "Space",
  };
  return map[key.toLowerCase()] ?? key;
}

function formatCombo(combo: Combo, platform: ShortcutPlatform): string {
  const keyLabel = formatKey(combo.key);
  if (platform === "mac") {
    // macOS convention order: ⌃ ⌥ ⇧ ⌘ then key, no separators.
    let prefix = "";
    if (combo.alt) prefix += "⌥";
    if (combo.shift) prefix += "⇧";
    if (combo.cmd) prefix += "⌘";
    return `${prefix}${keyLabel}`;
  }
  // Windows/Linux convention: "Ctrl+Alt+Shift+Key".
  const parts: string[] = [];
  if (combo.cmd) parts.push("Ctrl");
  if (combo.alt) parts.push("Alt");
  if (combo.shift) parts.push("Shift");
  parts.push(keyLabel);
  return parts.join("+");
}

/**
 * Format a shortcut for display on the right side of a menu item.
 * Returns null when the shortcut is not available in the current environment
 * (e.g. a browser-reserved combo with no web fallback while running on the web),
 * so callers can omit the label entirely.
 */
export function formatShortcut(id: ShortcutId, env?: ShortcutEnv): string | null {
  const resolved = resolveEnv(env);
  const combo = activeCombo(SHORTCUTS[id], resolved);
  if (!combo) return null;
  return formatCombo(combo, resolved.platform);
}

/** Minimal shape we need from a keydown event (keeps this testable). */
export interface KeyEventLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function comboMatches(
  e: KeyEventLike,
  combo: Combo,
  platform: ShortcutPlatform
): boolean {
  const cmdActive = platform === "mac" ? e.metaKey : e.ctrlKey;
  // The modifier that is NOT the command modifier must never be held, otherwise
  // ⌘S would also match Ctrl+⌘S etc.
  const strayCmd = platform === "mac" ? e.ctrlKey : e.metaKey;
  if (strayCmd) return false;
  if (!!combo.cmd !== cmdActive) return false;
  if (!!combo.alt !== e.altKey) return false;
  if (!!combo.shift !== e.shiftKey) return false;
  return e.key.toLowerCase() === combo.key.toLowerCase();
}

/**
 * Whether a keydown event matches the given shortcut in the current
 * environment. Browser-reserved combos only match inside Electron (or via
 * their web fallback when present).
 */
export function matchesShortcut(
  e: KeyEventLike,
  id: ShortcutId,
  env?: ShortcutEnv
): boolean {
  const resolved = resolveEnv(env);
  const combo = activeCombo(SHORTCUTS[id], resolved);
  if (!combo) return false;
  return comboMatches(e, combo, resolved.platform);
}
