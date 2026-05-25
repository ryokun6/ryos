import React from "react";
import { Slider } from "@/components/ui/slider";

interface PaintStrokeSettingsProps {
  strokeWidth: number;
  onStrokeWidthChange: (width: number) => void;
}

export const PaintStrokeSettings: React.FC<PaintStrokeSettingsProps> = ({
  strokeWidth,
  onStrokeWidthChange,
}) => {
  return (
    <div className="space-y-2 p-2 py-3 border-t border-neutral-200">
      <Slider
        value={[strokeWidth]}
        onValueChange={(value) => onStrokeWidthChange(value[0])}
        min={1}
        max={20}
        step={1}
        className="w-full"
      />
    </div>
  );
};
