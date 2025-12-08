export { Starfield } from "./Starfield";
export { FlyingToasters } from "./FlyingToasters";
export { Matrix } from "./Matrix";
export { BouncingLogo } from "./BouncingLogo";
export { Pipes } from "./Pipes";
export { Maze } from "./Maze";
export { ScreenSaverOverlay } from "./ScreenSaverOverlay";

export const SCREEN_SAVER_OPTIONS = [
  { id: "starfield", name: "Starfield", description: "Classic star warp effect" },
  { id: "flying-toasters", name: "Flying Toasters", description: "After Dark classic" },
  { id: "matrix", name: "Matrix", description: "Digital rain effect" },
  { id: "bouncing-logo", name: "Bouncing Logo", description: "DVD-style bouncing" },
  { id: "pipes", name: "3D Pipes", description: "Windows 3D pipes" },
  { id: "maze", name: "3D Maze", description: "First-person maze walker" },
] as const;

export type ScreenSaverType = typeof SCREEN_SAVER_OPTIONS[number]["id"];
