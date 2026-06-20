import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ControlPanelsPreferencePaneProps = {
  children: ReactNode;
  className?: string;
};

export function ControlPanelsPreferencePane({
  children,
  className,
}: ControlPanelsPreferencePaneProps) {
  return (
    <div
      className={cn("control-panels-mac-pane flex flex-col", className)}
    >
      <div className="control-panels-mac-pane-scroll">
        <div className="control-panels-mac-pane-inner">{children}</div>
      </div>
    </div>
  );
}
