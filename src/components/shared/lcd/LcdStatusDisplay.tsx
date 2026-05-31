import { memo } from "react";
import { STATUS_TEXT_STROKE_STYLE } from "./lcdMotionConstants";

export const LcdStatusDisplay = memo(function LcdStatusDisplay({
  message,
}: {
  message: string;
}) {
  return (
    <div className="relative videos-status">
      <div className="font-geneva-12 text-white text-xl relative z-10">
        {message}
      </div>
      <div
        className="font-geneva-12 text-black text-xl absolute inset-0"
        style={STATUS_TEXT_STROKE_STYLE}
      >
        {message}
      </div>
    </div>
  );
});
