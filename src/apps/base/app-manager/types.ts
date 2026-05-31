import type { AnyApp } from "../types";
import type { SwitcherApp } from "@/components/layout/AppSwitcher";

export interface AppManagerProps {
  apps: AnyApp[];
}

export interface SwitcherState {
  visible: boolean;
  apps: SwitcherApp[];
  index: number;
}

export type SwitcherAction =
  | { type: "setVisible"; value: boolean }
  | { type: "setApps"; value: SwitcherApp[] }
  | { type: "setIndex"; value: number }
  | { type: "open"; apps: SwitcherApp[]; index: number }
  | { type: "reset" };
