import type { ToolHandler } from "./types";
import { useCalendarStore } from "@/stores/useCalendarStore";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  applyCalendarToolAction,
  serializeCalendarEvent,
  serializeCalendarTodo,
  type CalendarControlInput,
  type CalendarEventToolRecord,
  type CalendarTodoToolRecord,
} from "@/shared/tools/calendar";
import type { CalendarSnapshotData } from "@/shared/domains/calendar";
import i18n from "@/lib/i18n";
import { createShortIdMap, resolveId, type ShortIdMap } from "./helpers";

export type { CalendarControlInput } from "@/shared/tools/calendar";

const tc = (key: string, opts?: Record<string, unknown>) =>
  i18n.t(`apps.chats.toolCalls.calendar.${key}`, opts);

/**
 * Module-level short-ID maps (events + todos) built on list actions and
 * resolved on mutations, mirroring the stickies/contacts handlers. They
 * intentionally persist across dispatches so the model can list once and
 * mutate in later steps or messages.
 */
let eventIdMap: ShortIdMap | undefined;
let todoIdMap: ShortIdMap | undefined;

const withShortEventId = (
  record: CalendarEventToolRecord
): CalendarEventToolRecord => ({
  ...record,
  id: eventIdMap?.fullToShort.get(record.id) || record.id,
});

const withShortTodoId = (
  record: CalendarTodoToolRecord
): CalendarTodoToolRecord => ({
  ...record,
  id: todoIdMap?.fullToShort.get(record.id) || record.id,
});

/**
 * Client calendar tool handler. Runs the same `applyCalendarToolAction`
 * reducer as the server (Telegram) executor, then bridges the resulting
 * snapshot back into the Zustand store + cloud-sync deletion markers.
 */
export const handleCalendarControl: ToolHandler<CalendarControlInput> = (
  input,
  toolCallId,
  context
) => {
  const store = useCalendarStore.getState();
  const { action } = input;

  const emitError = (errorText: string) => {
    context.addToolOutput({
      state: "output-error",
      tool: "calendarControl",
      toolCallId,
      errorText,
    });
  };

  const snapshot: CalendarSnapshotData = {
    events: store.events,
    calendars: store.calendars,
    todos: store.todos,
  };

  // Resolve short IDs (e1/t1) from previous list outputs to full UUIDs.
  const resolvedInput: CalendarControlInput = input.id
    ? {
        ...input,
        id:
          action === "toggleTodo" || action === "deleteTodo"
            ? resolveId(input.id, todoIdMap)
            : resolveId(input.id, eventIdMap),
      }
    : input;

  const result = applyCalendarToolAction(snapshot, resolvedInput, {
    generateId: () => crypto.randomUUID(),
    now: () => Date.now(),
    deletedAt: () => new Date().toISOString(),
  });

  if (!result.ok) {
    switch (result.error) {
      case "missing_fields":
        emitError(
          action === "createTodo"
            ? tc("createTodoMissingTitle")
            : tc("createEventMissingFields")
        );
        return;
      case "missing_id": {
        const keys: Partial<Record<CalendarControlInput["action"], string>> = {
          update: "updateEventMissingId",
          delete: "deleteEventMissingId",
          toggleTodo: "toggleTodoMissingId",
          deleteTodo: "deleteTodoMissingId",
        };
        emitError(tc(keys[action] || "updateEventMissingId"));
        return;
      }
      case "not_found":
        emitError(
          action === "toggleTodo" || action === "deleteTodo"
            ? tc("todoNotFound", { id: input.id })
            : tc("eventNotFound", { id: input.id })
        );
        return;
      default:
        emitError(tc("unknownAction", { action }));
        return;
    }
  }

  const emitOutput = (output: unknown) => {
    context.addToolOutput({ tool: "calendarControl", toolCallId, output });
  };

  switch (result.kind) {
    case "list": {
      eventIdMap = createShortIdMap(
        result.events.map((event) => event.id),
        "e"
      );
      const formatted = result.events.map(withShortEventId);
      const count = formatted.length;
      const message = input.date
        ? tc(count === 1 ? "foundEventsForDate" : "foundEventsForDatePlural", {
            count,
            date: input.date,
          })
        : tc(count === 1 ? "foundEventsTotal" : "foundEventsTotalPlural", {
            count,
          });
      emitOutput({ success: true, message, events: formatted });
      return;
    }

    case "create": {
      useCalendarStore.setState({ events: result.state.events });
      store.setSelectedDate(result.event.date);
      context.launchApp("calendar");
      emitOutput({
        success: true,
        message: tc("createdEvent", {
          title: result.event.title,
          date: result.event.date,
        }),
        event: serializeCalendarEvent(result.event),
      });
      return;
    }

    case "update": {
      useCalendarStore.setState({ events: result.state.events });
      emitOutput({
        success: true,
        message: tc("updatedEventMsg", { title: result.event.title }),
        event: withShortEventId(serializeCalendarEvent(result.event)),
      });
      return;
    }

    case "delete": {
      useCalendarStore.setState({ events: result.state.events });
      useCloudSyncStore
        .getState()
        .markDeletedKeys("calendarEventIds", [result.event.id]);
      emitOutput({
        success: true,
        message: tc("deletedEventMsg", { title: result.event.title }),
      });
      return;
    }

    case "listTodos": {
      todoIdMap = createShortIdMap(
        result.todos.map((todo) => todo.id),
        "t"
      );
      const formatted = result.todos.map(withShortTodoId);
      const count = formatted.length;
      emitOutput({
        success: true,
        message: tc(count === 1 ? "foundTodosMsg" : "foundTodosMsgPlural", {
          count,
        }),
        todos: formatted,
      });
      return;
    }

    case "createTodo": {
      useCalendarStore.setState({ todos: result.state.todos });
      store.setShowTodoSidebar(true);
      context.launchApp("calendar");
      emitOutput({
        success: true,
        message: result.todo.dueDate
          ? tc("createdTodoDue", {
              title: result.todo.title,
              date: result.todo.dueDate,
            })
          : tc("createdTodo", { title: result.todo.title }),
        todo: serializeCalendarTodo(result.todo),
      });
      return;
    }

    case "toggleTodo": {
      useCalendarStore.setState({ todos: result.state.todos });
      emitOutput({
        success: true,
        message: result.todo.completed
          ? tc("markedTodoCompleted", { title: result.todo.title })
          : tc("markedTodoPending", { title: result.todo.title }),
        todo: withShortTodoId(serializeCalendarTodo(result.todo)),
      });
      return;
    }

    case "deleteTodo": {
      useCalendarStore.setState({ todos: result.state.todos });
      useCloudSyncStore
        .getState()
        .markDeletedKeys("calendarTodoIds", [result.todo.id]);
      emitOutput({
        success: true,
        message: tc("deletedTodoMsg", { title: result.todo.title }),
      });
      return;
    }
  }
};
