import type { DashboardPanelProps } from "./types";
import { DashboardPanelView } from "./DashboardPanelView";
import { useDashboardPanel } from "./useDashboardPanel";

export function DashboardPanel(props: DashboardPanelProps) {
  const vm = useDashboardPanel(props);
  return <DashboardPanelView {...vm} />;
}
