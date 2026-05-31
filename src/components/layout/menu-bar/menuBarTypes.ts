import type { ReactNode } from "react";

export interface MenuBarProps {
  children?: ReactNode;
  inWindowFrame?: boolean;
}

export interface ClockProps {
  enableExposeToggle?: boolean;
  enableCalendarOpen?: boolean;
}
