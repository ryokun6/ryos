---
name: ui-design-styling
description: Design and style UI components for ryOS following the 4 OS themes (System 7, macOS Aqua, Windows XP, Windows 98). Use when creating UI components, styling elements, working with themes, adding visual effects, or implementing retro OS aesthetics.
---

# ryOS UI Design & Styling

## Quick Reference

### The 4 Themes

| Theme | ID | Era | Key Traits |
|-------|-----|-----|------------|
| System 7 | `system7` | 1990s Mac | Black/white, dotted patterns, square corners, Chicago font |
| macOS Aqua | `macosx` | 2000s Mac | Pinstripes, traffic lights, glossy buttons, Lucida Grande font |
| Windows XP | `xp` | 2000s PC | Blue gradients, beveled edges, Luna style, Tahoma font |
| Windows 98 | `win98` | 1990s PC | Gray 3D bevels, classic blue title bars, MS Sans Serif |

### Essential Utilities

```tsx
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

// Get current theme
const { osTheme } = useTheme();

// Conditional theme classes
className={cn(
  "base-classes",
  osTheme === "macosx" && "aqua-specific",
  osTheme === "system7" && "system7-specific"
)}
```

### OS-Aware Tailwind Classes

```tsx
// Use these for automatic theme adaptation
className="bg-os-window-bg"        // Window background
className="border-os-window"       // Window border
className="rounded-os"             // Theme-appropriate radius
className="font-os-ui"             // UI font stack
className="font-os-mono"           // Monospace font
className="shadow-os-window"       // Window shadow
className="h-os-titlebar"          // Title bar height
className="h-os-menubar"           // Menu bar height
```

## CSS Variables

All themes expose these variables (access via `var(--name)`):

```css
/* Fonts */
--os-font-ui              /* UI font family */
--os-font-mono            /* Monospace font */

/* Colors */
--os-color-window-bg
--os-color-window-border
--os-color-titlebar-active-bg
--os-color-titlebar-inactive-bg
--os-color-titlebar-text
--os-color-button-face
--os-color-button-highlight
--os-color-button-shadow
--os-color-selection-bg
--os-color-selection-text
--os-color-text-primary
--os-color-text-secondary

/* Metrics */
--os-metrics-border-width
--os-metrics-radius
--os-metrics-titlebar-height
--os-metrics-menubar-height
--os-window-shadow
```

## Theme-Specific Styling

### System 7

```tsx
// High contrast, square corners, pixel-perfect
<div className={cn(
  "border-2 border-black bg-white",
  "font-chicago text-black",
  "rounded-none shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]"
)}>
  {/* Content */}
</div>
```

### macOS Aqua

```tsx
// Glossy, pinstripes, traffic lights
<div className={cn(
  "bg-[#E8E8E8] border border-black/30",
  "rounded-lg font-lucida-grande",
  "shadow-[0_3px_10px_rgba(0,0,0,0.3)]"
)}>
  {/* Use .aqua-button for buttons */}
  <button className="aqua-button primary">OK</button>
</div>
```

### Windows XP

```tsx
// Luna blue, subtle rounding
<div className={cn(
  "bg-[#ECE9D8] border-[3px] border-[#0054E3]",
  "rounded-[0.5rem] font-tahoma",
  "shadow-[0_4px_8px_rgba(0,0,0,0.25)]"
)}>
  {/* Content */}
</div>
```

### Windows 98

```tsx
// 3D bevels, gray, square
<div className={cn(
  "bg-[#C0C0C0] border-2",
  "border-t-white border-l-white",
  "border-b-[#808080] border-r-[#808080]",
  "font-ms-sans-serif rounded-none"
)}>
  {/* Content */}
</div>
```

## Component Patterns

### Using shadcn Components

```tsx
import { Button } from "@/components/ui/button";

// Button variants adapt to theme
<Button variant="default">Standard</Button>
<Button variant="retro">Retro Style</Button>
<Button variant="aqua">Aqua (macOS)</Button>
```

### Aqua Button Classes

```tsx
// For macOS Aqua theme - use these CSS classes
<button className="aqua-button">Default</button>
<button className="aqua-button primary">Primary (pulsing)</button>
<button className="aqua-button secondary">Secondary</button>
```

### Glassmorphism

```tsx
// Common pattern for overlays and modern effects
<div className="bg-white/80 backdrop-blur-lg rounded-lg">
  {/* Semi-transparent with blur */}
</div>

// Darker variant
<div className="bg-black/40 backdrop-blur-xl text-white">
  {/* Dark glass effect */}
</div>
```

## Window Materials

The `WindowFrame` component supports different material modes:

| Mode | Use Case |
|------|----------|
| `default` | Standard opaque windows |
| `transparent` | Semi-transparent (iPod, Photo Booth) |
| `notitlebar` | Immersive with floating controls (Videos, games) |

## Custom Components

### Available Custom Components

- `AudioBars` - Animated frequency visualization
- `PlaybackBars` - Equalizer animation
- `VolumeBar` - Horizontal volume indicator
- `Dial` - Circular dial control (sm/md/lg)
- `RightClickMenu` - Context menu wrapper
- `SwipeInstructions` - Mobile gesture hints

### Using the Dial Component

```tsx
import { Dial } from "@/components/ui/dial";

<Dial
  value={50}
  onChange={setValue}
  size="md"        // sm | md | lg
  label="Volume"
/>
```

## Best Practices

1. **Always use `cn()` for conditional classes** - merges classes safely
2. **Use OS-aware Tailwind classes** when available (`bg-os-*`, `border-os-*`)
3. **Check theme with `useTheme()`** for complex conditional rendering
4. **Prefer CSS variables** over hardcoded colors for theme compatibility
5. **Test all 4 themes** when adding new styled components

## Additional Resources

- For detailed theme specifications, see [THEMES.md](THEMES.md)
- For component examples, see [EXAMPLES.md](EXAMPLES.md)
