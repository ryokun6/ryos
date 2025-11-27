import React from "react";

export interface ScreenSaver {
  id: string;
  name: string;
  component: React.ComponentType<{ preview?: boolean }>;
  description?: string;
}

export const SCREEN_SAVERS: Record<string, ScreenSaver> = {};

export const registerScreenSaver = (saver: ScreenSaver) => {
  SCREEN_SAVERS[saver.id] = saver;
};

export const getScreenSaver = (id: string) => SCREEN_SAVERS[id];

export const getAllScreenSavers = () => Object.values(SCREEN_SAVERS);

// Import built-in screen savers
import { StarfieldScreenSaver } from "../components/screensavers/StarfieldScreenSaver";
import { PipesScreenSaver } from "../components/screensavers/PipesScreenSaver";
import { MystifyScreenSaver } from "../components/screensavers/MystifyScreenSaver";

// Register built-in screen savers
registerScreenSaver({
  id: "starfield",
  name: "Starfield",
  component: StarfieldScreenSaver,
  description: "Classic 3D flying stars simulation",
});

registerScreenSaver({
  id: "pipes",
  name: "Pipes",
  component: PipesScreenSaver,
  description: "Procedural 3D pipes weaving through space",
});

registerScreenSaver({
  id: "mystify",
  name: "Mystify Your Mind",
  component: MystifyScreenSaver,
  description: "Geometric shapes drifting and morphing",
});

