interface CoverFlowReflectiveFloorProps {
  isModernIpodCoverFlow: boolean;
}

export function CoverFlowReflectiveFloor({
  isModernIpodCoverFlow,
}: CoverFlowReflectiveFloorProps) {
  return (
    <div
      className="absolute inset-0"
      style={{
        background: isModernIpodCoverFlow
          ? "linear-gradient(to bottom, transparent 55%, rgba(0,0,0,0.06) 78%, rgba(0,0,0,0.12) 100%)"
          : "linear-gradient(to bottom, transparent 40%, rgba(38,38,38,0.5) 70%, rgba(64,64,64,0.3) 100%)",
        pointerEvents: "none",
      }}
    />
  );
}
