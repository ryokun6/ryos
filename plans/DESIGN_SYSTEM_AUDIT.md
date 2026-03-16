# ryOS Design System & Frontend Architecture Audit

## Executive Summary

This audit systematically inspects the ryOS codebase to identify concrete opportunities to extract, standardize, and harden reusable UI components, tokens, theming infrastructure, and interaction patterns. The findings below are organized by category and reference specific files, components, and patterns.

The codebase has a strong foundation: a Zustand-based theme store, `--os-*` CSS variables, OS-aware Tailwind utilities, and Radix-based shared primitives. However, significant inconsistencies and duplication have accumulated as the app count has grown. The primary areas of concern are:

1. **Token gaps** — input/control focus colors, panel backgrounds, gradients, and borders bypass the token system
2. **Component duplication** — sidebar panels, selection list items, search inputs, toolbars, and loading/empty states are reimplemented per-app
3. **Inline style proliferation** — 500+ `style={{}}` usages in TSX files, many encoding theme-specific values
4. **Specificity conflicts** — 574 `!important` declarations across CSS files, driven by XP/98 global styles colliding with component styles
5. **Missing abstractions** — no z-index scale, no motion tokens, no `prefers-reduced-motion` support, no shared spacing/type scale

---

## 1. Token Architecture

### 1.1 Current Token Inventory

**Defined in `src/styles/themes.css` (`:root` and `[data-os-theme]` selectors), consumed via `tailwind.config.js` extensions:**

| Category | Tokens | Coverage |
|----------|--------|----------|
| Fonts | `--os-font-ui`, `--os-font-mono` | Good |
| Window | `--os-color-window-bg`, `--os-color-window-border` | Good |
| Menubar | `--os-color-menubar-bg`, `--os-color-menubar-border`, `--os-color-menubar-text` | Good |
| Titlebar | `--os-color-titlebar-active-bg`, `--os-color-titlebar-inactive-bg`, `--os-color-titlebar-text`, `--os-color-titlebar-text-inactive` | Good |
| Button | `--os-color-button-face`, `--os-color-button-highlight`, `--os-color-button-shadow`, `--os-color-button-active-face` | Good |
| Selection | `--os-color-selection-bg`, `--os-color-selection-text`, `--os-color-selection-text-shadow` | Good |
| Text | `--os-color-text-primary`, `--os-color-text-secondary`, `--os-color-text-disabled` | Good |
| Metrics | `--os-metrics-border-width`, `--os-metrics-radius`, `--os-metrics-titlebar-height`, `--os-metrics-menubar-height` | Good |
| Shadow | `--os-window-shadow` | Good |

### 1.2 Missing Tokens (Concrete Gaps)

These values are used across multiple components but bypass the token system:

| Missing Token | Current Hardcoded Values | Used In |
|---------------|--------------------------|---------|
| `--os-color-input-bg` | `#ffffff`, `rgba(255,255,255,1)` | `input.tsx`, `select.tsx`, app search inputs |
| `--os-color-input-border` | `rgba(0,0,0,0.2)`, `#000000`, `#ACA899` | `input.tsx`, `CalendarAppComponent.tsx`, `ContactsAppComponent.tsx` |
| `--os-color-input-focus-ring` | `rgba(52,106,227,0.25)`, `rgba(52,106,227,0.6)` | `input.tsx`, `select.tsx` |
| `--os-color-panel-bg` | `#E3E3E3`, `#ECE9D8`, `#C0C0C0` | `dialog.tsx` (System 7), `tabStyles.ts`, `ControlPanelsAppComponent.tsx` |
| `--os-color-panel-border` | `#808080`, `rgba(0,0,0,0.1)`, `#ACA899` | `tabStyles.ts`, `CalendarAppComponent.tsx`, `FinderAppComponent.tsx` |
| `--os-color-panel-header-gradient` | `linear-gradient(to bottom, #e6e5e5, #aeadad)`, `linear-gradient(to bottom, #dcdcdc, #b8b8b8)` | `CalendarAppComponent.tsx`, `ContactsAppComponent.tsx`, `AirDropView.tsx`, `ControlPanelsAppComponent.tsx` |
| `--os-color-toolbar-gradient` | Same as panel-header | `FinderAppComponent.tsx`, `VideosAppComponent.tsx` |
| `--os-color-sidebar-border` | `rgba(0,0,0,0.55)`, `1px solid rgba(0,0,0,0.1)` | `FinderAppComponent.tsx`, `ContactsAppComponent.tsx`, `CalendarAppComponent.tsx` |
| `--os-color-sidebar-inset-shadow` | `inset 0 1px 2px rgba(0,0,0,0.25)` | `FinderAppComponent.tsx`, `ContactsAppComponent.tsx` |
| `--os-color-switch-track` | `#111827`, `#9ca3af` | `switch.tsx` |
| `--os-color-switch-thumb` | hardcoded in `switch.tsx` | `switch.tsx` |
| `--os-metrics-control-height` | `h-9`, `h-6`, `22px`, `24px` | `input.tsx`, `select.tsx`, `button.tsx` |
| `--os-metrics-control-radius` | `6px`, `0`, `rounded-md` | `select.tsx`, `input.tsx` |
| `--os-color-separator` | `rgba(0,0,0,0.2)`, `#808080` | `tabStyles.ts`, `CalendarAppComponent.tsx` |

### 1.3 Hardcoded Theme Values in Components

**`src/components/ui/input.tsx`** — macOS focus ring uses `rgba(52,106,227,0.6)` and `rgba(52,106,227,0.25)` directly in JS event handlers instead of CSS variables. System 7 border color `#000000` is also hardcoded inline.

**`src/components/ui/select.tsx`** — 30+ lines of inline `style={{}}` for macOS Aqua styling, including gradients (`linear-gradient(rgba(160,160,160,0.625),...)`), box-shadows, font-family strings, and font sizes. None consumed from tokens.

**`src/components/ui/button.tsx`** — `aqua_select` variant has 50+ lines of inline styles for gradients, shadows, and state logic. The `ghost` variant uses `!important` chains (`!border-none !bg-transparent !shadow-none !box-shadow-none !background-none`) to fight XP/98 global styles.

**`src/components/ui/dialog.tsx`** — System 7 body uses hardcoded `backgroundColor: "#E3E3E3"` instead of a token. macOS header border uses JS theme object lookup with fallback to `rgba(0,0,0,0.1)`.

**`src/utils/tabStyles.ts`** — System 7 tab styles use `#E3E3E3`, `#D4D4D4`, `#808080` directly.

### 1.4 Recommendations

1. **Add semantic tokens** for the missing categories above to `themes.css`, then add corresponding Tailwind extensions in `tailwind.config.js`.
2. **Extract macOS Aqua control styles** from inline JS in `input.tsx`, `select.tsx`, and `button.tsx` into CSS classes in `themes.css`, consuming `--os-*` variables.
3. **Replace the `system7` backwards-compat block** in `tailwind.config.js` (lines 103–111) with `--os-*` equivalents — it's currently duplicating token values as hardcoded hex.
4. **Create a `--os-color-panel-bg` token** to replace the 6+ places that hardcode `#E3E3E3` / `#ECE9D8` / `#C0C0C0` for panel backgrounds.

---

## 2. Duplicated Components & Near-Duplicates

### 2.1 Sidebar Panel

**The pattern**: A scrollable sidebar panel with optional border, inset shadow, and white/transparent background.

**Duplicated in**:
- `src/apps/finder/components/FinderAppComponent.tsx` — `FinderPanel` (lines 44–73) with `border: 1px solid rgba(0,0,0,0.55)`, `boxShadow: inset 0 1px 2px rgba(0,0,0,0.25)`
- `src/apps/contacts/components/ContactsAppComponent.tsx` — inline `Panel` component (lines ~146–175) with identical border/shadow pattern
- `src/apps/calendar/components/CalendarAppComponent.tsx` — sidebar using `calendar-sidebar` class
- `src/apps/chats/components/ChatRoomSidebar.tsx` — sidebar with selection styling
- `src/apps/admin/components/AdminSidebar.tsx` — sidebar with section links

**Extraction**: Create `<AppSidebarPanel bordered? className?>` in `src/components/layout/` that encapsulates the bordered/inset-shadow/scrollable pattern and consumes `--os-color-sidebar-border` and `--os-color-sidebar-inset-shadow` tokens.

### 2.2 Selectable List Item

**The pattern**: A list item that applies selection colors from OS tokens when selected.

**Duplicated in** (all using inline `style={{}}` with `var(--os-color-selection-bg)`):
- `src/apps/chats/components/ChatRoomSidebar.tsx` (lines ~86–91)
- `src/apps/admin/components/AdminSidebar.tsx` (lines ~83–89)
- `src/apps/soundboard/components/BoardList.tsx` (lines ~80–82)
- `src/apps/contacts/components/ContactsAppComponent.tsx` (multiple locations)
- `src/apps/finder/components/FinderAppComponent.tsx` (lines ~94–99)
- `src/apps/finder/components/FileList.tsx`
- `src/apps/finder/components/FileIcon.tsx`
- `src/components/layout/SpotlightSearch.tsx`
- `src/components/dialogs/LyricsSearchDialog.tsx`
- `src/components/dialogs/SongSearchDialog.tsx`
- `src/components/listen/JoinSessionDialog.tsx`
- `src/apps/control-panels/components/WallpaperPicker.tsx`

**Extraction**: Create `<SelectableListItem isSelected onClick leading? trailing? className?>` that applies `bg-os-selection-bg text-os-selection-text` via Tailwind classes with `data-[selected=true]` attribute.

### 2.3 Search Input

**The pattern**: Input with magnifying glass icon, clear button, and theme-aware styling.

**Duplicated in**:
- `src/apps/finder/components/FinderAppComponent.tsx` (lines ~376–405) — `MagnifyingGlass` icon, `searchQuery`, `XCircle` clear
- `src/apps/calendar/components/CalendarAppComponent.tsx` (lines ~943–977) — same pattern with `showSearch` toggle
- `src/apps/contacts/components/ContactsAppComponent.tsx` — search query filtering

**Extraction**: Create `<SearchInput value onChange placeholder onClear? className?>` in `src/components/ui/` with built-in icon and clear affordance.

### 2.4 Panel Header with Gradient

**The pattern**: A toolbar/header strip with gradient background.

**Duplicated in** (all using `linear-gradient(to bottom, #e6e5e5, #aeadad)` or `#dcdcdc, #b8b8b8`):
- `src/apps/calendar/components/CalendarAppComponent.tsx`
- `src/apps/contacts/components/ContactsAppComponent.tsx`
- `src/apps/finder/components/AirDropView.tsx`
- `src/apps/control-panels/components/ControlPanelsAppComponent.tsx`

**Extraction**: Define `--os-color-panel-header-gradient` per theme in `themes.css`, then create a `<PanelHeader>` component.

### 2.5 Metal Inset Toolbar Buttons

**The pattern**: `metal-inset-btn`, `metal-inset-btn-group`, `metal-inset-icon` CSS classes for macOS toolbar buttons.

**Used in** (but defined only in `themes.css`, no component abstraction):
- `src/apps/finder/components/FinderAppComponent.tsx`
- `src/apps/calendar/components/CalendarAppComponent.tsx`
- `src/apps/synth/components/SynthAppComponent.tsx`
- `src/apps/contacts/components/ContactsAppComponent.tsx`
- `src/apps/videos/components/VideosAppComponent.tsx`

**Extraction**: Create `<ToolbarButton icon? className?>` and `<ToolbarButtonGroup>` in `src/components/ui/` that handles the `.metal-inset-btn` class application automatically on macOS and degrades gracefully for other themes.

### 2.6 Empty States

**The pattern**: Centered message when content is unavailable.

**Duplicated across**: Admin (3 variants), Contacts, Calendar, Finder — each with ad-hoc styling.

**Extraction**: `<EmptyState icon? title description? action?>` in `src/components/ui/`.

### 2.7 Loading States

**The pattern**: Loading spinner, text, or overlay.

**Duplicated across**: Finder, PC, InfiniteMac, iPod LyricsDisplay, Internet Explorer, Soundboard — each with different implementations.

Note: `src/components/ui/activity-indicator.tsx` exists but is only used in a few places. Broader adoption is needed.

---

## 3. CSS Architecture Issues

### 3.1 `!important` Usage

| File | Count | Primary Cause |
|------|-------|---------------|
| `src/styles/themes.css` | 383 | Fighting XP/98 global styles, Webamp overrides, font-size resets |
| `src/index.css` | 164 | Terminal input resets, piano key overrides, touch handling |
| `public/css/xp-custom.css` | 24 | Switch toggle overrides |
| `public/css/98-custom.css` | 3 | Minor overrides |
| **Total** | **574** | |

**Root cause**: XP/98 themes load global stylesheets (`xp-custom.css`, `98-custom.css`) that style bare HTML elements (`button`, `input`, `select`). Every component that needs non-Windows styling must fight these globals with `!important` or higher specificity.

**Example — `button.tsx` ghost variant** (lines 200–215):
```tsx
"!border-none !bg-transparent !shadow-none !box-shadow-none !background-none",
"[background:transparent!important] [box-shadow:none!important] [border:none!important]",
```
This is applied for both XP/98 AND macOS ghost buttons.

**Recommendation**: Scope XP/98 CSS to `[data-os-theme="xp"]` and `[data-os-theme="win98"]` selectors and avoid styling bare elements. Use `:where()` to reduce specificity where possible. This would eliminate most `!important` usage.

### 3.2 Deeply Nested Selectors in `themes.css`

The themes.css file contains highly fragile selectors that depend on specific markup structure:

```css
:root[data-os-theme="macosx"] button:not(.aqua-button):not(.aqua-tab):not(.app-menu-trigger):
  where(:not(.dashboard-overlay *):not(.calendar-grid *):not(.calendar-sidebar *):not(.ipod-force-font *):not(.karaoke-force-font *):not(.admin-force-font *))
```

This selector chain is:
- **Fragile**: Adding a new app that needs font overrides requires updating this selector
- **Opaque**: Hard to debug why a button's font is or isn't being overridden
- **Growing**: The `:not()` list grows with each new exception

**Recommendation**: Replace element-level font overrides with explicit `font-os-ui` utility class applied at the component level. Let components opt into theme fonts rather than globally forcing them.

### 3.3 Inline Style Proliferation

**500+ `style={{}}` usages** across TSX files. Heaviest users:

| File | Count | Primary Use |
|------|-------|-------------|
| `CalendarAppComponent.tsx` | 46+ | Theme-conditional borders, colors, gradients |
| `InternetExplorerMenuBar.tsx` | 69+ | Complex toolbar with many theme variants |
| `DictionaryWidget.tsx` | 41+ | Widget layout |
| `TranslationWidget.tsx` | 39+ | Widget layout |
| `StocksWidget.tsx` | 35+ | Chart and data layout |
| `IpodWidget.tsx` | 32+ | Widget layout |
| `CoverFlow.tsx` | 21+ | 3D transforms and dynamic layout |

Many inline styles encode theme-specific values that should be CSS variables or Tailwind utilities.

### 3.4 Mixed Styling Approaches

The codebase uses four styling approaches simultaneously:
1. **Tailwind utilities** — primary approach for most components
2. **Global CSS** (`themes.css`, `index.css`) — theme definitions and overrides
3. **Runtime-loaded CSS** (`xp-custom.css`, `98-custom.css`) — Windows theme styles
4. **Inline styles** — theme-conditional values, dynamic layout, state-driven gradients

This creates unpredictable specificity interactions and makes it hard to know which approach will "win" for a given property.

---

## 4. Theme Switching & Robustness

### 4.1 Theme Application Architecture

```
useThemeStore.setTheme(id)
  → localStorage.setItem("ryos:theme", theme)
  → document.documentElement.dataset.osTheme = theme
  → ensureLegacyCss(theme)  // loads/removes xp-custom.css or 98-custom.css
```

**Risk**: `ensureLegacyCss` replaces a `<link>` element in the DOM. If the new stylesheet loads asynchronously, there's a flash where XP/98 styles are absent but `[data-os-theme]` already matches — components briefly render with token values but without Windows chrome styles.

### 4.2 Scattered Theme Checks

Theme identity checks (`currentTheme === "xp" || currentTheme === "win98"`) are scattered across **100+ components** despite `isWindowsTheme()` and `isMacTheme()` helpers existing in `src/themes/index.ts`.

**Files still using raw string comparisons** (sampled):
- `button.tsx`, `dialog.tsx`, `select.tsx`, `input.tsx`, `switch.tsx` — all shared primitives
- `ThemedTabs.tsx`, `tabStyles.ts` — shared utilities
- Most app components

**Recommendation**: Replace all `currentTheme === "xp" || currentTheme === "win98"` with `isWindowsTheme(currentTheme)` and add ESLint rule to prevent raw theme string comparisons.

### 4.3 JS Theme Objects vs CSS Variables Drift

Theme definitions exist in two places:
1. **JS objects** in `src/themes/*.ts` (e.g., `macosx.ts` has `colors.selection.bg: "#3067da"`)
2. **CSS variables** in `src/styles/themes.css` (e.g., `--os-color-selection-bg: #3875D7`)

**These values don't match!** For macOS:
- JS: `selection.bg = "#3067da"`
- CSS: `--os-color-selection-bg = #3875D7`

This creates subtle visual inconsistencies depending on whether a component reads from the JS object or the CSS variable.

**Recommendation**: Make JS theme objects the single source of truth and generate CSS variables from them at build time, or remove JS color values entirely and always read from CSS.

### 4.4 Theme-Specific Class Escape Hatches

Several app components use "force font" classes to escape theme-level font overrides:
- `.ipod-force-font` (iPod, Videos)
- `.karaoke-force-font` (Karaoke)
- `.admin-force-font` (Admin)
- `.calendar-grid` / `.calendar-sidebar` (Calendar)
- `.dashboard-overlay` (Dashboard)

Each of these requires a corresponding `:not()` exception in `themes.css` selectors. This is a growing maintenance burden.

---

## 5. Z-Index & Layering

### 5.1 Current Z-Index Map (No Defined Scale)

| Layer | Z-Index | Source |
|-------|---------|--------|
| Desktop/base | 0 | `themes.css` pseudo-elements |
| App windows | 1–N | `AppManager.tsx` (`BASE_Z_INDEX=1` + stack order) |
| Stickies (foreground) | 40–(40+N) | `StickiesAppComponent.tsx` |
| Dialogs | 50 | `dialog.tsx`, `tooltip.tsx` |
| Screen savers | 9999 | `ScreenSaverOverlay.tsx`, `index.css` |
| Full-screen portals | 9999 | `FullScreenPortal.tsx`, `VideoFullScreenPortal.tsx` |
| Expose backdrop | 9998 | `ExposeView.tsx` |
| MenuBar (expose) | 9997 | `MenuBar.tsx` |
| Time Machine | 10000 | `TimeMachineView.tsx` |
| Expose overlay | 10001 | `ExposeView.tsx` |
| Full-screen swipe | 10001 | `FullScreenPortal.tsx`, `VideoFullScreenPortal.tsx` |
| MenuBar (normal) | 10002 | `MenuBar.tsx` |
| Dropdown/Menu content | 10003 | `dropdown-menu.tsx`, `menubar.tsx` |
| Submenu content | 10004 | `dropdown-menu.tsx`, `menubar.tsx` |
| Spotlight | 10003–10004 | `SpotlightSearch.tsx` |

### 5.2 Issues

1. **No shared scale** — z-index values are hardcoded in individual components with no central definition
2. **Overlapping ranges** — Stickies (40) can overlap with dialogs (50); screen savers (9999) and full-screen portals (9999) share the same value
3. **Invalid Tailwind values** — `z-15`, `z-25`, `z-30` used in iPod and Emoji components are not standard Tailwind utilities and may not generate CSS unless extended in config
4. **Spotlight vs menus** — Both Spotlight and dropdown menus use `z-[10003]` / `z-[10004]`, creating potential layering conflicts

### 5.3 Recommendations

Define a z-index scale as CSS variables and Tailwind extensions:
```css
--z-windows: 1;
--z-stickies: 100;
--z-dialogs: 200;
--z-screensaver: 500;
--z-fullscreen: 600;
--z-expose: 700;
--z-menubar: 800;
--z-menus: 900;
--z-spotlight: 950;
--z-submenu: 1000;
```

---

## 6. Typography

### 6.1 No Type Scale

Font sizes are ad hoc: `9px`, `10px`, `11px`, `12px`, `13px`, `14px`, `16px`, `18px`, `20px` appear throughout the codebase with no scale or naming convention.

Theme CSS uses `!important` on font-size for macOS (`12px !important`) and applies it globally to buttons, inputs, selects, textareas, labels, paragraphs, and divs.

### 6.2 Font Application Is Fragile

The base body font is Chicago (System 7 font). Theme switching changes `--os-font-ui`, but `themes.css` also applies `font-family` and `font-size` to bare elements with `!important`. This creates issues:
- Components that need a different font size must use `!important` to override
- The `.ipod-force-font`, `.karaoke-force-font`, etc. escape hatches grow with each new exception

### 6.3 Recommendations

1. **Define a type scale** with semantic names: `--os-text-xs`, `--os-text-sm`, `--os-text-base`, `--os-text-lg` that map to theme-appropriate sizes
2. **Stop applying font-size globally** to bare elements. Instead, let `font-os-ui` Tailwind utility set both font-family and font-size, and apply it explicitly at component boundaries
3. **Remove force-font escape hatches** once global font overrides are removed

---

## 7. Layout Primitives

### 7.1 Missing Primitives

| Primitive | Current State | Apps That Need It |
|-----------|---------------|-------------------|
| `<SidebarLayout sidebar main>` | Each app implements its own flex split | Finder, Calendar, Contacts, Chats, Admin |
| `<AppSidebarPanel>` | `FinderPanel` and `Panel` in Contacts, both with same border/shadow | Finder, Contacts, Calendar, Chats |
| `<PanelHeader>` | Repeated gradient + padding pattern | Calendar, Contacts, Finder, Control Panels |
| `<StatusBar>` | Footer with item count / status text | Finder, Minesweeper, Paint |
| `<Toolbar>` / `<ToolbarGroup>` | metal-inset-btn used ad hoc | Finder, Calendar, Synth, Contacts, Videos |
| `<EmptyState>` | Different implementations per app | Admin, Contacts, Calendar, Finder |
| `<LoadingOverlay>` | Different implementations per app | PC, InfiniteMac, iPod, Finder, IE |
| `<SearchInput>` | Repeated MagnifyingGlass + XCircle pattern | Finder, Calendar, Contacts |

### 7.2 `calendar-sidebar` Class Reuse

The `calendar-sidebar` CSS class (defined in `themes.css`) is used by Finder and Contacts as well as Calendar. This naming is misleading — it should be `os-sidebar` or similar.

---

## 8. Interaction Patterns

### 8.1 Selection Styling — 12+ Duplicate Implementations

Every component that supports item selection re-implements the same inline style:
```tsx
style={isSelected ? {
  background: "var(--os-color-selection-bg)",
  color: "var(--os-color-selection-text)",
  textShadow: "var(--os-color-selection-text-shadow)",
} : undefined}
```

This should be a Tailwind utility or data-attribute-driven class:
```css
[data-selected="true"] {
  background: var(--os-color-selection-bg);
  color: var(--os-color-selection-text);
  text-shadow: var(--os-color-selection-text-shadow);
}
```

### 8.2 Keyboard Shortcuts — No Registry

Each app wires its own `keydown` handlers directly. No shared `useKeyboardShortcuts` hook or shortcut registry. Found in: `AppManager.tsx`, `ChatInput.tsx`, `AppStoreFeed.tsx`, `TextEdit SlashCommands`, `VideoFullScreenPortal.tsx`, `DashboardAppComponent.tsx`, `PaintCanvas.tsx`, `SoundboardMenuBar.tsx`, `KaraokeLogic.ts`, `WallpaperPicker.tsx`.

### 8.3 Scroll Container Pattern

`overflow-y-auto min-h-0` with optional `-webkit-overflow-scrolling: touch` is repeated in: `BoardList.tsx`, `ChatRoomSidebar.tsx`, `AdminSidebar.tsx`, `CalendarAppComponent.tsx`, `ChatsAppComponent.tsx`, `FinderAppComponent.tsx`.

### 8.4 Resize Observer Pattern

`ResizeObserver` usage is duplicated in: `PaintCanvas.tsx`, `Waveform3D.tsx`, `SynthAppComponent.tsx`, `useChatsFrameLayout.ts`, `useIpodLogic.ts`, `TimeMachineView.tsx`, `useControlPanelsLogic.ts`. A shared `useResizeObserver` hook would reduce boilerplate.

---

## 9. Accessibility

### 9.1 No `prefers-reduced-motion` Support

Zero usage of `prefers-reduced-motion` in the entire codebase. All CSS transitions, Framer Motion animations, `requestAnimationFrame` loops, and `tailwindcss-animate` effects run regardless of user preference.

**Recommendation**: Add `@media (prefers-reduced-motion: reduce)` rules to disable/reduce animations. Framer Motion supports `useReducedMotion()`.

### 9.2 Focus Management

- Shared primitives (`button.tsx`, `input.tsx`, `checkbox.tsx`) correctly use `focus-visible:` for keyboard focus
- But `MenubarTrigger` components use `focus-visible:ring-0` to remove focus rings entirely
- Some buttons use `focus:` instead of `focus-visible:`, causing focus rings on mouse click
- `focus:outline-none` appears frequently without a visible alternative

### 9.3 Missing ARIA Labels

- Many Phosphor icon buttons lack `aria-label` on the wrapping `<button>`
- `ThemedIcon` has `alt={alt || name}` fallback, but callers sometimes omit `alt`
- Some `role="button"` divs lack `aria-label` or `aria-pressed`

### 9.4 Color Contrast

Theme implementations prioritize visual nostalgia over contrast:
- System 7: Black text on white is fine, but inactive title bar uses `#666666` on `#FFFFFF` (may fail AA for small text)
- Win98: `--os-color-text-disabled: #7f7f7f` on `#C0C0C0` background = 2.5:1 contrast ratio (fails AA)
- macOS: `--os-color-text-secondary: #999999` on `#ECECEC` = poor contrast

### 9.5 ESLint a11y Configuration

`jsx-a11y/no-noninteractive-tabindex` is disabled in `eslint.config.js`, meaning non-interactive elements with `tabIndex` won't trigger warnings.

---

## 10. Motion & Animation

### 10.1 No Motion Token System

Animation durations and easings are ad hoc:
- Framer Motion: `duration: 0.2`, `0.3`, `0.15`, `ease: [0.33, 1, 0.68, 1]`
- Tailwind: `duration-200`, `duration-150`
- CSS: `transition: background 0.1s`, `transition: filter 0.2s ease`
- `tailwind.config.js` keyframes: `accordion-down 0.2s ease-out`, `shake 0.4s ease-in-out`

### 10.2 Recommendations

1. Define motion tokens: `--motion-duration-fast: 100ms`, `--motion-duration-normal: 200ms`, `--motion-duration-slow: 400ms`
2. Define easing tokens: `--motion-ease-default`, `--motion-ease-bounce`
3. Add `@media (prefers-reduced-motion: reduce)` to all animation definitions

---

## 11. Form Controls Inconsistency

### 11.1 Height Inconsistency

| Control | Default Height | macOS Height | XP/98 Height |
|---------|---------------|--------------|--------------|
| Button | `h-9` (36px) | varies by variant | XP.css controlled |
| Input | `h-9` (36px) | not explicitly set | not explicitly set |
| Select Trigger | `h-9` / `24px` (macOS) | `24px` inline | XP.css controlled |
| `aqua_select` Button | `h-[22px]` | `22px` inline | XP.css controlled |

### 11.2 Border Radius Inconsistency

- `Input`: `rounded-md` (Tailwind), `borderRadius: "0"` (System 7), `borderRadius: "6px"` (macOS Select)
- `Select`: `rounded` (macOS), `rounded-md` (default)
- `Button`: `rounded-md` (default), none (XP/98)

### 11.3 Recommendation

Define `--os-metrics-control-height` and `--os-metrics-control-radius` tokens per theme to ensure all form controls share consistent dimensions.

---

## 12. Specific Component Issues

### 12.1 `button.tsx` — Theme Branching Explosion

The `Button` component has **8 separate return paths** based on theme × variant combinations (lines 68–241). Each path has different prop spreading, event handling, and style application. This makes the component hard to maintain and test.

**Recommendation**: Refactor to a single render path with theme-resolved class strings. Move Aqua gradient/shadow logic into CSS classes (`.aqua-button.primary`, `.aqua-button.secondary` already exist in `themes.css`).

### 12.2 `input.tsx` — Inline Event Handler Styling

The `Input` component applies theme styles through `onMouseEnter`, `onMouseLeave`, `onFocus`, and `onBlur` event handlers that directly manipulate `e.currentTarget.style`. This approach:
- Doesn't compose with CSS transitions
- Creates style flicker potential
- Bypasses React's rendering model

**Recommendation**: Move all state-driven styles to CSS using `:hover`, `:focus`, `:focus-within` selectors scoped to `[data-os-theme="macosx"]`.

### 12.3 `select.tsx` — Massive Inline Style Block

The `SelectTrigger` has ~35 lines of inline styles for macOS (lines 69–91) that duplicate the same gradient/shadow pattern as `button.tsx` `aqua_select`.

**Recommendation**: Extract a shared `.macos-select-trigger` CSS class that handles all Aqua styling in `themes.css`.

### 12.4 `dialog.tsx` — System 7 Hardcoded Background — FIXED

~~Line 131: `backgroundColor: "#E3E3E3"` for System 7 dialog body.~~ Now uses `var(--os-color-panel-bg)`.

### 12.5 `switch.tsx` — Non-macOS Hardcoded Colors — FIXED

~~Non-macOS themes use hardcoded `#111827` and `#9ca3af` for switch track colors.~~ Now uses `var(--os-color-switch-track)` and `var(--os-color-switch-track-checked)` tokens.

### 12.6 `dial.tsx` — Fully Hardcoded Colors

`src/components/ui/dial.tsx` uses `#ff8800`, `#333`, `#222`, `#ff00ff` with no theme awareness.

---

## 13. Icon System

### 13.1 Dual Icon Systems

1. **Phosphor Icons** — React components for UI icons (arrows, search, close, etc.)
2. **ThemedIcon** — PNG files in `/icons/{theme}/` for app/file icons

### 13.2 Icon Sizing Inconsistency

Phosphor icons use various sizing approaches:
- `size={10}`, `size={12}`, `size={14}`, `size={16}`, `size={20}`
- `className="h-4 w-4"`, `className="h-3 w-3"`
- `[&_svg]:size-3` on parent

No shared icon size tokens or scale.

### 13.3 Accessibility

- Many icon-only buttons lack `aria-label`
- Decorative Phosphor icons don't consistently have `aria-hidden="true"`
- `ThemedIcon` uses `alt={alt || name}` which is good but not always called with meaningful `alt`

---

## 14. Priority Extraction Roadmap

### Tier 1 — Highest Impact, Lowest Risk — COMPLETED

1. ~~**Add missing CSS variable tokens** (`--os-color-input-*`, `--os-color-panel-*`, `--os-color-separator`) to `themes.css`~~ ✅
2. ~~**Create `[data-selected]` utility class** for selection styling (replaces 12+ inline style blocks)~~ ✅
3. ~~**Extract `<SelectableListItem>`** component~~ ✅ `src/components/ui/selectable-list-item.tsx`
4. ~~**Extract `<SearchInput>`** component~~ ✅ `src/components/ui/search-input.tsx`
5. ~~**Consolidate theme checks** to use `isWindowsTheme()` / `isMacTheme()` consistently~~ ✅ (shared UI components)

### Tier 2 — High Impact, Medium Effort — PARTIALLY COMPLETED

6. **Scope XP/98 CSS** to `[data-os-theme]` selectors to reduce `!important` usage
7. ~~**Move macOS Aqua input styles** from inline JS to CSS classes in `themes.css`~~ ✅ `.os-themed-input`
8. **Extract `<AppSidebarPanel>`** and **`<PanelHeader>`** layout primitives
9. ~~**Define z-index scale** as CSS variables~~ ✅ `--z-base` through `--z-spotlight`
10. ~~**Add `prefers-reduced-motion` support**~~ ✅

### Tier 3 — Structural Improvements

11. **Refactor `button.tsx`** to single render path with theme-resolved classes
12. ~~**Refactor `input.tsx`** to use CSS state selectors instead of JS event handler styling~~ ✅
13. **Refactor `select.tsx`** to share Aqua styles with button via CSS classes
14. **Reconcile JS theme objects with CSS variables** (single source of truth)
15. **Define type scale** and remove global font-size `!important` overrides
16. **Rename `calendar-sidebar` to `os-sidebar`** and generalize
17. **Extract `<ToolbarButton>` / `<ToolbarButtonGroup>`** components
18. **Extract `<EmptyState>`** and **`<LoadingOverlay>`** components
19. **Create `useKeyboardShortcuts`** hook or shortcut registry

### Tier 4 — Polish & Accessibility

20. **Audit and fix ARIA labels** on icon-only buttons
21. **Add `aria-hidden`** to decorative Phosphor icons
22. **Review color contrast** for disabled/secondary text in each theme
23. **Re-enable `jsx-a11y/no-noninteractive-tabindex`** lint rule
24. **Standardize icon sizes** with a scale
25. **Document theme switching architecture** for contributors
