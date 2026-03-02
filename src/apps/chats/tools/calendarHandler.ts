import type { ToolHandler } from "./types";
import { useCalendarStore } from "@/stores/useCalendarStore";
import type { EventColor } from "@/stores/useCalendarStore";

export interface CalendarControlInput {
  action: "list" | "create" | "update" | "delete";
  id?: string;
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  color?: EventColor;
  notes?: string;
}

export const handleCalendarControl: ToolHandler<CalendarControlInput> = (
  input,
  toolCallId,
  context
) => {
  const store = useCalendarStore.getState();
  const { action } = input;

  switch (action) {
    case "list": {
      let events = store.events;
      if (input.date) {
        events = events.filter((ev) => ev.date === input.date);
      }
      const formatted = events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        startTime: ev.startTime,
        endTime: ev.endTime,
        color: ev.color,
        notes: ev.notes,
      }));
      context.addToolResult({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: input.date
            ? `Found ${formatted.length} event(s) for ${input.date}.`
            : `Found ${formatted.length} event(s) total.`,
          events: formatted,
        },
      });
      break;
    }

    case "create": {
      if (!input.title || !input.date) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: "Creating an event requires 'title' and 'date'.",
        });
        return;
      }

      const eventId = store.addEvent({
        title: input.title,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        color: input.color || "blue",
        notes: input.notes,
      });

      // Navigate calendar to the new event's date
      store.setSelectedDate(input.date);

      // Launch the Calendar app
      context.launchApp("calendar");

      context.addToolResult({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: `Created event "${input.title}" on ${input.date}.`,
          event: {
            id: eventId,
            title: input.title,
            date: input.date,
            startTime: input.startTime,
            endTime: input.endTime,
            color: input.color || "blue",
            notes: input.notes,
          },
        },
      });
      break;
    }

    case "update": {
      if (!input.id) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: "Updating an event requires 'id'.",
        });
        return;
      }

      const existing = store.events.find((ev) => ev.id === input.id);
      if (!existing) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: `Event with id '${input.id}' not found.`,
        });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.date !== undefined) updates.date = input.date;
      if (input.startTime !== undefined) updates.startTime = input.startTime;
      if (input.endTime !== undefined) updates.endTime = input.endTime;
      if (input.color !== undefined) updates.color = input.color;
      if (input.notes !== undefined) updates.notes = input.notes;

      store.updateEvent(input.id, updates);

      context.addToolResult({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: `Updated event "${existing.title}".`,
        },
      });
      break;
    }

    case "delete": {
      if (!input.id) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: "Deleting an event requires 'id'.",
        });
        return;
      }

      const toDelete = store.events.find((ev) => ev.id === input.id);
      if (!toDelete) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: `Event with id '${input.id}' not found.`,
        });
        return;
      }

      store.deleteEvent(input.id);

      context.addToolResult({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: `Deleted event "${toDelete.title}".`,
        },
      });
      break;
    }

    default:
      context.addToolResult({
        state: "output-error",
        tool: "calendarControl",
        toolCallId,
        errorText: `Unknown action: ${action}`,
      });
  }
};
