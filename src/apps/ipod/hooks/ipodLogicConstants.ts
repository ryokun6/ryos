/** Shared constants for iPod logic hooks. */
export const UA = typeof navigator !== "undefined" ? navigator.userAgent : "";
export const IS_IOS = /iP(hone|od|ad)/.test(UA);
export const IS_SAFARI =
  /Safari/.test(UA) && !/Chrome/.test(UA) && !/CriOS/.test(UA);
export const IS_IOS_SAFARI = IS_IOS && IS_SAFARI;

/** Stable fallback so \`rebuildMenuItems\` never returns a fresh \`[]\` per call. */
export const EMPTY_IPOD_MENU_ITEMS: import("../types").MenuItem[] = [];
export const BACKLIGHT_TIMEOUT_BY_SETTING: Record<
  Exclude<import("@/stores/useIpodStore").IpodBacklightTimeout, "off" | "always-on">,
  number
> = {
  "2s": 2000,
  "10s": 10000,
};
