import { useState, useEffect, useRef, useCallback } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useAppStoreShallow } from "@/stores/helpers";
import { SCREEN_SAVER_OPTIONS, type ScreenSaverType } from "@/components/screensavers";
import { useTranslation } from "react-i18next";

// Map screen saver id to translation key
const screenSaverTranslationKeys: Record<ScreenSaverType, string> = {
  "starfield": "starfield",
  "flying-toasters": "flyingToasters",
  "matrix": "matrix",
  "bouncing-logo": "bouncingLogo",
  "pipes": "pipes",
  "maze": "maze",
};

// Preview component that renders a tiny version of the screen saver
function ScreenSaverPreview({ type }: { type: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let frame = 0;

    // Simple preview animations based on type
    const drawPreview = () => {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      switch (type) {
        case "starfield": {
          // Draw simple stars
          ctx.fillStyle = "white";
          for (let i = 0; i < 20; i++) {
            const x = ((i * 13 + frame) % canvas.width);
            const y = ((i * 7) % canvas.height);
            const size = 1 + (frame + i) % 3;
            ctx.fillRect(x, y, size, size);
          }
          break;
        }
        case "flying-toasters": {
          ctx.fillStyle = "#000020";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // Draw simple toaster shapes
          ctx.fillStyle = "#C0C0C0";
          for (let i = 0; i < 3; i++) {
            const x = ((canvas.width + 20) - (frame * 2 + i * 40) % (canvas.width + 40)) - 20;
            const y = (frame + i * 30) % canvas.height;
            ctx.fillRect(x, y, 15, 10);
            // Wings
            ctx.fillStyle = "#FFFFFF";
            const wingY = frame % 10 < 5 ? y - 3 : y + 3;
            ctx.fillRect(x - 5, wingY, 5, 3);
            ctx.fillRect(x + 15, wingY, 5, 3);
            ctx.fillStyle = "#C0C0C0";
          }
          break;
        }
        case "matrix": {
          ctx.fillStyle = "#0F0";
          ctx.font = "8px monospace";
          for (let i = 0; i < 8; i++) {
            const x = i * 12;
            const y = ((frame * 2 + i * 10) % (canvas.height + 20)) - 10;
            ctx.fillText(String.fromCharCode(0x30A0 + Math.random() * 96), x, y);
          }
          break;
        }
        case "bouncing-logo": {
          const x = Math.abs(((frame * 2) % (canvas.width * 2)) - canvas.width);
          const y = Math.abs(((frame * 1.5) % (canvas.height * 2)) - canvas.height);
          ctx.fillStyle = `hsl(${frame * 5 % 360}, 100%, 50%)`;
          ctx.font = "bold 12px sans-serif";
          ctx.fillText("ryOS", x - 15, y + 5);
          break;
        }
        case "pipes": {
          const colors = ["#FF4444", "#44FF44", "#4444FF", "#FFFF44"];
          for (let i = 0; i < 3; i++) {
            ctx.strokeStyle = colors[i % colors.length];
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(10 + i * 20, (frame + i * 20) % canvas.height);
            ctx.lineTo(30 + i * 20, ((frame + 20) + i * 20) % canvas.height);
            ctx.lineTo(50 + i * 10, ((frame + 40) + i * 20) % canvas.height);
            ctx.stroke();
          }
          break;
        }
        case "maze": {
          // Simple corridor effect
          ctx.strokeStyle = "#3366FF";
          ctx.lineWidth = 1;
          const depth = 5;
          for (let d = 0; d < depth; d++) {
            const scale = 1 - d * 0.15;
            const offset = (1 - scale) / 2;
            ctx.strokeRect(
              canvas.width * offset,
              canvas.height * offset,
              canvas.width * scale,
              canvas.height * scale
            );
          }
          break;
        }
      }

      frame++;
      animationId = requestAnimationFrame(drawPreview);
    };

    drawPreview();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [type]);

  return (
    <canvas
      ref={canvasRef}
      width={100}
      height={75}
      className="rounded border border-gray-600"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

interface ScreenSaverPickerProps {
  onPreview?: () => void;
}

export function ScreenSaverPicker({ onPreview }: ScreenSaverPickerProps) {
  const { t } = useTranslation();
  const {
    screenSaverEnabled,
    setScreenSaverEnabled,
    screenSaverType,
    setScreenSaverType,
    screenSaverIdleTime,
    setScreenSaverIdleTime,
  } = useAppStoreShallow((s) => ({
    screenSaverEnabled: s.screenSaverEnabled,
    setScreenSaverEnabled: s.setScreenSaverEnabled,
    screenSaverType: s.screenSaverType,
    setScreenSaverType: s.setScreenSaverType,
    screenSaverIdleTime: s.screenSaverIdleTime,
    setScreenSaverIdleTime: s.setScreenSaverIdleTime,
  }));

  const [isPreviewActive, setIsPreviewActive] = useState(false);

  const handlePreview = useCallback(() => {
    // Dispatch event to trigger screen saver preview
    window.dispatchEvent(new CustomEvent("screenSaverPreview", { detail: { type: screenSaverType } }));
    setIsPreviewActive(true);
    if (onPreview) onPreview();
  }, [screenSaverType, onPreview]);

  // Listen for screen saver dismiss
  useEffect(() => {
    const handleDismiss = () => setIsPreviewActive(false);
    window.addEventListener("screenSaverDismiss", handleDismiss);
    return () => window.removeEventListener("screenSaverDismiss", handleDismiss);
  }, []);

  const selectedOption = SCREEN_SAVER_OPTIONS.find((opt) => opt.id === screenSaverType);

  return (
    <div className="space-y-4">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <Label>{t("apps.control-panels.screenSaver")}</Label>
          <Label className="text-[11px] text-gray-600 font-geneva-12">
            {t("apps.control-panels.screenSaverDescription")}
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
          {/* Screen Saver Type Selection */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <ScreenSaverPreview type={screenSaverType} />
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <Label className="text-[11px] mb-1 block">{t("apps.control-panels.screenSaverType")}</Label>
                <Select
                  value={screenSaverType}
                  onValueChange={setScreenSaverType}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("apps.control-panels.selectScreenSaver")} />
                  </SelectTrigger>
                  <SelectContent>
                    {SCREEN_SAVER_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {t(`apps.control-panels.screenSaverOptions.${screenSaverTranslationKeys[option.id]}.name`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedOption && (
                <p className="text-[11px] text-gray-600 font-geneva-12">
                  {t(`apps.control-panels.screenSaverOptions.${screenSaverTranslationKeys[selectedOption.id]}.description`)}
                </p>
              )}
            </div>
          </div>

          {/* Idle Time Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">{t("apps.control-panels.startAfter")}</Label>
              <span className="text-[11px] text-gray-600 font-geneva-12">
                {screenSaverIdleTime} {screenSaverIdleTime === 1 ? t("apps.control-panels.minute") : t("apps.control-panels.minutes")}
              </span>
            </div>
            <Slider
              value={[screenSaverIdleTime]}
              onValueChange={([value]) => setScreenSaverIdleTime(value)}
              min={1}
              max={30}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-gray-500 font-geneva-12">
              <span>1 {t("apps.control-panels.min")}</span>
              <span>30 {t("apps.control-panels.min")}</span>
            </div>
          </div>

          {/* Preview Button */}
          <Button
            variant="retro"
            onClick={handlePreview}
            disabled={isPreviewActive}
            className="w-full"
          >
            {isPreviewActive ? t("apps.control-panels.previewActive") : t("apps.control-panels.preview")}
          </Button>
        </>
      )}
    </div>
  );
}
