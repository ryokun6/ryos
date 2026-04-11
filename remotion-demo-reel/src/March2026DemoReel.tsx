import { AbsoluteFill, Series } from "remotion";
import {
  CLIP_DURATION,
  MARCH_2026_FEATURES,
  TITLE_DURATION,
} from "./features";
import { FeatureSegment } from "./FeatureSegment";

const segmentFrames = TITLE_DURATION + CLIP_DURATION;

export function March2026DemoReel() {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Series>
        {MARCH_2026_FEATURES.map((feature) => (
          <Series.Sequence key={feature.id} durationInFrames={segmentFrames}>
            <FeatureSegment feature={feature} startFrame={0} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
}
