// The host is dependency-light and always mounted; the heavy overlay
// (controller + cross-store search) is lazy-loaded on first open.
export { SpotlightSearchHost as SpotlightSearch } from "./spotlight-search/SpotlightSearchHost";
