import type { ToolHandler } from "./types";
import { useCalendarStore } from "@/stores/useCalendarStore";
import type { EventColor } from "@/stores/useCalendarStore";
import { calendarEventOccursOnDate } from "@/shared/calendarEventDates";
import i18n from "@/lib/i18n";

export interface CalendarControlInput {
  action: "list" | "create" | "update" | "delete" | "listTodos" | "createTodo" | "toggleTodo" | "deleteTodo";
  id?: string;
  title?: string;
  date?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  color?: EventColor;
  notes?: string;
  completed?: boolean;
  calendarId?: string;
}

const tc = (key: string, opts?: Record<string, unknown>) =>
  i18n.t(`apps.chats.toolCalls.calendar.${key}`, opts);

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
        events = events.filter((ev) => calendarEventOccursOnDate(ev, input.date!));
      }
      const formatted = events.map((ev) => ({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        endDate: ev.endDate,
        startTime: ev.startTime,
        endTime: ev.endTime,
        color: ev.color,
        notes: ev.notes,
      }));
      const count = formatted.length;
      const message = input.date
        ? tc(count === 1 ? "foundEventsForDate" : "foundEventsForDatePlural", { count, date: input.date })
        : tc(count === 1 ? "foundEventsTotal" : "foundEventsTotalPlural", { count });
      context.addToolOutput({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message,
          events: formatted,
        },
      });
      break;
    }

    case "create": {
      if (!input.title || !input.date) {
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("createEventMissingFields"),
        });
        return;
      }

      const eventId = store.addEvent({
        title: input.title,
        date: input.date,
        endDate: input.endDate,
        startTime: input.startTime,
        endTime: input.endTime,
        color: input.color || "blue",
        notes: input.notes,
      });

      store.setSelectedDate(input.date);
      context.launchApp("calendar");

      context.addToolOutput({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: tc("createdEvent", { title: input.title, date: input.date }),
          event: {
            id: eventId,
            title: input.title,
            date: input.date,
            endDate: input.endDate,
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
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("updateEventMissingId"),
        });
        return;
      }

      const existing = store.events.find((ev) => ev.id === input.id);
      if (!existing) {
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("eventNotFound", { id: input.id }),
        });
        return;
      }

      const updates: Record<string, unknown> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.date !== undefined) updates.date = input.date;
      if (input.endDate !== undefined) updates.endDate = input.endDate;
      if (input.startTime !== undefined) updates.startTime = input.startTime;
      if (input.endTime !== undefined) updates.endTime = input.endTime;
      if (input.color !== undefined) updates.color = input.color;
      if (input.notes !== undefined) updates.notes = input.notes;

      store.updateEvent(input.id, updates);

      context.addToolOutput({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: tc("updatedEventMsg", { title: existing.title }),
        },
      });
      break;
    }

    case "delete": {
      if (!input.id) {
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("deleteEventMissingId"),
        });
        return;
      }

      const toDelete = store.events.find((ev) => ev.id === input.id);
      if (!toDelete) {
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("eventNotFound", { id: input.id }),
        });
        return;
      }

      store.deleteEvent(input.id);

      context.addToolOutput({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: tc("deletedEventMsg", { title: toDelete.title }),
        },
      });
      break;
    }

    case "listTodos": {
      let todos = store.todos;
      if (input.completed === true) {
        todos = todos.filter((t) => t.completed);
      }
      const formatted = todos.map((t) => ({
        id: t.id,
        title: t.title,
        completed: t.completed,
        dueDate: t.dueDate,
        calendarId: t.calendarId,
      }));
      const count = formatted.length;
      context.addToolOutput({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: tc(count === 1 ? "foundTodosMsg" : "foundTodosMsgPlural", { count }),
          todos: formatted,
        },
      });
      break;
    }

    case "createTodo": {
      if (!input.title) {
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("createTodoMissingTitle"),
        });
        return;
      }

      const calendarId = input.calendarId || store.calendars[0]?.id || "home";
      const todoId = store.addTodo(input.title, calendarId, input.date);

      store.setShowTodoSidebar(true);
      context.launchApp("calendar");

      context.addToolOutput({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: input.date
            ? tc("createdTodoDue", { title: input.title, date: input.date })
            : tc("createdTodo", { title: input.title }),
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
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("toggleTodoMissingId"),
        });
        return;
      }

      const todoToToggle = store.todos.find((t) => t.id === input.id);
      if (!todoToToggle) {
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("todoNotFound", { id: input.id }),
        });
        return;
      }

      store.toggleTodo(input.id);

      context.addToolOutput({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: !todoToToggle.completed
            ? tc("markedTodoCompleted", { title: todoToToggle.title })
            : tc("markedTodoPending", { title: todoToToggle.title }),
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
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("deleteTodoMissingId"),
        });
        return;
      }

      const todoToDelete = store.todos.find((t) => t.id === input.id);
      if (!todoToDelete) {
        context.addToolOutput({
          state: "output-error",
          tool: "calendarControl",
          toolCallId,
          errorText: tc("todoNotFound", { id: input.id }),
        });
        return;
      }

      store.deleteTodo(input.id);

      context.addToolOutput({
        tool: "calendarControl",
        toolCallId,
        output: {
          success: true,
          message: tc("deletedTodoMsg", { title: todoToDelete.title }),
        },
      });
      break;
    }

    default:
      context.addToolOutput({
        state: "output-error",
        tool: "calendarControl",
        toolCallId,
        errorText: tc("unknownAction", { action }),
      });
  }
};
