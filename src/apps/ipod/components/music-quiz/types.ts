import type { Track } from "@/stores/useIpodStore";

export interface MusicQuizRound {
  correctIndex: number;
  options: Track[];
  startSec: number;
  selectedIndex: number | null;
  isCorrect: boolean | null;
}

export type Phase =
  | "idle"
  | "awaitingStart"
  | "loading"
  | "starting"
  | "playing"
  | "feedback"
  | "finished";

export interface QuizUiState {
  phase: Phase;
  round: MusicQuizRound | null;
  roundNumber: number;
  score: number;
  lastRoundPoints: number;
  selectedIndex: number;
  isPlayerReady: boolean;
}

export type QuizUiAction =
  | { type: "setPhase"; value: Phase }
  | {
      type: "setRound";
      value:
        | MusicQuizRound
        | null
        | ((prev: MusicQuizRound | null) => MusicQuizRound | null);
    }
  | { type: "setRoundNumber"; value: number | ((prev: number) => number) }
  | { type: "setScore"; value: number | ((prev: number) => number) }
  | { type: "setLastRoundPoints"; value: number }
  | { type: "setSelectedIndex"; value: number | ((prev: number) => number) }
  | { type: "setIsPlayerReady"; value: boolean };

export interface MusicQuizRef {
  navigate: (direction: "next" | "previous") => boolean;
  selectCurrent: () => void;
  replaySnippet: () => void;
}

export interface MusicQuizProps {
  isVisible: boolean;
  onExit: () => void;
  lcdFilterOn?: boolean;
  backlightOn?: boolean;
  onEnter?: () => void;
  playClick?: () => void;
  playScroll?: () => void;
  vibrate?: () => void;
}
