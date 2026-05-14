import React from "react";
import { Button } from "@/components/ui/button";

interface PaintColorPaletteProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
}

const colors = [
  "#000000", // Black
  "#FFFFFF", // White
  "#808080", // Gray
  "#C0C0C0", // Light Gray
  "#800000", // Dark Red
  "#FF0000", // Red
  "#808000", // Olive
  "#FFFF00", // Yellow
  "#008000", // Dark Green
  "#00FF00", // Green
  "#008080", // Teal
  "#00FFFF", // Cyan
  "#000080", // Navy
  "#0000FF", // Blue
  "#800080", // Purple
  "#FF00FF", // Magenta
];

export const PaintColorPalette: React.FC<PaintColorPaletteProps> = ({
  selectedColor,
  onColorSelect,
}) => {
  return (
    <div className="grid grid-cols-2 gap-1 mt-2">
      {colors.map((color) => (
        <Button
          key={color}
          variant="ghost"
          className="size-10 p-0.5"
          onClick={() => onColorSelect(color)}
        >
          <div
            className={`size-full rounded-sm ${
              selectedColor === color ? "ring-2 ring-blue-500" : ""
            }`}
            style={{ backgroundColor: color }}
          />
        </Button>
      ))}
    </div>
  );
};
