/** March 2026 major features — filenames must match `scripts/record-march-demo-reel.ts` output. */
export type FeatureClip = {
  id: string;
  file: string;
  title: string;
  subtitle: string;
};

export const MARCH_2026_FEATURES: FeatureClip[] = [
  {
    id: "calendar",
    file: "calendar.webm",
    title: "Calendar",
    subtitle: "iCal, todos, Dashboard widget & AI",
  },
  {
    id: "dashboard",
    file: "dashboard.webm",
    title: "Dashboard",
    subtitle: "Widget strip — Stocks, Dictionary, Translator",
  },
  {
    id: "candybar",
    file: "candybar.webm",
    title: "CandyBar",
    subtitle: "Dock icon packs",
  },
  {
    id: "finder-airdrop",
    file: "finder-airdrop.webm",
    title: "Finder AirDrop",
    subtitle: "Share & discover on the LAN",
  },
  {
    id: "cloud-sync",
    file: "cloud-sync.webm",
    title: "Cloud sync 2.0",
    subtitle: "Logical domains & safer merge",
  },
  {
    id: "theme-ui",
    file: "theme-ui.webm",
    title: "Theme & UI",
    subtitle: "Semantic tokens, shared components, accessibility",
  },
];

/** Frames at 30fps */
export const TITLE_DURATION = 45;
export const CLIP_DURATION = 150;
export const FPS = 30;

export const TOTAL_FRAMES =
  MARCH_2026_FEATURES.length * (TITLE_DURATION + CLIP_DURATION);
