import type { ToolHandler } from "./types";
import { useCalendarStore } from "@/stores/useCalendarStore";
import type { EventColor } from "@/stores/useCalendarStore";

export interface CalendarControlInput {
  action: "list" | "create" | "update" | "delete" | "listTodos" | "createTodo" | "toggleTodo" | "deleteTodo";
  id?: string;
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  color?: EventColor;
  notes?: string;
  completed?: boolean;
  calendarId?: string;
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

      store.setSelectedDate(input.date);
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

    case "listTodos": {
      let todos = store.todos;
      if (input.completed !== undefined) {
        todos = todos.filter((t) => t.completed === input.completed);
      }
      if (input.date) {
        todos = todos.filter((t) => t.dueDate === input.date);
      }
      const formatted = todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
        dueDate: t.dueDate,
        calendarId: t.calendarId,
      }));
      context.addToolResult({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: `Found ${formatted.length} todo(s).`,
          todos: formatted,
        },
      });
      break;
    }

    case "createTodo": {
      if (!input.title) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: "Creating a todo requires 'title'.",
        });
        return;
      }

      const calendarId = input.calendarId || store.calendars[0]?.id || "home";
      const todoId = store.addTodo(input.title, calendarId, input.date);

      store.setShowTodoSidebar(true);
      context.launchApp("calendar");

      context.addToolResult({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: `Created todo "${input.title}"${input.date ? ` due ${input.date}` : ""}.`,
          todo: {
            id: todoId,
            title: input.title,
            completed: false,
            dueDate: input.date || null,
            calendarId,
          },
        },
      });
      break;
    }

    case "toggleTodo": {
      if (!input.id) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: "Toggling a todo requires 'id'.",
        });
        return;
      }

      const todoToToggle = store.todos.find((t) => t.id === input.id);
      if (!todoToToggle) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: `Todo with id '${input.id}' not found.`,
        });
        return;
      }

      store.toggleTodo(input.id);

      const newStatus = !todoToToggle.completed ? "completed" : "pending";
      context.addToolResult({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: `Marked todo "${todoToToggle.title}" as ${newStatus}.`,
          todo: {
            id: todoToToggle.id,
            title: todoToToggle.title,
            completed: !todoToToggle.completed,
            dueDate: todoToToggle.dueDate,
            calendarId: todoToToggle.calendarId,
          },
        },
      });
      break;
    }

    case "deleteTodo": {
      if (!input.id) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: "Deleting a todo requires 'id'.",
        });
        return;
      }

      const todoToDelete = store.todos.find((t) => t.id === input.id);
      if (!todoToDelete) {
        context.addToolResult({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: `Todo with id '${input.id}' not found.`,
        });
        return;
      }

      store.deleteTodo(input.id);

      context.addToolResult({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: `Deleted todo "${todoToDelete.title}".`,
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
