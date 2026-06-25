---
name: ui-design-styling
description: Design and style ryOS UI using the current OS theme token system, Tailwind variants, shared primitives, Aqua Glass, dark mode, and accent conventions. Use when creating UI components, styling elements, working with themes, adding visual effects, or implementing retro OS aesthetics.
---

# ryOS UI Design & Styling

## Canonical References

- Implementation spec: `docs/3.3.1-theme-architecture.md`
- User-facing overview: `docs/3.3-theme-system.md`
- Token source of truth: `src/styles/themes/tokens.css`
- Theme CSS import order: `src/styles/themes.css`
- Tailwind mappings and variants: `tailwind.config.js`
- Theme metadata/state: `src/themes/`, `src/stores/useThemeStore.ts`, `src/hooks/useThemeFlags.ts`

Visual values belong in CSS `--os-*` tokens. TypeScript theme files hold metadata, platform behavior, dark-mode support flags, and wallpaper defaults; do not duplicate palettes in TS or component code.

## Supported Themes

| Theme | ID | Platform | Key traits |
|-------|----|----------|------------|
| macOS Aqua | `macosx` | `mac` / `aqua` | Glossy controls, traffic lights, dock, pinstripe or Aqua Glass, light/dark, accents |
| System 7 | `system7` | `mac` / `system7` | Black/white, square corners, Chicago-style type, dotted titlebars, accents |
| Windows XP | `xp` | `windows` | Luna blue chrome, rounded window borders, taskbar, legacy XP CSS |
| Windows 98 | `win98` | `windows` | Gray bevels, square corners, classic taskbar, legacy 98 CSS |

Default theme is `macosx`; default Aqua material is `glass`.

## Root Attributes

`useThemeStore` applies attributes to `<html>`. Prefer targeting these through tokens and Tailwind variants.

| Attribute / class | Meaning |
|-------------------|---------|
| `data-os-theme` | Exact theme id: `system7`, `macosx`, `xp`, `win98` |
| `data-os-platform` | Shared platform bucket: `mac` or `windows` |
| `data-os-mac-chrome` | Mac chrome variant: `aqua` or `system7`; absent for Windows |
| `data-os-color-scheme="dark"` | Present only when the active theme supports dark mode and dark is enabled |
| `data-os-aqua-material="glass"` | Present only for macOS Aqua Glass |
| `data-os-accent` | Present for non-default Mac chrome accents |
| `data-os-system-font` | Present for debug font overrides |
| `.dark` | Mirrors Aqua dark mode for Tailwind `dark:*` compatibility |

## CSS Layers

`src/styles/themes.css` imports theme CSS in this order:

1. `tokens.css` - defaults, per-theme token blocks, `[data-selected="true"]`, z-index scale.
2. `platform.css` - rules shared by `mac` or `windows` platform buckets.
3. `containment.css` - reduced motion and third-party/app isolation.
4. `aqua.css` - Aqua structural chrome, `.aqua-button`, brushed metal, typography.
5. `windows.css` - Windows structural landing rules.
6. `dark-aqua.css` - Aqua dark tokens and structural overrides.
7. `aqua-glass.css` - Aqua Glass overrides, imported after dark Aqua.
8. `control-panels-mac.css` / `control-panels-themed.css` - Control Panels skins.

Windows themes also load `/css/xp-custom.css` or `/css/98-custom.css` dynamically. When a rule applies to both XP and Win98, use `data-os-platform="windows"` instead of duplicated exact-theme selectors.

## Tokens and Utilities

Use token-backed Tailwind utilities first:

```tsx
className="bg-os-window-bg border-os-window rounded-os shadow-os-window"
className="font-os-ui text-os-text-primary"
className="bg-os-panel-bg border-[length:var(--os-metrics-border-width)]"
className="bg-os-input-bg border-os-input-border focus:border-os-input-focusBorder"
className="text-os-link bg-os-selection-bg text-os-selection-text"
className="h-os-titlebar h-os-menubar z-menubar"
```

Core token groups:

- Fonts: `--os-font-ui`, `--os-font-mono`
- Surfaces: `--os-color-window-bg`, `--os-color-panel-bg`, `--os-color-input-bg`
- Borders/separators: `--os-color-window-border`, `--os-color-separator`, `--os-color-input-border`
- Text: `--os-color-text-primary`, `--os-color-text-secondary`, `--os-color-text-disabled`, `--os-color-link`
- Chrome: `--os-color-menubar-*`, `--os-color-titlebar-*`, `--os-color-button-*`
- Selection/accent: `--os-color-selection-*`, `--os-color-selection-glow`, `--os-color-selection-ring-gap`
- Metrics/shadows: `--os-metrics-*`, `--os-window-shadow`
- Aqua extras: `--os-color-traffic-light-*`, `--os-pinstripe-*`, `--os-texture-*`, `--os-typography-*`
- Layering: `--z-base`, `--z-dialog`, `--z-menubar`, `--z-dropdown`, `--z-spotlight`

Shadcn HSL variables (`--background`, `--primary`, etc.) still exist for generic UI primitives. For OS chrome and app surfaces, prefer `--os-*` tokens and `bg-os-*` / `text-os-*` utilities.

## Tailwind Variants

Use root-attribute variants for small static visual differences:

```tsx
className={cn(
  "bg-os-window-bg text-os-text-primary",
  "os-windows:border-os os-mac-aqua:rounded-os",
  "os-mac-system7:rounded-none os-theme-win98:shadow-none",
  "os-dark:bg-os-window-bg os-mac-aqua-dark:text-os-text-primary"
)}
```

Available variants:

- `os-mac:`, `os-windows:`
- `os-mac-aqua:`, `os-mac-system7:`
- `os-theme-system7:`, `os-theme-macosx:`, `os-theme-xp:`, `os-theme-win98:`
- `os-dark:`, `os-mac-aqua-dark:`, `os-theme-<id>-dark:`

Prefer CSS variants and tokens over React theme branches when the DOM and behavior do not change.

## Theme State and Flags

Use `useThemeFlags()` for component decisions:

```tsx
const {
  currentTheme,
  osPlatform,
  macChrome,
  metadata,
  isWindowsTheme,
  isMacTheme,
  isMacOSTheme,
  isSystem7Theme,
  isWinXp,
  isWin98,
  isClassicTheme,
  isAquaMenuChrome,
  isMacAquaChrome,
  supportsDarkMode,
  isDarkMode,
  darkModePreference,
  supportsAccent,
  accent,
  aquaMaterial,
  isAquaGlass,
} = useThemeFlags();
```

Use React branches only when structure, behavior, assets, layout math, or app logic differs. For non-React code, use `useThemeStore.getState()` or helpers from `@/themes` such as `getOsPlatform`, `getOsMacChrome`, `isWindowsTheme`, `isMacTheme`, `isThemeWinXp`, and `isThemeWin98`.

## Shared Surface Primitives

Prefer shared primitives before adding new four-way class branches:

```tsx
import {
  osCardClassName,
  osDrawerSurfaceClassName,
  osToolbarSurfaceClassName,
  osAppSidebarSurfaceClassName,
  osSeparatorBorderClassName,
  osSubtleIconButtonClassName,
  windowsBevelClassName,
} from "@/components/shared/osThemePrimitives";
```

Pass `isAquaGlass` when a primitive supports it. Use `windowsBevelClassName("raised" | "sunken")` instead of hand-writing Win98 bevel borders.

## Component Patterns

### Button

```tsx
import { Button } from "@/components/ui/button";

<Button variant="default">Standard</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="retro">Retro</Button>
<Button variant="aqua">Aqua</Button>
```

`Button` maps variants to `.aqua-button` on macOS Aqua and legacy `.button` on Windows.

### Aqua CSS Buttons

```tsx
<button className="aqua-button">Default</button>
<button className="aqua-button primary">Primary</button>
<button className="aqua-button secondary">Secondary</button>
<button className="aqua-button orange">Orange</button>
```

### Tokenized Panel

```tsx
<div
  className={cn(
    "rounded-os bg-os-window-bg text-os-text-primary shadow-os-window",
    "border-[length:var(--os-metrics-border-width)] border-os-window",
    "os-theme-win98:shadow-none"
  )}
>
```

### Selected Rows

Use the built-in selection utility when possible:

```tsx
<div data-selected={isSelected ? "true" : undefined}>Song</div>
```

## Aqua Glass, Dark Mode, and Accents

- Aqua Glass is the default material for `macosx`; it is driven by `data-os-aqua-material="glass"` and `src/styles/themes/aqua-glass.css`.
- Do not build ad hoc glass with generic `bg-white/80 backdrop-blur-*` unless the surface is intentionally outside the OS material system.
- Only `macosx` currently supports dark mode. Use `--os-*` tokens, `os-dark:`, or `os-mac-aqua-dark:`; branch on `isDarkMode` only for behavioral or structural differences.
- Mac chromes (`macosx`, `system7`) support accents. The default accent is `wallpaper`; `default` means "System" and clears inline overrides so stylesheet tokens win.
- Accent-aware UI should read `--os-color-selection-*`, `--os-color-link`, focus-ring tokens, or Tailwind `bg-os-selection-bg` / `text-os-link`.

## Window Materials

`WindowFrame` supports per-window materials:

| Material | Use case |
|----------|----------|
| `default` | Standard opaque windows |
| `transparent` | Semi-transparent app windows such as media surfaces |
| `notitlebar` | Immersive windows with floating or hover chrome |
| `brushedmetal` | Classic Mac brushed-metal apps |

Global Aqua Glass is separate from `WindowFrame` material. Regular Aqua windows receive glass classes when the global material is `glass`; brushed-metal windows keep brushed-metal semantics and are adjusted by CSS.

## Typography

- Use `font-os-ui` and `font-os-mono`; avoid theme-specific font utility names.
- `WindowFrame` content has `.window-body`, which consumes `--os-typography-window`.
- For shell or portaled copy outside a `WindowFrame`, use `OS_SHELL_TEXT_SCALE_CLASS` from `@/lib/themeChrome`.
- For custom native chrome that must avoid Aqua global typography selectors, put `OS_NATIVE_CHROME_SKIP_CLASS` on an ancestor.
- Use the `prose-textedit` typography variant for TextEdit-like rich content so Aqua dark mode stays readable.

## Anti-Patterns

- Do not copy hex values from old examples; add or consume `--os-*` tokens.
- Do not make `currentTheme === "xp" || currentTheme === "win98"` branches for shared Windows styling; use platform attributes, variants, or helpers.
- Do not use React branches for static colors, borders, radii, shadows, or text colors.
- Do not create one-off glassmorphism when Aqua Glass tokens and CSS apply.
- Do not add new theme-specific components before checking `src/components/shared/osThemePrimitives.ts` and existing app patterns.

## Checklist

1. Search for an existing primitive or app pattern before styling from scratch.
2. Use `cn()` for conditional class merging.
3. Prefer `--os-*` tokens, token-backed Tailwind utilities, and `os-*:` variants.
4. Use `useThemeFlags()` or `@/themes` helpers only when structure or behavior changes.
5. Consider Aqua Glass, Aqua dark mode, accents, inactive-window selection, and Windows legacy CSS.
6. Test styled components across all four themes; include Aqua Glass and Aqua dark mode when touching `macosx` surfaces.