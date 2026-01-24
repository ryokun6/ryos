# Theme Specifications

Complete reference for each OS theme's design tokens and patterns.

## System 7 (`system7`)

### Characteristics
- **Era**: Classic Macintosh (1991)
- **Visual**: High contrast black & white, pixel-perfect
- **Feel**: Simple, clean, minimal

### Fonts
```css
--os-font-ui: "ChicagoKare", "ChicagoFLF", sans-serif
--os-font-mono: "Monaco", monospace
```

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Window BG | `#FFFFFF` | Window backgrounds |
| Window Border | `#000000` | All borders |
| Title Bar Active | Dotted pattern | Active window title |
| Title Bar Inactive | `#CCCCCC` | Inactive window title |
| Button Face | `#DDDDDD` | Button backgrounds |
| Selection BG | `#000000` | Selected items |
| Selection Text | `#FFFFFF` | Text on selection |

### Metrics
| Property | Value |
|----------|-------|
| Border Width | `2px` |
| Border Radius | `0px` (square) |
| Title Bar Height | `1.5rem` (24px) |
| Menu Bar Height | `30px` |
| Window Shadow | `2px 2px 0px 0px rgba(0,0,0,0.5)` |

### Patterns
```css
/* Dotted title bar pattern */
background: linear-gradient(#000 50%, transparent 0) 0 0 / 2px 2px;
```

### Button Styling
```css
/* Classic Mac button */
.system7-button {
  background: #DDDDDD;
  border: 2px solid #000;
  border-radius: 0;
  box-shadow: inset -1px -1px 0 #888, inset 1px 1px 0 #FFF;
}
```

---

## macOS Aqua (`macosx`)

### Characteristics
- **Era**: Mac OS X (2001-2007)
- **Visual**: Glossy, translucent, colorful
- **Feel**: Liquid, playful, premium

### Fonts
```css
--os-font-ui: "LucidaGrande", "AquaKana", system-ui
--os-font-mono: "Monaco", monospace
```

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Window BG | `#E8E8E8` | Window backgrounds |
| Window Border | `rgba(0,0,0,0.3)` | Window borders |
| Title Bar Active | Gradient | Active title |
| Title Bar Inactive | `#F6F6F6` | Inactive title |
| Button Face | Aqua gradient | Buttons |
| Selection BG | `#3875D7` | Highlight |
| Selection Text | `#FFFFFF` | Highlighted text |

### Metrics
| Property | Value |
|----------|-------|
| Border Width | `0.5px` |
| Border Radius | `0.45rem` (8px) |
| Title Bar Height | `1.375rem` (22px) |
| Menu Bar Height | `25px` |
| Window Shadow | `0 3px 10px rgba(0,0,0,0.3)` |

### Aqua Button System
```css
/* Primary button (pulsing) */
.aqua-button.primary {
  background: linear-gradient(180deg, #6CB5FF 0%, #1B7BF2 50%, #0066DD 100%);
  border: 1px solid rgba(0,0,0,0.4);
  border-radius: 5px;
  box-shadow: 
    inset 0 1px 0 rgba(255,255,255,0.4),
    0 1px 2px rgba(0,0,0,0.2);
  color: white;
  text-shadow: 0 -1px 0 rgba(0,0,0,0.3);
}

/* Secondary button */
.aqua-button.secondary {
  background: linear-gradient(180deg, #FAFAFA 0%, #E8E8E8 50%, #D0D0D0 100%);
  color: #333;
}
```

### Patterns
```css
/* Pinstripe background */
background: repeating-linear-gradient(
  0deg,
  #E8E8E8,
  #E8E8E8 1px,
  #EFEFEF 1px,
  #EFEFEF 2px
);

/* Menu bar blur */
backdrop-filter: blur(20px);
background: rgba(255,255,255,0.8);
```

### Traffic Lights
- Close: Red `#FF5F57` with `×` on hover
- Minimize: Yellow `#FEBC2E` with `−` on hover  
- Maximize: Green `#28C840` with `+` on hover

---

## Windows XP (`xp`)

### Characteristics
- **Era**: Windows XP Luna (2001)
- **Visual**: Blue gradients, soft shadows, colorful
- **Feel**: Friendly, approachable

### Fonts
```css
--os-font-ui: "Tahoma", sans-serif
--os-font-mono: "Consolas", "Courier New", monospace
```

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Window BG | `#ECE9D8` | Window backgrounds |
| Window Border | `#0054E3` | Active window border |
| Title Bar Active | Blue gradient | Active title |
| Title Bar Inactive | `#7A96DF` | Inactive title |
| Button Face | `#ECE9D8` | Button backgrounds |
| Selection BG | `#316AC5` | Highlight |
| Selection Text | `#FFFFFF` | Highlighted text |

### Metrics
| Property | Value |
|----------|-------|
| Border Width | `3px` |
| Border Radius | `0.5rem` (8px) |
| Title Bar Height | `1.875rem` (30px) |
| Taskbar Height | `30px` |
| Window Shadow | `0 4px 8px rgba(0,0,0,0.25)` |

### Title Bar Gradient
```css
/* Active title bar */
background: linear-gradient(180deg, 
  #0A246A 0%, 
  #0F3D91 10%, 
  #0054E3 50%, 
  #0F3D91 90%, 
  #0A246A 100%
);
```

### Button Styling
```css
.xp-button {
  background: linear-gradient(180deg, #FFFFFF 0%, #ECE9D8 100%);
  border: 1px solid #003C74;
  border-radius: 3px;
  padding: 2px 10px;
}

.xp-button:hover {
  background: linear-gradient(180deg, #FFF7E6 0%, #FFE7A2 100%);
}
```

---

## Windows 98 (`win98`)

### Characteristics
- **Era**: Windows 98 (1998)
- **Visual**: 3D bevels, gray, utilitarian
- **Feel**: Functional, nostalgic

### Fonts
```css
--os-font-ui: "MS Sans Serif", "Pixelated MS Sans Serif", sans-serif
--os-font-mono: "Consolas", "Fixedsys", monospace
```

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Window BG | `#C0C0C0` | Window backgrounds |
| Window Border | `#C0C0C0` | Window frame |
| Title Bar Active | `#000080` → `#1084D0` | Active gradient |
| Title Bar Inactive | `#808080` | Inactive title |
| Button Face | `#C0C0C0` | Button backgrounds |
| Button Highlight | `#FFFFFF` | Top/left bevel |
| Button Shadow | `#808080` | Bottom/right bevel |
| Selection BG | `#000080` | Highlight |

### Metrics
| Property | Value |
|----------|-------|
| Border Width | `2px` |
| Border Radius | `0px` (square) |
| Title Bar Height | `1.375rem` (22px) |
| Taskbar Height | `30px` |
| Window Shadow | `none` |

### 3D Bevel Pattern
```css
/* Raised bevel (buttons, toolbars) */
.win98-raised {
  border-style: solid;
  border-width: 2px;
  border-color: #FFFFFF #808080 #808080 #FFFFFF;
  background: #C0C0C0;
}

/* Sunken bevel (inputs, insets) */
.win98-sunken {
  border-style: solid;
  border-width: 2px;
  border-color: #808080 #FFFFFF #FFFFFF #808080;
  background: #FFFFFF;
}
```

### Title Bar Gradient
```css
background: linear-gradient(90deg, #000080 0%, #1084D0 100%);
```

---

## Theme Detection

```tsx
import { useTheme } from "@/contexts/ThemeContext";

function MyComponent() {
  const { osTheme } = useTheme();
  
  // osTheme is one of: "system7" | "macosx" | "xp" | "win98"
  
  const isRetro = osTheme === "system7" || osTheme === "win98";
  const isMac = osTheme === "system7" || osTheme === "macosx";
  const isWindows = osTheme === "xp" || osTheme === "win98";
  
  return (
    <div className={cn(
      isRetro && "rounded-none",
      isMac && "font-lucida-grande",
      isWindows && "font-tahoma"
    )}>
      {/* Theme-aware content */}
    </div>
  );
}
```
