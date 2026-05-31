import { createPortal } from "react-dom";
import { motion } from "framer-motion";

export interface WindowFrameSnapZoneIndicatorProps {
  snapZone: string | null | undefined;
  snapZoneStyle: {
    top: number;
    left: number;
    width: number;
    height: number;
  } | null;
  isForeground: boolean;
  isMacOSTheme: boolean;
}

export function WindowFrameSnapZoneIndicator({
  snapZone,
  snapZoneStyle,
  isForeground,
  isMacOSTheme,
}: WindowFrameSnapZoneIndicatorProps) {
  if (!snapZone || !snapZoneStyle || !isForeground) {
    return null;
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed pointer-events-none z-[9999]"
      style={{
        top: snapZoneStyle.top,
        left: snapZoneStyle.left,
        width: snapZoneStyle.width,
        height: snapZoneStyle.height,
        padding: 8,
      }}
    >
      <div
        className="size-full"
        style={{
          border: "3px solid rgba(255, 255, 255, 0.8)",
          backgroundColor: "rgba(255, 255, 255, 0.1)",
          boxShadow: "0 0 20px rgba(255, 255, 255, 0.3), inset 0 0 20px rgba(255, 255, 255, 0.1)",
          borderRadius: isMacOSTheme ? 12 : 4,
        }}
      />
    </motion.div>,
    document.body
  );
}
