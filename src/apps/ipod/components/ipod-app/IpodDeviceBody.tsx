import { cn } from "@/lib/utils";
import { IpodWheel } from "../IpodWheel";
import { IpodScreenArea } from "./IpodScreenArea";
import type { IpodAppController } from "./useIpodAppController";

type IpodDeviceBodyProps = {
  c: IpodAppController;
};

export function IpodDeviceBody({ c }: IpodDeviceBodyProps) {
  const {
    containerRef,
    theme,
    scale,
    handleWheelClick,
    handleWheelRotation,
    handleMenuButton,
    handleCenterLongPress,
  } = c;

  return (
    <div
      ref={containerRef}
      className="ipod-device-surface ipod-force-font flex flex-col items-center justify-center w-full h-full p-4 select-none"
      style={{ position: "relative", overflow: "hidden", contain: "layout style paint" }}
    >
      <div
        className={cn(
          "ipod-force-font w-[250px] h-[400px] rounded-2xl shadow-xl border border-black/40 flex flex-col items-center p-4 pb-8",
          theme === "classic" ? "bg-white/85" : "bg-black/85"
        )}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center",
          transition: "transform 0.2s ease",
          minWidth: "250px",
          minHeight: "400px",
          maxWidth: "250px",
          maxHeight: "400px",
          contain: "layout style paint",
          willChange: "transform",
          backfaceVisibility: "hidden",
        }}
      >
        <IpodScreenArea c={c} />
        <IpodWheel
          theme={theme}
          onWheelClick={handleWheelClick}
          onWheelRotation={handleWheelRotation}
          onMenuButton={handleMenuButton}
          onCenterLongPress={handleCenterLongPress}
        />
      </div>
    </div>
  );
}
