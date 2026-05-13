/**
 * Add to an ancestor so **macOS Aqua** global typography / form rules skip the subtree
 * (see `:not(.os-native-chrome-skip *)` in `themes.css`).
 *
 * Existing apps use narrower escape hatches (`ipod-force-font`, `karaoke-force-font`, …).
 * Prefer this class for new immersive surfaces so stylesheet churn stays in one place.
 */
export const OS_NATIVE_CHROME_SKIP_CLASS = "os-native-chrome-skip";
