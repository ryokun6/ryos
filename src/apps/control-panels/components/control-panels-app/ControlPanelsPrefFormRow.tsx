import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ControlPanelsPrefFormRowProps = {
  label: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/** macOS 10.3 System Preferences form row: right-aligned label, control on the right. */
export function ControlPanelsPrefFormRow({
  label,
  description,
  children,
  className,
}: ControlPanelsPrefFormRowProps) {
  return (
    <div className={cn("control-panels-pref-form-row", className)}>
      <div className="control-panels-pref-form-label">
        <span className="control-panels-pref-form-label-text">{label}</span>
        {description ? (
          <span className="control-panels-pref-form-label-desc">{description}</span>
        ) : null}
      </div>
      <div className="control-panels-pref-form-control">{children}</div>
    </div>
  );
}
