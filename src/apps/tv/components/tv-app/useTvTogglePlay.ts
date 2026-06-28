import { useCallback } from "react";

export function useTvTogglePlay({
  togglePlay,
}: {
  togglePlay: () => void;
}) {
  return useCallback(() => togglePlay(), [togglePlay]);
}
