import { useBrickGame } from "./useBrickGame";
import { BrickGameView } from "./BrickGameView";
import type { BrickGameProps, BrickGameRef } from "./types";

export const BrickGame = function BrickGame({
  ref,
  isVisible,
  lcdFilterOn = false,
  backlightOn = true,
  ...rest
}: BrickGameProps & { ref?: React.Ref<BrickGameRef> }) {
  const viewModel = useBrickGame({ ref, isVisible, lcdFilterOn, backlightOn, ...rest });
  if (!isVisible) return null;
  return <BrickGameView {...viewModel} />;
};
