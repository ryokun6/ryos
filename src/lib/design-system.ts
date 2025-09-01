// Design System Utilities for ryOS
// This file provides helper functions for working with design tokens, themes, and component variants

import { designTokens } from "@/config/design-tokens";
import { ThemeMode, getTheme, applyTheme, loadThemePreference, saveThemePreference } from "@/config/theme";
import { cn } from "@/lib/utils";

// Design token utilities
export function getDesignToken(category: keyof typeof designTokens, token: string): string {
  const categoryTokens = designTokens[category] as Record<string, string>;
  return categoryTokens[token] || "";
}

export function getColorToken(token: string): string {
  return getDesignToken("colors", token);
}

export function getSpacingToken(token: string): string {
  return getDesignToken("spacing", token);
}

export function getFontToken(token: string): string {
  return getDesignToken("typography", token);
}

// Theme utilities
export function initializeTheme(): ThemeMode {
  const theme = loadThemePreference();
  applyTheme(theme);
  return theme;
}

export function switchTheme(mode: ThemeMode): void {
  applyTheme(mode);
  saveThemePreference(mode);
}

// Component variant utilities
export interface VariantConfig<T extends Record<string, any>> {
  variants: T;
  defaultVariants?: Partial<Record<keyof T, keyof T[keyof T]>>;
}

export function createVariantConfig<T extends Record<string, any>>(
  config: VariantConfig<T>
): VariantConfig<T> {
  return config;
}

// Typography utilities
export const typography = {
  // Font family classes
  fontChicago: "font-chicago",
  fontGeneva12: "font-geneva-12",
  fontAppleGaramond: "font-apple-garamond",
  fontMondwest: "font-mondwest",
  fontNeuebit: "font-neuebit",
  fontMonaco: "font-monaco",
  fontJacquard: "font-jacquard",

  // Font size classes
  textXs: "text-xs",
  textSm: "text-sm",
  textBase: "text-base",
  textLg: "text-lg",
  textXl: "text-xl",
  text2xl: "text-2xl",
  text3xl: "text-3xl",
  text4xl: "text-4xl",
  text5xl: "text-5xl",
  text6xl: "text-6xl",

  // Font weight classes
  fontNormal: "font-normal",
  fontMedium: "font-medium",
  fontSemibold: "font-semibold",
  fontBold: "font-bold",

  // Line height classes
  leadingTight: "leading-tight",
  leadingNormal: "leading-normal",
  leadingRelaxed: "leading-relaxed",

  // Text alignment
  textLeft: "text-left",
  textCenter: "text-center",
  textRight: "text-right",
  textJustify: "text-justify",

  // Text decoration
  underline: "underline",
  noUnderline: "no-underline",
  lineThrough: "line-through",

  // Text transform
  uppercase: "uppercase",
  lowercase: "lowercase",
  capitalize: "capitalize",
  normalCase: "normal-case",

  // Text truncation
  truncate: "truncate",
  textEllipsis: "text-ellipsis",
  textClip: "text-clip",
} as const;

// Spacing utilities
export const spacing = {
  // Margin
  m0: "m-0",
  m1: "m-1",
  m2: "m-2",
  m3: "m-3",
  m4: "m-4",
  m5: "m-5",
  m6: "m-6",
  m8: "m-8",
  m10: "m-10",
  m12: "m-12",
  m16: "m-16",
  m20: "m-20",
  m24: "m-24",
  m32: "m-32",
  mAuto: "m-auto",

  // Padding
  p0: "p-0",
  p1: "p-1",
  p2: "p-2",
  p3: "p-3",
  p4: "p-4",
  p5: "p-5",
  p6: "p-6",
  p8: "p-8",
  p10: "p-10",
  p12: "p-12",
  p16: "p-16",
  p20: "p-20",
  p24: "p-24",
  p32: "p-32",

  // Gap
  gap0: "gap-0",
  gap1: "gap-1",
  gap2: "gap-2",
  gap3: "gap-3",
  gap4: "gap-4",
  gap5: "gap-5",
  gap6: "gap-6",
  gap8: "gap-8",
  gap10: "gap-10",
  gap12: "gap-12",
  gap16: "gap-16",
  gap20: "gap-20",
  gap24: "gap-24",
  gap32: "gap-32",
} as const;

// Layout utilities
export const layout = {
  // Display
  block: "block",
  inlineBlock: "inline-block",
  inline: "inline",
  flex: "flex",
  inlineFlex: "inline-flex",
  grid: "grid",
  inlineGrid: "inline-grid",
  hidden: "hidden",

  // Position
  static: "static",
  relative: "relative",
  absolute: "absolute",
  fixed: "fixed",
  sticky: "sticky",

  // Z-index
  z0: "z-0",
  z10: "z-10",
  z20: "z-20",
  z30: "z-30",
  z40: "z-40",
  z50: "z-50",
  zAuto: "z-auto",

  // Overflow
  overflowAuto: "overflow-auto",
  overflowHidden: "overflow-hidden",
  overflowVisible: "overflow-visible",
  overflowScroll: "overflow-scroll",
  overflowXAuto: "overflow-x-auto",
  overflowYAuto: "overflow-y-auto",

  // Width & Height
  wFull: "w-full",
  hFull: "h-full",
  wScreen: "w-screen",
  hScreen: "h-screen",
  wAuto: "w-auto",
  hAuto: "h-auto",
  minW0: "min-w-0",
  minH0: "min-h-0",
  maxWFull: "max-w-full",
  maxHFull: "max-h-full",
} as const;

// Border utilities
export const borders = {
  // Border radius
  roundedNone: "rounded-none",
  roundedSm: "rounded-sm",
  roundedMd: "rounded-md",
  roundedLg: "rounded-lg",
  roundedXl: "rounded-xl",
  rounded2xl: "rounded-2xl",
  rounded3xl: "rounded-3xl",
  roundedFull: "rounded-full",

  // Border width
  border0: "border-0",
  border: "border",
  border2: "border-2",
  border4: "border-4",
  border8: "border-8",

  // Border color
  borderTransparent: "border-transparent",
  borderCurrent: "border-current",
  borderPrimary: "border-primary",
  borderSecondary: "border-secondary",
  borderMuted: "border-muted",
  borderAccent: "border-accent",
  borderDestructive: "border-destructive",
} as const;

// Shadow utilities
export const shadows = {
  shadowNone: "shadow-none",
  shadowSm: "shadow-sm",
  shadowMd: "shadow-md",
  shadowLg: "shadow-lg",
  shadowXl: "shadow-xl",
  shadowRetro: "shadow-retro",
  shadowSystem7: "shadow-system7",
} as const;

// Animation utilities
export const animations = {
  // Transitions
  transitionNone: "transition-none",
  transitionAll: "transition-all",
  transitionColors: "transition-colors",
  transitionOpacity: "transition-opacity",
  transitionShadow: "transition-shadow",
  transitionTransform: "transition-transform",

  // Durations
  duration75: "duration-75",
  duration100: "duration-100",
  duration150: "duration-150",
  duration200: "duration-200",
  duration300: "duration-300",
  duration500: "duration-500",
  duration700: "duration-700",
  duration1000: "duration-1000",

  // Easings
  easeLinear: "ease-linear",
  easeIn: "ease-in",
  easeOut: "ease-out",
  easeInOut: "ease-in-out",

  // Custom animations
  animateShake: "animate-shake",
  animateMarquee: "animate-marquee",
  animateShimmer: "animate-shimmer",
  animateFadeIn: "animate-fade-in",
  animateProgressIndeterminate: "animate-progress-indeterminate",
} as const;

// Interactive utilities
export const interactive = {
  // Cursor
  cursorDefault: "cursor-default",
  cursorPointer: "cursor-pointer",
  cursorNotAllowed: "cursor-not-allowed",
  cursorGrab: "cursor-grab",
  cursorGrabbing: "cursor-grabbing",

  // User select
  selectNone: "select-none",
  selectText: "select-text",
  selectAll: "select-all",
  selectAuto: "select-auto",

  // Focus
  focusVisible: "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  focusWithin: "focus-within:outline-none focus-within:ring-1 focus-within:ring-ring",

  // Hover
  hover: "hover:opacity-80",
  hoverScale: "hover:scale-105",
  hoverBrightness: "hover:brightness-90",

  // Active
  active: "active:opacity-60",
  activeScale: "active:scale-95",
  activeBrightness: "active:brightness-50",

  // Disabled
  disabled: "disabled:pointer-events-none disabled:opacity-50",
} as const;

// Component-specific utilities
export const components = {
  // Button variants
  button: {
    base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
    retro: "border-[5px] border-solid border-transparent [border-image:url('/button.svg')_30_stretch] active:[border-image:url('/button-default.svg')_60_stretch] focus:[border-image:url('/button-default.svg')_60_stretch] shadow-none focus:outline-none focus:ring-0",
    player: "text-[9px] flex items-center justify-center focus:outline-none relative min-w-[45px] h-[20px] border border-solid border-transparent [border-image:url('/assets/videos/switch.png')_1_fill] [border-image-slice:1] bg-none font-geneva-12 text-black hover:brightness-90 active:brightness-50 [&[data-state=on]]:brightness-60",
  },

  // Card variants
  card: {
    base: "rounded-lg border bg-card text-card-foreground shadow-sm",
    header: "flex flex-col space-y-1.5 p-6",
    title: "text-2xl font-semibold leading-none tracking-tight",
    description: "text-sm text-muted-foreground",
    content: "p-6 pt-0",
    footer: "flex items-center p-6 pt-0",
  },

  // Input variants
  input: {
    base: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
    retro: "flex h-10 w-full border-2 border-black bg-white px-3 py-2 text-sm font-mondwest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  },

  // Dialog variants
  dialog: {
    base: "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
    retro: "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border-2 border-black bg-white p-6 shadow-retro duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
  },
} as const;

// Utility function to combine multiple design system classes
export function ds(...classes: (string | undefined | null | false)[]): string {
  return cn(...classes.filter(Boolean));
}

// Utility function to create responsive classes
export function responsive(
  base: string,
  sm?: string,
  md?: string,
  lg?: string,
  xl?: string,
  twoXl?: string
): string {
  return cn(
    base,
    sm && `sm:${sm}`,
    md && `md:${md}`,
    lg && `lg:${lg}`,
    xl && `xl:${xl}`,
    twoXl && `2xl:${twoXl}`
  );
}

// Utility function to create state-based classes
export function state(
  base: string,
  hover?: string,
  focus?: string,
  active?: string,
  disabled?: string
): string {
  return cn(
    base,
    hover && `hover:${hover}`,
    focus && `focus:${focus}`,
    active && `active:${active}`,
    disabled && `disabled:${disabled}`
  );
}

// Export all utilities
export const designSystem = {
  typography,
  spacing,
  layout,
  borders,
  shadows,
  animations,
  interactive,
  components,
  ds,
  responsive,
  state,
  getDesignToken,
  getColorToken,
  getSpacingToken,
  getFontToken,
  initializeTheme,
  switchTheme,
  createVariantConfig,
} as const;