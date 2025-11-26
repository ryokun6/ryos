import { useState } from "react";
import { useAppStore } from "@/stores/useAppStore";
import { getAllScreenSavers } from "@/utils/screenSavers";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScreenSaverOverlay } from "@/components/screensavers/ScreenSaverOverlay";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

export function ScreenSaverPicker() {
  const {
    screenSaverId,
    setScreenSaverId,
    screenSaverEnabled,
    setScreenSaverEnabled,
    screenSaverTimeout,
    setScreenSaverTimeout,
  } = useAppStore();

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const screenSavers = getAllScreenSavers();

  const selectedSaver = screenSavers.find((s) => s.id === screenSaverId);

  return (
    <div className="space-y-6 h-full p-1">
      {/* Main Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Label>Enable Screen Saver</Label>
          <Label className="text-[11px] text-gray-600 font-geneva-12">
            Automatically start screen saver when idle
          </Label>
        </div>
        <Switch
          checked={screenSaverEnabled}
          onCheckedChange={setScreenSaverEnabled}
          className="data-[state=checked]:bg-[#000000]"
        />
      </div>

      {screenSaverEnabled && (
        <>
          <div className="space-y-4 border rounded-md p-4 bg-white/50">
            {/* Saver Selection */}
            <div className="flex flex-col gap-2">
              <Label>Screen Saver</Label>
              <div className="flex gap-2">
                <Select
                  value={screenSaverId}
                  onValueChange={setScreenSaverId}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select Screen Saver">
                      {selectedSaver?.name || "Select"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {screenSavers.map((saver) => (
                      <SelectItem key={saver.id} value={saver.id}>
                        {saver.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  variant="retro" 
                  onClick={() => setIsPreviewOpen(true)}
                  disabled={!selectedSaver}
                >
                  Preview
                </Button>
              </div>
              {selectedSaver?.description && (
                <p className="text-[11px] text-gray-500 font-geneva-12 mt-1">
                  {selectedSaver.description}
                </p>
              )}
            </div>

            {/* Timeout Slider */}
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex justify-between">
                <Label>Start after</Label>
                <span className="text-xs font-mono">{screenSaverTimeout} min</span>
              </div>
              <Slider
                value={[screenSaverTimeout]}
                onValueChange={(vals) => setScreenSaverTimeout(vals[0])}
                min={1}
                max={60}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </>
      )}

      {/* Preview Overlay */}
      {isPreviewOpen && (
        <ScreenSaverOverlay 
          previewMode={true} 
          onExitPreview={() => setIsPreviewOpen(false)} 
        />
      )}
    </div>
  );
}

