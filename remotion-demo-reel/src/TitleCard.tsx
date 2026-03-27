import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

type TitleCardProps = {
  title: string;
  subtitle: string;
};

export function TitleCard({ title, subtitle }: TitleCardProps) {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [0, 18], [24, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(145deg, #0a0a12 0%, #1a1a2e 45%, #16213e 100%)",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          opacity,
          transform: `translateY(${y}px)`,
          textAlign: "center",
          maxWidth: 1200,
          padding: 48,
        }}
      >
        <div
          style={{
            fontSize: 28,
            letterSpacing: "0.35em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.45)",
            marginBottom: 16,
          }}
        >
          ryOS · March 2026
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 96,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.05,
            textShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          {title}
        </h1>
        <p
          style={{
            marginTop: 28,
            fontSize: 36,
            color: "rgba(255,255,255,0.82)",
            lineHeight: 1.35,
          }}
        >
          {subtitle}
        </p>
      </div>
    </AbsoluteFill>
  );
}
