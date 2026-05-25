import React from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface PaintPatternPaletteProps {
  selectedPattern: string;
  onPatternSelect: (pattern: string) => void;
}

export const PaintPatternPalette: React.FC<PaintPatternPaletteProps> = ({
  selectedPattern,
  onPatternSelect,
}) => {
  // Generate pattern numbers from 1 to 38
  const patterns = Array.from({ length: 38 }, (_, i) => i + 1);

  return (
    <ScrollArea className="w-full h-[72px]">
      <div className="grid grid-flow-col auto-cols-[28px] grid-rows-2 gap-0 h-full">
        {patterns.map((num) => (
          <button
            key={num}
            className={` hover:opacity-70 border-1 border-black ${
              selectedPattern === `pattern-${num}` ? "" : "border-neutral-800"
            }`}
            onClick={() => onPatternSelect(`pattern-${num}`)}
          >
            <img
              src={`/patterns/Property 1=${num}.svg`}
              alt={`Pattern ${num}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
};
