# ryOS Design System

A comprehensive design system for retro-inspired user interfaces, built with modern React patterns and TypeScript.

## Table of Contents

- [Overview](#overview)
- [Design Tokens](#design-tokens)
- [Theme System](#theme-system)
- [Typography](#typography)
- [Components](#components)
- [Utilities](#utilities)
- [Best Practices](#best-practices)
- [Migration Guide](#migration-guide)

## Overview

The ryOS Design System provides a cohesive set of design tokens, components, and utilities for building retro-inspired user interfaces. It's built on top of shadcn/ui with custom enhancements for retro aesthetics.

### Key Features

- **Multi-theme Support**: Light, Dark, Retro (CRT), and System 7 themes
- **Type-safe Design Tokens**: Fully typed design system with IntelliSense support
- **Component Variants**: Extensive variant system for all components
- **Animation System**: Built-in animations and transitions
- **Responsive Design**: Mobile-first responsive utilities
- **Accessibility**: WCAG compliant components

## Design Tokens

Design tokens are the foundation of the design system, providing consistent values for colors, typography, spacing, and more.

### Usage

```typescript
import { designTokens, getDesignToken } from "@/lib/design-system";

// Get a specific token
const primaryColor = getDesignToken("colors", "primary");
const spacingValue = getDesignToken("spacing", "4");

// Access tokens directly
const fontSize = designTokens.typography.fontSizes.lg;
const borderRadius = designTokens.borderRadius.lg;
```

### Available Token Categories

- **Colors**: Semantic colors, System 7 colors, chart colors
- **Typography**: Font families, sizes, weights, line heights
- **Spacing**: Margin, padding, gap values
- **Border Radius**: Corner radius values
- **Shadows**: Box shadow definitions
- **Animations**: Duration, easing, and custom animations
- **Z-Index**: Layering system
- **Breakpoints**: Responsive breakpoints

## Theme System

The theme system provides multiple visual themes with automatic switching and persistence.

### Available Themes

1. **System 7** (Default): Classic Mac OS aesthetic
2. **Light**: Clean, modern light theme
3. **Dark**: Dark mode for low-light environments
4. **Retro**: CRT/terminal green aesthetic

### Usage

```typescript
import { ThemeProvider, useTheme } from "@/components/providers/ThemeProvider";

// Wrap your app
function App() {
  return (
    <ThemeProvider defaultTheme="system7">
      <YourApp />
    </ThemeProvider>
  );
}

// Use in components
function MyComponent() {
  const { theme, switchTheme } = useTheme();
  
  return (
    <button onClick={() => switchTheme("retro")}>
      Switch to Retro Theme
    </button>
  );
}
```

### Theme Switching

The theme system automatically:
- Persists user preferences in localStorage
- Responds to system theme changes
- Provides smooth transitions between themes
- Maintains theme state across app sessions

## Typography

The typography system includes multiple retro fonts and comprehensive text utilities.

### Font Families

```typescript
import { typography } from "@/lib/design-system";

// Available font classes
typography.fontChicago      // Chicago (Default)
typography.fontGeneva12     // Geneva 12
typography.fontAppleGaramond // Apple Garamond
typography.fontMondwest     // Mondwest
typography.fontNeuebit      // NeueBit
typography.fontMonaco       // Monaco
typography.fontJacquard     // Jacquard
```

### Font Sizes

```typescript
// Available size classes
typography.textXs    // 12px
typography.textSm    // 14px
typography.textBase  // 16px
typography.textLg    // 18px
typography.textXl    // 20px
typography.text2xl   // 24px
typography.text3xl   // 30px
typography.text4xl   // 36px
typography.text5xl   // 48px
typography.text6xl   // 60px
```

### Usage Examples

```tsx
// Basic typography
<h1 className="font-chicago text-4xl font-bold">Main Title</h1>
<p className="font-geneva-12 text-base">Body text</p>
<code className="font-monaco text-sm">Code snippet</code>

// With design system utilities
import { ds, typography } from "@/lib/design-system";

<h1 className={ds(typography.fontChicago, typography.text4xl, typography.fontBold)}>
  Main Title
</h1>
```

## Components

### Enhanced Button

The enhanced button component provides extensive customization options.

```tsx
import { EnhancedButton, ButtonGroup } from "@/components/ui/enhanced-button";

// Basic usage
<EnhancedButton>Click me</EnhancedButton>

// With variants
<EnhancedButton variant="retro" size="lg">
  Retro Button
</EnhancedButton>

// With animations
<EnhancedButton variant="neon" animation="pulse">
  Neon Button
</EnhancedButton>

// Loading state
<EnhancedButton loading>Loading...</EnhancedButton>

// With icons
<EnhancedButton icon="🎵" iconPosition="left">
  Play Music
</EnhancedButton>

// Button groups
<ButtonGroup variant="outline" size="sm">
  <EnhancedButton>Left</EnhancedButton>
  <EnhancedButton>Center</EnhancedButton>
  <EnhancedButton>Right</EnhancedButton>
</ButtonGroup>
```

### Available Variants

- **default**: Standard button
- **destructive**: For dangerous actions
- **outline**: Bordered button
- **secondary**: Secondary actions
- **ghost**: Minimal styling
- **link**: Link-like appearance
- **retro**: Retro aesthetic
- **player**: Music player style
- **gradient**: Gradient background
- **neon**: Neon glow effect
- **glass**: Glassmorphism effect
- **pixel**: Pixel art style
- **crt**: CRT terminal style

### Available Sizes

- **xs**: Extra small
- **sm**: Small
- **default**: Default size
- **lg**: Large
- **xl**: Extra large
- **icon**: Square icon button
- **icon-sm**: Small icon button
- **icon-lg**: Large icon button

### Available Animations

- **none**: No animation
- **pulse**: Pulsing effect
- **bounce**: Bouncing effect
- **spin**: Spinning effect
- **ping**: Ping effect
- **shake**: Shake animation
- **shimmer**: Shimmer effect

## Utilities

### Design System Utilities

```typescript
import { designSystem, ds, responsive, state } from "@/lib/design-system";

// Combine classes
const className = ds(
  designSystem.typography.fontChicago,
  designSystem.spacing.p4,
  designSystem.borders.roundedLg
);

// Responsive classes
const responsiveClass = responsive(
  "text-sm",           // Base
  "text-base",         // sm
  "text-lg",           // md
  "text-xl",           // lg
  "text-2xl"           // xl
);

// State-based classes
const stateClass = state(
  "bg-blue-500",       // Base
  "hover:bg-blue-600", // Hover
  "focus:bg-blue-700", // Focus
  "active:bg-blue-800" // Active
);
```

### Spacing Utilities

```typescript
import { spacing } from "@/lib/design-system";

// Margin
spacing.m0, spacing.m1, spacing.m2, spacing.m4, spacing.m8

// Padding
spacing.p0, spacing.p1, spacing.p2, spacing.p4, spacing.p8

// Gap
spacing.gap0, spacing.gap1, spacing.gap2, spacing.gap4, spacing.gap8
```

### Layout Utilities

```typescript
import { layout } from "@/lib/design-system";

// Display
layout.flex, layout.grid, layout.hidden

// Position
layout.relative, layout.absolute, layout.fixed

// Z-index
layout.z0, layout.z10, layout.z50

// Overflow
layout.overflowHidden, layout.overflowAuto
```

### Border Utilities

```typescript
import { borders } from "@/lib/design-system";

// Border radius
borders.roundedNone, borders.roundedSm, borders.roundedLg, borders.roundedFull

// Border width
borders.border0, borders.border, borders.border2

// Border color
borders.borderPrimary, borders.borderSecondary, borders.borderMuted
```

### Shadow Utilities

```typescript
import { shadows } from "@/lib/design-system";

shadows.shadowNone, shadows.shadowSm, shadows.shadowMd, shadows.shadowLg
shadows.shadowRetro, shadows.shadowSystem7
```

### Animation Utilities

```typescript
import { animations } from "@/lib/design-system";

// Transitions
animations.transitionAll, animations.transitionColors

// Durations
animations.duration75, animations.duration300, animations.duration500

// Easings
animations.easeIn, animations.easeOut, animations.easeInOut

// Custom animations
animations.animateShake, animations.animateShimmer, animations.animateFadeIn
```

## Best Practices

### Component Development

1. **Use Design Tokens**: Always use design tokens instead of hardcoded values
2. **Type Safety**: Leverage TypeScript for type-safe component props
3. **Variants**: Use the variant system for component customization
4. **Accessibility**: Include proper ARIA attributes and keyboard navigation
5. **Performance**: Use React.memo for expensive components

### Styling Guidelines

1. **Utility-First**: Use utility classes for styling
2. **Consistent Spacing**: Use the spacing scale consistently
3. **Semantic Colors**: Use semantic color tokens
4. **Responsive Design**: Design mobile-first
5. **Theme Support**: Ensure components work across all themes

### Code Organization

```typescript
// Good: Using design system utilities
import { ds, typography, spacing } from "@/lib/design-system";

const className = ds(
  typography.fontChicago,
  typography.textLg,
  spacing.p4,
  "bg-primary text-primary-foreground"
);

// Avoid: Hardcoded values
const className = "font-chicago text-lg p-4 bg-black text-white";
```

## Migration Guide

### From Basic Components

If you're migrating from basic components to the enhanced design system:

1. **Update Imports**:
   ```typescript
   // Before
   import { Button } from "@/components/ui/button";
   
   // After
   import { EnhancedButton } from "@/components/ui/enhanced-button";
   ```

2. **Update Props**:
   ```tsx
   // Before
   <Button variant="outline" size="sm">Click me</Button>
   
   // After
   <EnhancedButton variant="outline" size="sm">Click me</EnhancedButton>
   ```

3. **Add Theme Provider**:
   ```tsx
   // Wrap your app
   import { ThemeProvider } from "@/components/providers/ThemeProvider";
   
   function App() {
     return (
       <ThemeProvider>
         <YourApp />
       </ThemeProvider>
     );
   }
   ```

### From Custom Styling

If you're migrating from custom CSS to the design system:

1. **Replace Custom Colors**:
   ```css
   /* Before */
   .my-button {
     background-color: #000000;
     color: #ffffff;
   }
   
   /* After */
   .my-button {
     @apply bg-primary text-primary-foreground;
   }
   ```

2. **Use Design Tokens**:
   ```typescript
   // Before
   const spacing = "16px";
   
   // After
   import { getSpacingToken } from "@/lib/design-system";
   const spacing = getSpacingToken("4"); // 16px
   ```

## Component Showcase

To see all components in action, use the ComponentShowcase:

```tsx
import { ComponentShowcase } from "@/components/docs/ComponentShowcase";

function DesignSystemPage() {
  return <ComponentShowcase />;
}
```

This will display all available components, variants, and utilities with interactive examples.

## Contributing

When adding new components or utilities to the design system:

1. Follow the existing patterns and naming conventions
2. Add proper TypeScript types
3. Include comprehensive documentation
4. Test across all themes
5. Ensure accessibility compliance
6. Add examples to the ComponentShowcase

## Support

For questions or issues with the design system:

1. Check the ComponentShowcase for examples
2. Review the TypeScript types for available options
3. Consult the design tokens for consistent values
4. Test in the theme switcher for cross-theme compatibility