import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useThemeStore } from "@/stores/useThemeStore";
import { cn } from "@/lib/utils";
import type { CalendarEvent, EventColor } from "@/stores/useCalendarStore";

interface EventDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (eventData: {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    color: EventColor;
    notes?: string;
  }) => void;
  editingEvent: CalendarEvent | null;
  selectedDate: string;
  prefillTime?: { date: string; startTime: string; endTime: string } | null;
}

const EVENT_COLORS: { value: EventColor; hex: string }[] = [
  { value: "blue", hex: "#4A90D9" },
  { value: "red", hex: "#D94A4A" },
  { value: "green", hex: "#5AB55A" },
  { value: "orange", hex: "#E89B3E" },
  { value: "purple", hex: "#9B59B6" },
];

export function EventDialog({
  isOpen,
  onOpenChange,
  onSave,
  editingEvent,
  selectedDate,
  prefillTime,
}: EventDialogProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacTheme = currentTheme === "macosx";

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [color, setColor] = useState<EventColor>("blue");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (editingEvent) {
        setTitle(editingEvent.title);
        setDate(editingEvent.date);
        setStartTime(editingEvent.startTime || "");
        setEndTime(editingEvent.endTime || "");
        setAllDay(!editingEvent.startTime);
        setColor(editingEvent.color);
        setNotes(editingEvent.notes || "");
      } else if (prefillTime) {
        setTitle("");
        setDate(prefillTime.date);
        setStartTime(prefillTime.startTime);
        setEndTime(prefillTime.endTime);
        setAllDay(false);
        setColor("blue");
        setNotes("");
      } else {
        setTitle("");
        setDate(selectedDate);
        setStartTime("09:00");
        setEndTime("10:00");
        setAllDay(true);
        setColor("blue");
        setNotes("");
      }
    }
  }, [isOpen, editingEvent, selectedDate, prefillTime]);

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      date,
      startTime: allDay ? undefined : startTime || undefined,
      endTime: allDay ? undefined : endTime || undefined,
      color,
      notes: notes.trim() || undefined,
    });
  };

  const themeFont = isXpTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";

  const themeFontStyle: React.CSSProperties | undefined = isXpTheme
    ? { fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial', fontSize: "11px" }
    : undefined;

  const dialogTitle = editingEvent
    ? t("apps.calendar.event.editEvent")
    : t("apps.calendar.event.newEvent");

  const dialogContent = (
    <div className={isXpTheme ? "p-2 px-4 pb-4" : "p-4 px-6"}>
      {/* Title */}
      <div className="mb-3">
        <Label
          htmlFor="event-title"
          className={cn("text-gray-700 mb-1 block", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.calendar.event.title")}
        </Label>
        <Input
          id="event-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("apps.calendar.event.title")}
          autoFocus
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") handleSave();
          }}
          className={cn("shadow-none h-7", themeFont)}
          style={themeFontStyle}
        />
      </div>

      {/* Date */}
      <div className="mb-3">
        <Label
          htmlFor="event-date"
          className={cn("text-gray-700 mb-1 block", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.calendar.event.date")}
        </Label>
        <Input
          id="event-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={cn("shadow-none h-7", themeFont)}
          style={{ ...themeFontStyle, width: "100%" }}
        />
      </div>

      {/* All Day */}
      <div className="flex items-center gap-2 mb-3">
        <Checkbox
          id="event-allday"
          checked={allDay}
          onCheckedChange={(checked) => setAllDay(checked === true)}
          className="h-3.5 w-3.5"
        />
        <Label
          htmlFor="event-allday"
          className={cn("cursor-pointer", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.calendar.event.allDay")}
        </Label>
      </div>

      {/* Time inputs */}
      {!allDay && (
        <div className="flex gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <Label
              htmlFor="event-start"
              className={cn("text-gray-700 mb-1 block", themeFont)}
              style={themeFontStyle}
            >
              {t("apps.calendar.event.startTime")}
            </Label>
            <Input
              id="event-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={cn("shadow-none h-7", themeFont)}
              style={{ ...themeFontStyle, width: "100%" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <Label
              htmlFor="event-end"
              className={cn("text-gray-700 mb-1 block", themeFont)}
              style={themeFontStyle}
            >
              {t("apps.calendar.event.endTime")}
            </Label>
            <Input
              id="event-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={cn("shadow-none h-7", themeFont)}
              style={{ ...themeFontStyle, width: "100%" }}
            />
          </div>
        </div>
      )}

      {/* Color */}
      <div className="mb-3">
        <Label
          className={cn("text-gray-700 mb-1 block", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.calendar.event.color")}
        </Label>
        <div className="flex gap-1.5">
          {EVENT_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setColor(c.value)}
              className="w-5 h-5 rounded-full transition-all"
              style={{
                backgroundColor: c.hex,
                border: color === c.value ? "2px solid #333" : "2px solid transparent",
                boxShadow: color === c.value ? "0 0 0 1px rgba(255,255,255,0.8)" : "none",
                transform: color === c.value ? "scale(1.15)" : "scale(1)",
              }}
              aria-label={c.value}
            />
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="mb-3">
        <Label
          htmlFor="event-notes"
          className={cn("text-gray-700 mb-1 block", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.calendar.event.notes")}
        </Label>
        <textarea
          id="event-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("apps.calendar.event.notes")}
          rows={2}
          className={cn(
            "flex w-full rounded-md border border-input bg-transparent px-3 py-1.5 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none shadow-none",
            themeFont
          )}
          style={{
            ...themeFontStyle,
            ...(isMacTheme ? {
              border: "1px solid rgba(0, 0, 0, 0.2)",
              backgroundColor: "rgba(255, 255, 255, 1)",
              boxShadow: "inset 0 1px 2px rgba(0, 0, 0, 0.1)",
              fontSize: "12px",
              fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif',
            } : {}),
          }}
        />
      </div>

      {/* Footer */}
      <DialogFooter className="mt-4 gap-1 sm:gap-0">
        <Button
          variant="retro"
          onClick={() => onOpenChange(false)}
          className={cn("h-7", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.calendar.event.cancel")}
        </Button>
        <Button
          variant={isMacTheme ? "default" : "retro"}
          onClick={handleSave}
          disabled={!title.trim()}
          className={cn(!isMacTheme && "h-7", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.calendar.event.save")}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[400px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>{dialogTitle}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : currentTheme === "macosx" ? (
          <>
            <DialogHeader>{dialogTitle}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {dialogTitle}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
