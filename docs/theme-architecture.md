# Theme architecture (implementation)

This document describes how ryOS applies the four OS themes today and how to extend them without adding brittle, duplicated selectors.

## Flow

1. **`useThemeStore`** persists `current` (`system7` | `macosx` | `xp` | `win98`) and calls **`applyRootThemeAttributes`** so `<html>` has:
   - `data-os-theme` — exact theme id (drives token blocks and Tailwind `os-theme-*` variants).
   - `data-os-platform` — `mac` or `windows` (drives shared Luna + Classic rules and Tailwind `os-mac` / `os-windows` variants).
2. **`src/styles/themes.css`** defines CSS variables (`--os-*`) under `:root[data-os-theme="…"]`, plus structural rules (Aqua, brushed metal, innocuous third-party resets).
3. **Legacy Windows** (`public/css/xp-custom.css`, `98-custom.css`) is loaded only for `xp` / `win98` by `ensureLegacyCss` in the theme store.
4. **TypeScript** definitions in `src/themes/*.ts` hold canonical metadata (`ThemeMetadata`); use **`getThemeMetadata`**, **`isWindowsTheme`**, **`isMacTheme`**, **`getOsPlatform`**, or the **`useThemeFlags()`** hook instead of ad hoc `current === "xp"` chains in new code.

## CSS layers (order of precedence / mental model)

| Layer | Selector pattern | Purpose |
|-------|------------------|---------|
| **Tokens** | `:root[data-os-theme="…"] { --os-*: … }` | Per-theme palette, fonts, radii, shadows. Single source of truth for Tailwind `bg-os-*`, `border-os-*`, etc. |
| **Family** | `:root[data-os-platform="mac"\|"windows"]` | Rules that are **identical** for all themes on that platform (e.g. Windows menu font forcing, Webamp range resets, Spotlight button resets). |
| **Structure** | Class + theme (e.g. `.window-material-brushedmetal`, `.aqua-button`) | Chrome that does not fit a single variable. |
| **Containment** | `#webamp`, app-specific escape hatches | Isolate third-party or special UIs from global form styling. |

When you need the same declaration for **XP and Win98**, add it under **`data-os-platform="windows"`** (or extend tokens if it is truly per-theme). Avoid new paired `:root[data-os-theme="xp"], :root[data-os-theme="win98"]` lists.

## Menu typography tokens

Radix menubar / dropdown items use:

- `--os-font-ui` — always from the active theme token block.
- `--os-menu-item-font-size` — `11px` on Windows family, `13px` on `macosx`, `inherit` elsewhere.
- `--os-menu-subtrigger-font-size` — `11px` on Windows, `12px` on `macosx`.

Defined in `themes.css` (defaults, `[data-os-platform="windows"]`, and `:root[data-os-theme="macosx"]`).

## Tailwind variants

`tailwind.config.js` registers:

- `os-mac:` → `:root[data-os-platform="mac"] &`
- `os-windows:` → `:root[data-os-platform="windows"] &`
- `os-theme-system7:`, `os-theme-macosx:`, `os-theme-xp:`, `os-theme-win98:` → exact theme

Use these for small, theme-scoped utilities instead of growing `cn(...)` theme branches.

## HTML defaults

`index.html` sets `data-os-theme` and `data-os-platform` on `<html>` so the first paint matches the store default before hydration.

## Migration notes

- Prefer **`useThemeFlags()`** (`isWindowsTheme`, `isMacOSTheme`, `isAquaMenuChrome`, …) over duplicating OR-of-theme-id checks in components.
- **`isAquaMenuChrome`** means “Mac OS X Aqua menus” only; System 7 uses classic metrics shared with Windows for some menu padding patterns.
- User-facing overview remains in [Theme System](./3.3-theme-system.md); this file is for implementers.
