import { useLayoutEffect, useRef, useState } from "react";

/**
 * When delay dots leave the screen, bump a presence epoch so the lyric list
 * remounts instead of letting Motion play exit/layout animations over the
 * incoming line.
 *
 * `skipEnter` is true only for the commit that paints that remount. The new
 * line is already the settled row; an enter from y/scale would overlap it
 * for a frame. Later line changes in the same epoch still animate.
 */
export function useInterludeHandoffEpoch(interludeOnScreen: boolean): {
  epoch: number;
  skipEnter: boolean;
} {
  const [epoch, setEpoch] = useState(0);
  const [dotsWereOnScreen, setDotsWereOnScreen] = useState(interludeOnScreen);
  const paintedEpochRef = useRef(0);

  if (dotsWereOnScreen !== interludeOnScreen) {
    setDotsWereOnScreen(interludeOnScreen);
    if (dotsWereOnScreen && !interludeOnScreen) {
      setEpoch((current) => current + 1);
    }
  }

  const skipEnter = epoch > 0 && paintedEpochRef.current !== epoch;
  useLayoutEffect(() => {
    paintedEpochRef.current = epoch;
  }, [epoch]);

  return { epoch, skipEnter };
}
