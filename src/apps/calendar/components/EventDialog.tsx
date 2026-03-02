import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
}

const EVENT_COLORS: { value: EventColor; hex: string }[] = [
  { value: "blue", hex: "#3B82F6" },
  { value: "red", hex: "#EF4444" },
  { value: "green", hex: "#22C55E" },
  { value: "orange", hex: "#F97316" },
  { value: "purple", hex: "#A855F7" },
];

export function EventDialog({
  isOpen,
  onOpenChange,
  onSave,
  editingEvent,
  selectedDate,
}: EventDialogProps) {
  const { t } = useTranslation();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(true);
  const [color, setColor] = useState<EventColor>("blue");
  const [notes, setNotes] = useState("");

  // Reset form when dialog opens
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
  }, [isOpen, editingEvent, selectedDate]);

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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>
            {editingEvent
              ? t("apps.calendar.event.editEvent")
              : t("apps.calendar.event.newEvent")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {/* Title */}
          <div className="grid gap-1.5">
            <Label htmlFor="event-title">{t("apps.calendar.event.title")}</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("apps.calendar.event.title")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>

          {/* Date */}
          <div className="grid gap-1.5">
            <Label htmlFor="event-date">{t("apps.calendar.event.date")}</Label>
            <Input
              id="event-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* All Day checkbox */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="event-allday"
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(checked === true)}
            />
            <Label htmlFor="event-allday" className="cursor-pointer">
              {t("apps.calendar.event.allDay")}
            </Label>
          </div>

          {/* Time inputs (hidden when all-day) */}
          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="event-start">
                  {t("apps.calendar.event.startTime")}
                </Label>
                <Input
                  id="event-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="event-end">
                  {t("apps.calendar.event.endTime")}
                </Label>
                <Input
                  id="event-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Color picker */}
          <div className="grid gap-1.5">
            <Label>{t("apps.calendar.event.color")}</Label>
            <div className="flex gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className="w-6 h-6 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c.hex,
                    borderColor: color === c.value ? "#000" : "transparent",
                    transform: color === c.value ? "scale(1.2)" : "scale(1)",
                  }}
                  aria-label={c.value}
                />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label htmlFor="event-notes">{t("apps.calendar.event.notes")}</Label>
            <textarea
              id="event-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("apps.calendar.event.notes")}
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("apps.calendar.event.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            {t("apps.calendar.event.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
