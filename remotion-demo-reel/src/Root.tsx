import { Composition } from "remotion";
import { March2026DemoReel } from "./March2026DemoReel";
import { FPS, TOTAL_FRAMES } from "./features";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="March2026DemoReel"
        component={March2026DemoReel}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
}
