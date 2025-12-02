import React from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";

interface PaintToolbarProps {
  selectedTool: string;
  onToolSelect: (tool: string) => void;
}

const toolKeys: Record<string, string> = {
  "select": "apps.paint.toolbar.select",
  "rect-select": "apps.paint.toolbar.rectangleSelect",
  "hand": "apps.paint.toolbar.hand",
  "text": "apps.paint.toolbar.text",
  "bucket": "apps.paint.toolbar.fillColor",
  "spray": "apps.paint.toolbar.spray",
  "brush": "apps.paint.toolbar.brush",
  "pencil": "apps.paint.toolbar.pencil",
  "line": "apps.paint.toolbar.line",
  "eraser": "apps.paint.toolbar.eraser",
  "rectangle": "apps.paint.toolbar.rectangle",
  "oval": "apps.paint.toolbar.oval",
};

const tools = [
  // Selection tools
  { id: "select", icon: "/icons/default/macpaint/lasso.png", labelKey: "select" },
  {
    id: "rect-select",
    icon: "/icons/default/macpaint/select.png",
    labelKey: "rect-select",
  },

  // Text and eraser
  { id: "hand", icon: "/icons/default/macpaint/hand.png", labelKey: "hand" },

  { id: "text", icon: "/icons/default/macpaint/text.png", labelKey: "text" },

  // Fill and spray
  {
    id: "bucket",
    icon: "/icons/default/macpaint/bucket.png",
    labelKey: "bucket",
  },
  { id: "spray", icon: "/icons/default/macpaint/spray.png", labelKey: "spray" },

  // Drawing tools
  { id: "brush", icon: "/icons/default/macpaint/brush.png", labelKey: "brush" },
  { id: "pencil", icon: "/icons/default/macpaint/pencil.png", labelKey: "pencil" },

  // Shapes
  { id: "line", icon: "/icons/default/macpaint/line.png", labelKey: "line" },
  { id: "eraser", icon: "/icons/default/macpaint/eraser.png", labelKey: "eraser" },

  {
    id: "rectangle",
    icon: "/icons/default/macpaint/rectangle.png",
    labelKey: "rectangle",
  },
  { id: "oval", icon: "/icons/default/macpaint/oval.png", labelKey: "oval" },
];

export const PaintToolbar: React.FC<PaintToolbarProps> = ({
  selectedTool,
  onToolSelect,
}) => {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isMacTheme = currentTheme === "macosx";

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-0">
        {tools.map((tool) => {
          const label = t(toolKeys[tool.labelKey]);
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={
                    isMacTheme
                      ? "outline"
                      : selectedTool === tool.id
                      ? "secondary"
                      : "ghost"
                  }
                  className={`p-1 border-1 transition-none ${
                    selectedTool === tool.id ? "invert border-white" : ""
                  }`}
                  onClick={() => onToolSelect(tool.id)}
                >
                  <img
                    src={tool.icon}
                    alt={label}
                    className="w-[36px] h-[36px] object-contain mix-blend-multiply"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={2}>
                <p>{label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};
