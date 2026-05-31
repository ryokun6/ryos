import { useMusicQuiz } from "./useMusicQuiz";
import { MusicQuizView } from "./MusicQuizView";
import type { MusicQuizProps, MusicQuizRef } from "./types";

export const MusicQuiz = function MusicQuiz(
  {
    ref,
    isVisible,
    lcdFilterOn = false,
    backlightOn = true,
    ...rest
  }: MusicQuizProps & {
    ref?: React.Ref<MusicQuizRef>;
  }
) {
  const viewModel = useMusicQuiz({
    ref,
    isVisible,
    lcdFilterOn,
    backlightOn,
    ...rest,
  });

  if (!isVisible) return null;

  return (
    <MusicQuizView
      {...viewModel}
      lcdFilterOn={lcdFilterOn}
      backlightOn={backlightOn}
    />
  );
};
