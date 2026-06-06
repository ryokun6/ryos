import { cn } from "@/lib/utils";
import {
  IPOD_DEVICE_BASE_HEIGHT_PX,
  IPOD_DEVICE_BASE_WIDTH_PX,
} from "../../constants";
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
      className="ipod-force-font flex flex-col items-center justify-center w-full h-full bg-gradient-to-b from-neutral-100/20 to-neutral-300/20 backdrop-blur-lg p-4 select-none"
      style={{ position: "relative", overflow: "hidden", contain: "layout style paint" }}
    >
      <div
        className="relative shrink-0"
        style={{
          width: IPOD_DEVICE_BASE_WIDTH_PX * scale,
          height: IPOD_DEVICE_BASE_HEIGHT_PX * scale,
        }}
      >
        <div
          className={cn(
            "ipod-force-font absolute top-0 left-0 rounded-2xl shadow-xl border border-black/40 flex flex-col items-center p-4 pb-8",
            theme === "classic" ? "bg-white/85" : "bg-black/85"
          )}
          style={{
            width: IPOD_DEVICE_BASE_WIDTH_PX,
            height: IPOD_DEVICE_BASE_HEIGHT_PX,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            transition: "transform 0.2s ease",
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
    </div>
  );
}
