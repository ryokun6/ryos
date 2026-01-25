---
name: ui-design-styling
description: Design and style UI components for ryOS following the 4 OS themes (System 7, macOS Aqua, Windows XP, Windows 98). Use when creating UI components, styling elements, working with themes, adding visual effects, or implementing retro OS aesthetics.
---

# ryOS UI Design & Styling

## The 4 Themes

| Theme | ID | Key Traits |
|-------|-----|------------|
| System 7 | `system7` | Black/white, square corners, Chicago font, dotted patterns |
| macOS Aqua | `macosx` | Pinstripes, traffic lights, glossy buttons, Lucida Grande |
| Windows XP | `xp` | Blue gradients, Luna style, soft shadows, Tahoma |
| Windows 98 | `win98` | Gray 3D bevels, classic blue title bars, MS Sans Serif |

## Essential Utilities

```tsx
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";

const { osTheme } = useTheme();

// Theme-conditional classes
className={cn(
  "base-classes",
  osTheme === "macosx" && "aqua-specific",
  osTheme === "system7" && "system7-specific"
)}
```

## OS-Aware Tailwind Classes

```tsx
className="bg-os-window-bg"        // Window background
className="border-os-window"       // Window border
className="rounded-os"             // Theme-appropriate radius
className="font-os-ui"             // UI font stack
className="font-os-mono"           // Monospace font
className="shadow-os-window"       // Window shadow
className="h-os-titlebar"          // Title bar height
```

## CSS Variables

Access via `var(--name)`:

```css
--os-font-ui, --os-font-mono
--os-color-window-bg, --os-color-window-border
--os-color-titlebar-active-bg, --os-color-titlebar-inactive-bg
--os-color-button-face, --os-color-button-highlight, --os-color-button-shadow
--os-color-selection-bg, --os-color-selection-text
--os-metrics-border-width, --os-metrics-radius
--os-metrics-titlebar-height, --os-metrics-menubar-height
```

---

## Theme-Specific Styling

### System 7
```tsx
<div className={cn(
  "border-2 border-black bg-white rounded-none",
  "font-chicago text-black",
  "shadow-[2px_2px_0px_0px_rgba(0,0,0,0.5)]"
)}>
```

### macOS Aqua
```tsx
<div className={cn(
  "bg-[#E8E8E8] border border-black/30",
  "rounded-lg font-lucida-grande",
  "shadow-[0_3px_10px_rgba(0,0,0,0.3)]"
)}>
  <button className="aqua-button primary">OK</button>
</div>
```

### Windows XP
```tsx
<div className={cn(
  "bg-[#ECE9D8] border-[3px] border-[#0054E3]",
  "rounded-[0.5rem] font-tahoma",
  "shadow-[0_4px_8px_rgba(0,0,0,0.25)]"
)}>
```

### Windows 98
```tsx
<div className={cn(
  "bg-[#C0C0C0] border-2 rounded-none font-ms-sans-serif",
  "border-t-white border-l-white",
  "border-b-[#808080] border-r-[#808080]"
)}>
```

---

## Theme Specifications

### System 7 (`system7`)
| Property | Value |
|----------|-------|
| Fonts | Chicago, Monaco (mono) |
| Window BG | `#FFFFFF` |
| Border | `2px solid #000000` |
| Radius | `0px` |
| Selection | Black bg, white text |
| Shadow | `2px 2px 0px 0px rgba(0,0,0,0.5)` |

### macOS Aqua (`macosx`)
| Property | Value |
|----------|-------|
| Fonts | Lucida Grande, Monaco (mono) |
| Window BG | `#E8E8E8` |
| Border | `0.5px solid rgba(0,0,0,0.3)` |
| Radius | `0.45rem` (8px) |
| Selection | `#3875D7` bg, white text |
| Shadow | `0 3px 10px rgba(0,0,0,0.3)` |
| Traffic Lights | Red `#FF5F57`, Yellow `#FEBC2E`, Green `#28C840` |

### Windows XP (`xp`)
| Property | Value |
|----------|-------|
| Fonts | Tahoma, Consolas (mono) |
| Window BG | `#ECE9D8` |
| Border | `3px solid #0054E3` |
| Radius | `0.5rem` (8px) |
| Selection | `#316AC5` bg, white text |
| Shadow | `0 4px 8px rgba(0,0,0,0.25)` |
| Title Bar | Blue gradient `#0A246A` → `#0054E3` |

### Windows 98 (`win98`)
| Property | Value |
|----------|-------|
| Fonts | MS Sans Serif, Fixedsys (mono) |
| Window BG | `#C0C0C0` |
| Raised Bevel | `border: 2px solid; border-color: #FFF #808080 #808080 #FFF` |
| Sunken Bevel | `border: 2px solid; border-color: #808080 #FFF #FFF #808080` |
| Radius | `0px` |
| Selection | `#000080` bg, white text |
| Title Bar | Gradient `#000080` → `#1084D0` |

---

## Component Patterns

### Theme-Adaptive Button
```tsx
import { Button } from "@/components/ui/button";

<Button variant="default">Standard</Button>
<Button variant="retro">Retro Style</Button>
<Button variant="aqua">Aqua (macOS)</Button>
```

### Aqua Buttons (CSS classes)
```tsx
<button className="aqua-button">Default</button>
<button className="aqua-button primary">Primary (pulsing)</button>
<button className="aqua-button secondary">Secondary</button>
```

### Win98 3D Button
```tsx
<button className={cn(
  "px-4 py-1 bg-[#C0C0C0]",
  "border-2 border-t-white border-l-white",
  "border-b-[#808080] border-r-[#808080]",
  "active:border-t-[#808080] active:border-l-[#808080]",
  "active:border-b-white active:border-r-white"
)}>
```

### Glassmorphism
```tsx
<div className="bg-white/80 backdrop-blur-lg rounded-lg">
<div className="bg-black/40 backdrop-blur-xl text-white">
```

### Theme-Aware Panel
```tsx
<div className={cn(
  "p-4 bg-os-window-bg border-os-window rounded-os",
  osTheme === "system7" && "border-2 border-black",
  osTheme === "macosx" && "shadow-md",
  osTheme === "win98" && "border-2 border-t-white border-l-white border-b-[#808080] border-r-[#808080]"
)}>
```

---

## Custom Components

| Component | Usage |
|-----------|-------|
| `AudioBars` | Frequency visualization |
| `PlaybackBars` | Equalizer animation |
| `VolumeBar` | Horizontal volume indicator |
| `Dial` | Circular dial control (sm/md/lg) |
| `RightClickMenu` | Context menu wrapper |

### Dial Example
```tsx
import { Dial } from "@/components/ui/dial";
<Dial value={50} onChange={setValue} size="md" label="Volume" />
```

---

## Window Materials

| Mode | Use Case |
|------|----------|
| `default` | Standard opaque windows |
| `transparent` | Semi-transparent (iPod, Photo Booth) |
| `notitlebar` | Immersive with floating controls (Videos) |

---

## Best Practices

1. **Always search for existing patterns** before creating new styles or components
2. **Always use `cn()`** for conditional class merging
3. **Use OS-aware classes** (`bg-os-*`, `border-os-*`) when available
4. **Check theme with `useTheme()`** for complex conditional rendering
5. **Prefer CSS variables** over hardcoded colors
6. **Test all 4 themes** when adding styled components
x