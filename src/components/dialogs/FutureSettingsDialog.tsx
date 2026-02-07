import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TIMELINE,
} from "@/stores/useInternetExplorerStore";
import { useInternetExplorerStoreShallow } from "@/stores/helpers";

interface FutureSettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const FutureSettingsDialog = ({
  isOpen,
  onOpenChange,
}: FutureSettingsDialogProps) => {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";
  const [selectedYear, setSelectedYear] = useState<string>("2030");
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  // Use the store directly
  const {
    timelineSettings,
    setTimelineSettings,
    year: currentYear,
  } = useInternetExplorerStoreShallow((state) => ({
    timelineSettings: state.timelineSettings,
    setTimelineSettings: state.setTimelineSettings,
    year: state.year,
  }));

  // Update selectedYear when dialog opens
  useEffect(() => {
    if (isOpen) {
      if (
        currentYear === "current" ||
        parseInt(currentYear) <= new Date().getFullYear()
      ) {
        setSelectedYear("2030");
      } else {
        setSelectedYear(currentYear);
      }
    }
  }, [isOpen, currentYear]);

  // Create a richer set of future years – covering near, mid, and far future
  const futureYears = [
    // Near‑future (every decade up to 2100)
    ...Array.from({ length: 8 }, (_, i) => (2030 + i * 10).toString()), // 2030 → 2100
    // Mid & far‑future milestones
    "2150",
    "2200",
    "2250",
    "2300",
    "2400",
    "2500",
    "2750",
    "3000",
  ].sort((a, b) => parseInt(b) - parseInt(a)); // Newest (largest) first

  // Get default timeline text for a year
  const getDefaultTimelineText = (year: string): string => {
    return (
      DEFAULT_TIMELINE[year] ||
      "2020s: Current era. AI assistants. Smart devices. Electric vehicles. Renewable energy. Space tourism. Digital transformation. Remote work. Virtual reality. Genetic medicine."
    );
  };

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
  };

  const handleReset = () => {
    const newSettings = { ...timelineSettings };
    delete newSettings[selectedYear]; // Remove custom text for this year
    setTimelineSettings(newSettings);
  };

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4" : "p-4 px-6"}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-gray-900",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            {t("apps.internet-explorer.year")}:
          </span>
          <Select value={selectedYear} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue
                placeholder={t("apps.internet-explorer.futureTimeline.selectYear")}
              />
            </SelectTrigger>
            <SelectContent>
              {futureYears.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={
            timelineSettings[selectedYear] ||
            getDefaultTimelineText(selectedYear)
          }
          onChange={(e) => {
            const newSettings = {
              ...timelineSettings,
              [selectedYear]: e.target.value,
            };
            setTimelineSettings(newSettings);
          }}
          placeholder={getDefaultTimelineText(selectedYear)}
          className={cn(
            "min-h-[200px]",
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
              : "font-geneva-12 text-[12px]"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "11px" : undefined,
          }}
        />
        <div className="flex justify-end gap-1">
          <Button
            variant="retro"
            onClick={handleReset}
            className={cn(
              "h-7",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            {t("apps.internet-explorer.futureTimeline.reset")}
          </Button>
          <Button
            variant={isMacTheme ? "default" : "retro"}
            onClick={() => onOpenChange(false)}
            ref={saveButtonRef}
            className={cn(
              !isMacTheme && "h-7",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
            }}
          >
            {t("common.dialog.close")}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "bg-os-window-bg border-[length:var(--os-metrics-border-width)] border-os-window rounded-os shadow-os-window",
          isXpTheme && "p-0 overflow-hidden"
        )}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          saveButtonRef.current?.focus();
        }}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>
              {t("apps.internet-explorer.futureTimeline.title")}
            </DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogHeader>
              {t("apps.internet-explorer.futureTimeline.title")}
            </DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("apps.internet-explorer.futureTimeline.title")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("apps.internet-explorer.futureTimeline.description")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FutureSettingsDialog;
