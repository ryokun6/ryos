import { cn } from "@/lib/utils";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SynthAppController } from "./useSynthAppController";

type SynthPresetsToolbarProps = Pick<
  SynthAppController,
  | "t"
  | "presets"
  | "currentPreset"
  | "loadPreset"
  | "loadPresetById"
  | "handleOctaveDown"
  | "handleOctaveUp"
  | "toggleControls"
  | "isMacOSTheme"
  | "isSystem7Theme"
  | "isClassicTheme"
  | "isXpTheme"
>;

export function SynthPresetsToolbar({
  t,
  presets,
  currentPreset,
  loadPreset,
  loadPresetById,
  handleOctaveDown,
  handleOctaveUp,
  toggleControls,
  isMacOSTheme,
  isSystem7Theme,
  isClassicTheme,
  isXpTheme,
}: SynthPresetsToolbarProps) {
  return (
    <div
      className={cn(
        "px-2 py-3 pb-2 w-full z-[50] relative",
        isMacOSTheme
          ? "border-b border-black/10"
          : "bg-[#2a2a2a] border-b border-[#3a3a3a] os-toolbar-texture"
      )}
    >
      <div className="flex justify-between items-center">
        <div className="flex gap-0 items-center min-w-0">
          <div className="md:hidden flex-1 min-w-0 max-w-[min(100%,12rem)] sm:max-w-[min(100%,14rem)]">
            <Select value={currentPreset.id} onValueChange={loadPresetById}>
              <SelectTrigger
                className={cn(
                  "w-full min-w-0 h-[22px] font-geneva-12 text-[11px] leading-none px-2 py-0 gap-1 [&>span]:truncate",
                  isClassicTheme && "text-black bg-transparent",
                  !isClassicTheme && "bg-black border-[#3a3a3a] text-white"
                )}
              >
                <SelectValue placeholder={t("apps.synth.selectPreset")} />
              </SelectTrigger>
              <SelectContent
                className={cn(
                  isClassicTheme && "text-black",
                  !isClassicTheme && "bg-black border-[#3a3a3a] text-white"
                )}
              >
                {presets.map((preset) => (
                  <SelectItem
                    key={preset.id}
                    value={preset.id}
                    className={cn(
                      "font-geneva-12 text-[11px] select-none",
                      isClassicTheme && "text-black"
                    )}
                  >
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isMacOSTheme ? (
            <div className="hidden md:flex items-center min-w-0">
              <div className="metal-inset-btn-group">
                {presets.length > 0 ? (
                  presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="metal-inset-btn font-geneva-12 !text-[11px] whitespace-nowrap uppercase select-none"
                      data-state={
                        currentPreset.id === preset.id ? "on" : "off"
                      }
                      onClick={() => loadPreset(preset)}
                    >
                      {preset.name}
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-neutral-400 font-geneva-12 select-none px-2">
                    {t("apps.synth.noPresetsYet")}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="hidden md:flex gap-0">
              {presets.length > 0 ? (
                presets.map((preset) => (
                  <Button
                    key={preset.id}
                    variant={isSystem7Theme ? "player" : "default"}
                    data-state={currentPreset.id === preset.id ? "on" : "off"}
                    onClick={() => loadPreset(preset)}
                    className={cn(
                      "h-[22px] px-2 whitespace-nowrap uppercase select-none",
                      isXpTheme && "text-black"
                    )}
                  >
                    {preset.name}
                  </Button>
                ))
              ) : (
                <p className="text-xs text-neutral-400 font-geneva-12 select-none">
                  {t("apps.synth.noPresetsYet")}
                </p>
              )}
            </div>
          )}
        </div>
        {isMacOSTheme ? (
          <div className="metal-inset-btn-group">
            <button
              type="button"
              className="metal-inset-btn metal-inset-icon select-none"
              onClick={handleOctaveDown}
            >
              <CaretLeft weight="bold" className="size-3" />
            </button>
            <button
              type="button"
              className="metal-inset-btn metal-inset-icon select-none"
              onClick={handleOctaveUp}
            >
              <CaretRight weight="bold" className="size-3" />
            </button>
            <button
              type="button"
              className="metal-inset-btn font-geneva-12 !text-[11px] select-none"
              onClick={toggleControls}
            >
              {t("apps.synth.controls")}
            </button>
          </div>
        ) : (
          <div className="flex gap-0">
            <Button
              variant={isSystem7Theme ? "player" : "default"}
              onClick={handleOctaveDown}
              className={cn("h-[22px] px-2 select-none", isXpTheme && "text-black")}
            >
              <CaretLeft weight="bold" className="size-3" />
            </Button>
            <Button
              variant={isSystem7Theme ? "player" : "default"}
              onClick={handleOctaveUp}
              className={cn("h-[22px] px-2 select-none", isXpTheme && "text-black")}
            >
              <CaretRight weight="bold" className="size-3" />
            </Button>
            <Button
              variant={isSystem7Theme ? "player" : "default"}
              onClick={toggleControls}
              className={cn("h-[22px] px-2 select-none", isXpTheme && "text-black")}
            >
              {t("apps.synth.controls")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
