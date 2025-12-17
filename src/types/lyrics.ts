export interface LyricLine {
  startTimeMs: string;
  words: string;
}

export enum LyricsFont {
  SansSerif = "sans-serif",
  Serif = "serif",
  Rounded = "rounded",
}

export enum LyricsAlignment {
  Alternating = "alternating",
  FocusThree = "focusThree",
  Center = "center",
}

export enum ChineseVariant {
  Original = "original",
  Traditional = "traditional",
  Simplified = "simplified",
}

export enum KoreanDisplay {
  Original = "original",
  Romanized = "romanized",
}

export enum JapaneseFurigana {
  Off = "off",
  On = "on",
}
