// Design Tokens for ryOS Design System
// This file defines all design system variables in a structured way

export const designTokens = {
  // Color System
  colors: {
    // Semantic Colors
    primary: {
      50: "hsl(0, 0%, 98%)",
      100: "hsl(0, 0%, 96%)",
      200: "hsl(0, 0%, 90%)",
      300: "hsl(0, 0%, 83%)",
      400: "hsl(0, 0%, 64%)",
      500: "hsl(0, 0%, 45%)",
      600: "hsl(0, 0%, 32%)",
      700: "hsl(0, 0%, 25%)",
      800: "hsl(0, 0%, 15%)",
      900: "hsl(0, 0%, 9%)",
      950: "hsl(0, 0%, 0%)",
    },
    // System 7 Colors (Retro Theme)
    system7: {
      "window-bg": "#FFFFFF",
      "menubar-bg": "#FFFFFF",
      "title-bar": "#000000",
      "title-text": "#FFFFFF",
      border: "#000000",
      "button-highlight": "#FFFFFF",
      "button-shadow": "#808080",
    },
    // Chart Colors
    chart: {
      1: "hsl(var(--chart-1))",
      2: "hsl(var(--chart-2))",
      3: "hsl(var(--chart-3))",
      4: "hsl(var(--chart-4))",
      5: "hsl(var(--chart-5))",
    },
  },

  // Typography System
  typography: {
    fonts: {
      chicago: "ChicagoKare, ArkPixel, SerenityOS-Emoji, system-ui",
      geneva12: "Geneva-12, ArkPixel, SerenityOS-Emoji, system-ui",
      appleGaramond: "AppleGaramond, ArkPixel, SerenityOS-Emoji, system-ui",
      mondwest: "Mondwest, ArkPixel, SerenityOS-Emoji, system-ui",
      neuebit: "NeueBit, ArkPixel, SerenityOS-Emoji, system-ui",
      monaco: "Monaco, ArkPixel, SerenityOS-Emoji, system-ui",
      jacquard: "Jacquard, ArkPixel, SerenityOS-Emoji, system-ui",
    },
    fontSizes: {
      xs: "0.75rem", // 12px
      sm: "0.875rem", // 14px
      base: "1rem", // 16px
      lg: "1.125rem", // 18px
      xl: "1.25rem", // 20px
      "2xl": "1.5rem", // 24px
      "3xl": "1.875rem", // 30px
      "4xl": "2.25rem", // 36px
      "5xl": "3rem", // 48px
      "6xl": "3.75rem", // 60px
    },
    fontWeights: {
      normal: "400",
      medium: "500",
      semibold: "600",
      bold: "700",
    },
    lineHeights: {
      tight: "1.25",
      normal: "1.5",
      relaxed: "1.75",
    },
  },

  // Spacing System
  spacing: {
    0: "0px",
    1: "0.25rem", // 4px
    2: "0.5rem", // 8px
    3: "0.75rem", // 12px
    4: "1rem", // 16px
    5: "1.25rem", // 20px
    6: "1.5rem", // 24px
    8: "2rem", // 32px
    10: "2.5rem", // 40px
    12: "3rem", // 48px
    16: "4rem", // 64px
    20: "5rem", // 80px
    24: "6rem", // 96px
    32: "8rem", // 128px
  },

  // Border Radius System
  borderRadius: {
    none: "0px",
    sm: "calc(var(--radius) - 4px)",
    md: "calc(var(--radius) - 2px)",
    lg: "var(--radius)",
    xl: "0.75rem",
    "2xl": "1rem",
    "3xl": "1.5rem",
    full: "9999px",
  },

  // Shadow System
  shadows: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
    lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
    retro: "2px 2px 0px 0px rgb(0 0 0)",
  },

  // Animation System
  animations: {
    durations: {
      fast: "150ms",
      normal: "300ms",
      slow: "500ms",
    },
    easings: {
      linear: "linear",
      ease: "ease",
      "ease-in": "ease-in",
      "ease-out": "ease-out",
      "ease-in-out": "ease-in-out",
    },
  },

  // Z-Index System
  zIndex: {
    hide: -1,
    auto: "auto",
    base: 0,
    docked: 10,
    dropdown: 1000,
    sticky: 1100,
    banner: 1200,
    overlay: 1300,
    modal: 1400,
    popover: 1500,
    skipLink: 1600,
    toast: 1700,
    tooltip: 1800,
  },

  // Breakpoints
  breakpoints: {
    sm: "640px",
    md: "768px",
    lg: "1024px",
    xl: "1280px",
    "2xl": "1536px",
  },
} as const;

// Type-safe design token types
export type DesignTokens = typeof designTokens;
export type ColorToken = keyof typeof designTokens.colors;
export type TypographyToken = keyof typeof designTokens.typography;
export type SpacingToken = keyof typeof designTokens.spacing;
export type BorderRadiusToken = keyof typeof designTokens.borderRadius;
export type ShadowToken = keyof typeof designTokens.shadows;
export type AnimationToken = keyof typeof designTokens.animations;
export type ZIndexToken = keyof typeof designTokens.zIndex;
export type BreakpointToken = keyof typeof designTokens.breakpoints;