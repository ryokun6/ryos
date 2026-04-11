import { AbsoluteFill, OffthreadVideo, Sequence, staticFile } from "remotion";
import {
  CLIP_DURATION,
  TITLE_DURATION,
  type FeatureClip,
} from "./features";
import { TitleCard } from "./TitleCard";

type FeatureSegmentProps = {
  feature: FeatureClip;
  startFrame: number;
};

export function FeatureSegment({ feature, startFrame }: FeatureSegmentProps) {
  const src = staticFile(`clips/${feature.file}`);

  return (
    <>
      <Sequence from={startFrame} durationInFrames={TITLE_DURATION}>
        <TitleCard title={feature.title} subtitle={feature.subtitle} />
      </Sequence>
      <Sequence
        from={startFrame + TITLE_DURATION}
        durationInFrames={CLIP_DURATION}
      >
        <AbsoluteFill style={{ backgroundColor: "#000" }}>
          <OffthreadVideo
            src={src}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
            muted
          />
        </AbsoluteFill>
      </Sequence>
    </>
  );
}
