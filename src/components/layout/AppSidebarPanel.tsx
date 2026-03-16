import { type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AppSidebarPanelProps {
  className?: string;
  children: ReactNode;
  bordered?: boolean;
  style?: CSSProperties;
}

export function AppSidebarPanel({
  className,
  children,
  bordered = true,
  style,
}: AppSidebarPanelProps) {
  return (
    <div
      className={cn(
        "overflow-hidden os-sidebar",
        bordered ? "bg-white/90" : "bg-white",
        className
      )}
      style={{
        ...(bordered
          ? {
              border: "1px solid var(--os-color-sidebar-border)",
              boxShadow: "var(--os-color-sidebar-inset-shadow), 0 1px 0 rgba(255, 255, 255, 0.4)",
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
