import { useState, useRef } from "react";
import type { MusicQuizRef } from "../components/music-quiz/types";
import type { BrickGameRef } from "../components/brick-game/types";

export function useIpodGames() {
    // Music Quiz state
    const [isMusicQuizOpen, setIsMusicQuizOpen] = useState(false);
    const wasPlayingBeforeQuizRef = useRef(false);

    // Brick Game state
    const [isBrickGameOpen, setIsBrickGameOpen] = useState(false);
    const wasPlayingBeforeBrickGameRef = useRef(false);
    const musicQuizRef = useRef<MusicQuizRef | null>(null);
    const brickGameRef = useRef<BrickGameRef | null>(null);

  return {
    isMusicQuizOpen,
    setIsMusicQuizOpen,
    wasPlayingBeforeQuizRef,
    isBrickGameOpen,
    setIsBrickGameOpen,
    wasPlayingBeforeBrickGameRef,
    musicQuizRef,
    brickGameRef,
  };
}
