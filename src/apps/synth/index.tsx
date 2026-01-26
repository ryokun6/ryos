import { BaseApp } from "../base/types";
import { SynthAppComponent } from "./components/SynthAppComponent";

export const helpItems = [
  {
    icon: "🎹",
    title: "Virtual Keyboard",
    description: "Play notes with on-screen keys or computer keyboard",
  },
  {
    icon: "🎛️",
    title: "Controls Panel",
    description: "Toggle CONTROLS to tweak oscillators, envelope & effects",
  },
  {
    icon: "🔊",
    title: "Presets",
    description: "Save, load & manage custom sound presets",
  },
  {
    icon: "🌈",
    title: "3D Waveform",
    description: "Live animated waveform when controls panel is open",
  },
  {
    icon: "🎚️",
    title: "Effects",
    description: "Reverb, delay, distortion, chorus, phaser & bit-crusher",
  },
  {
    icon: "🎵",
    title: "Octave Shift",
    description: "Use -/+ keys or buttons to shift octaves up or down",
  },
];

export const appMetadata = {
  name: "Synth",
  version: "0.1",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/synth.png",
};

export const SynthApp: BaseApp = {
  id: "synth",
  name: "Synth",
  icon: { type: "image", src: appMetadata.icon },
  description: "A virtual synthesizer with retro aesthetics",
  component: SynthAppComponent,
  helpItems,
  metadata: appMetadata,
};
