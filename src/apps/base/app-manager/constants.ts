import type { SwitcherState } from "./types";

export const BASE_Z_INDEX = 1;

export const switcherInitialState: SwitcherState = {
  visible: false,
  apps: [],
  index: 0,
};
