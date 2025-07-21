import React, { createContext, useEffect, useState, useContext } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useSound } from "@/hooks/useSound";

// Create a context to share spray sound functionality
interface SpraySoundContextType {
  playSpraySound: () => void;
  stopSpraySound: () => void;
  playShakeToolSound: () => void;
  stopShakeToolSound: () => void;
}

export const SpraySoundContext = createContext<SpraySoundContextType>({
  playSpraySound: () => {},
  stopSpraySound: () => {},
  playShakeToolSound: () => {},
  stopShakeToolSound: () => {},
});

interface PaintToolbarProps {
  selectedTool: string;
  onToolSelect: (tool: string) => void;
}

const tools = [
  // Selection tools
  { id: "select", icon: "/icons/macpaint/lasso.png", label: "Select" },
  {
    id: "rect-select",
    icon: "/icons/macpaint/select.png",
    label: "Rectangle Select",
  },

  // Text and eraser
  { id: "hand", icon: "/icons/macpaint/hand.png", label: "Hand" },

  { id: "text", icon: "/icons/macpaint/text.png", label: "Text" },

  // Fill and spray
  { id: "bucket", icon: "/icons/macpaint/bucket.png", label: "Fill Color" },
  { id: "spray", icon: "/icons/macpaint/spray.png", label: "Spray" },
  { id: "shake", icon: "/icons/macpaint/dots.png", label: "Shake" },

  // Drawing tools
  { id: "brush", icon: "/icons/macpaint/brush.png", label: "Brush" },
  { id: "pencil", icon: "/icons/macpaint/pencil.png", label: "Pencil" },

  // Shapes
  { id: "line", icon: "/icons/macpaint/line.png", label: "Line" },
  { id: "eraser", icon: "/icons/macpaint/eraser.png", label: "Eraser" },

  {
    id: "rectangle",
    icon: "/icons/macpaint/rectangle.png",
    label: "Rectangle",
  },
  { id: "oval", icon: "/icons/macpaint/oval.png", label: "Oval" },
];

// Define the keyframes and animation class in the CSS
const shakeKeyframes = `
  @keyframes shake {
    0% { transform: rotate(0deg); }
    5% { transform: rotate(-8deg); }
    10% { transform: rotate(0deg); }
    15% { transform: rotate(8deg); }
    20% { transform: rotate(0deg); }
    25% { transform: rotate(-8deg); }
    30% { transform: rotate(0deg); }
    35% { transform: rotate(8deg); }
    40% { transform: rotate(0deg); }
    45% { transform: rotate(-8deg); }
    50% { transform: rotate(0deg); }
    55% { transform: rotate(8deg); }
    60% { transform: rotate(0deg); }
    65% { transform: rotate(-8deg); }
    70% { transform: rotate(0deg); }
    75% { transform: rotate(8deg); }
    80% { transform: rotate(0deg); }
    85% { transform: rotate(-8deg); }
    90% { transform: rotate(0deg); }
    95% { transform: rotate(5deg); }
    100% { transform: rotate(0deg); }
  }
`;

// Add the keyframes to the document
const addKeyframesToHead = () => {
  if (typeof document !== "undefined") {
    const styleElement = document.createElement("style");
    styleElement.appendChild(document.createTextNode(shakeKeyframes));
    document.head.appendChild(styleElement);
    return () => {
      document.head.removeChild(styleElement);
    };
  }
  return () => {};
};

// Provider component to wrap the application with sound functionality
export const SpraySoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Use the shake sound for when selecting the tool
  const { play: playShakeSound } = useSound("/sounds/shake.wav", 0.3);
  
  // Use the spray sound while drawing
  const { 
    play: playSpraySound, 
    stop: stopSpraySound 
  } = useSound("/sounds/spray.wav", 0.2);
  
  // Use the shake sound for the shake tool while drawing
  const {
    play: playShakeToolSound,
    stop: stopShakeToolSound
  } = useSound("/sounds/shake.wav", 0.15);

  return (
    <SpraySoundContext.Provider value={{ playSpraySound, stopSpraySound, playShakeToolSound, stopShakeToolSound }}>
      {children}
    </SpraySoundContext.Provider>
  );
};

// Custom hook to use the spray sound
export const useSpraySound = () => useContext(SpraySoundContext);

export const PaintToolbar: React.FC<PaintToolbarProps> = ({
  selectedTool,
  onToolSelect,
}) => {
  const [shakeSprayCan, setShakeSprayCan] = useState(false);
  
  // Use the shake.wav sound file for the spray can
  const { play: playShakeSound } = useSound("/sounds/shake.wav", 0.3);

  // Add keyframes to the document on mount
  useEffect(() => {
    const cleanup = addKeyframesToHead();
    return cleanup;
  }, []);

  // Trigger shake animation when spray or shake tool is selected
  useEffect(() => {
    if (selectedTool === "spray" || selectedTool === "shake") {
      setShakeSprayCan(true);
      // Play the spray can shake sound
      playShakeSound();
      const timer = setTimeout(() => {
        setShakeSprayCan(false);
      }, 400); // Animation duration increased to 400ms
      return () => clearTimeout(timer);
    }
  }, [selectedTool, playShakeSound]);

  const handleToolSelect = (toolId: string) => {
    onToolSelect(toolId);
    // If selecting the spray can, we don't need to do anything extra here
    // as the useEffect will handle the animation and sound
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-2 gap-0">
        {tools.map((tool) => (
          <Tooltip key={tool.id}>
            <TooltipTrigger asChild>
              <Button
                variant={selectedTool === tool.id ? "secondary" : "ghost"}
                className={`p-1 border-1 transition-none ${
                  selectedTool === tool.id ? "invert border-white" : ""
                }`}
                onClick={() => handleToolSelect(tool.id)}
              >
                <img
                  src={tool.icon}
                  alt={tool.label}
                  className={`w-[36px] h-[36px] object-contain mix-blend-multiply ${
                    (tool.id === "spray" || tool.id === "shake") && shakeSprayCan ? "animate-[shake_0.4s_ease-in-out]" : ""
                  }`}
                  style={
                    (tool.id === "spray" || tool.id === "shake") && shakeSprayCan
                      ? { animation: "shake 0.4s ease-in-out" }
                      : {}
                  }
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={2}>
              <p>{tool.label}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
};
