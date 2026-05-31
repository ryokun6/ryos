import { useSound, Sounds } from "@/hooks/useSound";

export function useHtmlPreviewSounds(
  propMaximizeSound?: { play: () => void },
  propMinimizeSound?: { play: () => void }
) {
  const localMaximizeSound = useSound(Sounds.WINDOW_EXPAND);
  const localMinimizeSound = useSound(Sounds.WINDOW_COLLAPSE);

  return {
    maximizeSound: propMaximizeSound || localMaximizeSound,
    minimizeSound: propMinimizeSound || localMinimizeSound,
  };
}
