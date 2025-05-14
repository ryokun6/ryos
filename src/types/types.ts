import WaveSurfer from "wavesurfer.js";

export interface SoundSlot {
  audioData: string | null;
  waveform?: WaveSurfer;
  emoji?: string;
  title?: string;
}

export interface PlaybackState {
  isRecording: boolean;
  isPlaying: boolean;
}

export interface Soundboard {
  id: string;
  name: string;
  slots: SoundSlot[];
}

export interface WindowPosition {
  x: number;
  y: number;
}

export interface WindowSize {
  width: number;
  height: number;
}

export interface DialogState {
  type: "emoji" | "title" | null;
  isOpen: boolean;
  slotIndex: number;
  value: string;
}

export type ResizeType = "" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface ResizeStart {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  top: number;
}

// window snap zone type
export type SnapZone = "none" | "top" | "left" | "right";
