/**
 * Add to an ancestor so macOS Aqua global typography / form rules skip the
 * subtree (see `:not(.os-native-chrome-skip *)` in `themes.css`).
 */
export const OS_NATIVE_CHROME_SKIP_CLASS = "os-native-chrome-skip";

/**
 * macOS Aqua: wrap shell UI that sits outside `WindowFrame` (desktop, portaled
 * dialogs) so body copy uses `--os-typography-window` without global `div`/`p`
 * rules (see `themes.css`).
 */
export const OS_SHELL_TEXT_SCALE_CLASS = "os-shell-text-scale";
