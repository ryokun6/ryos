import type { CalendarEvent } from "@/stores/useCalendarStore";

export interface EventEditorState {
  title: string;
  location: string;
  notes: string;
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
}

export const getEventEditorState = (event: CalendarEvent): EventEditorState => ({
  title: event.title,
  location: event.location || "",
  notes: event.notes || "",
  date: event.date,
  endDate: event.endDate || event.date,
  startTime: event.startTime || "09:00",
  endTime: event.endTime || "10:00",
});

export type EventEditorAction =
  | { type: "resetFromEvent"; event: CalendarEvent }
  | { type: "setTitle"; value: string }
  | { type: "setLocation"; value: string }
  | { type: "setNotes"; value: string }
  | { type: "setDate"; value: string }
  | { type: "setEndDate"; value: string }
  | { type: "setStartTime"; value: string }
  | { type: "setEndTime"; value: string }
  | { type: "setTimes"; startTime: string; endTime: string };

export function eventEditorReducer(
  state: EventEditorState,
  action: EventEditorAction
): EventEditorState {
  switch (action.type) {
    case "resetFromEvent":
      return getEventEditorState(action.event);
    case "setTitle":
      return { ...state, title: action.value };
    case "setLocation":
      return { ...state, location: action.value };
    case "setNotes":
      return { ...state, notes: action.value };
    case "setDate":
      return { ...state, date: action.value };
    case "setEndDate":
      return { ...state, endDate: action.value };
    case "setStartTime":
      return { ...state, startTime: action.value };
    case "setEndTime":
      return { ...state, endTime: action.value };
    case "setTimes":
      return { ...state, startTime: action.startTime, endTime: action.endTime };
    default:
      return state;
  }
}
