import type { ReactNode } from "react";

export interface ToolInvocationStatusRowProps {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  align?: "center" | "start";
}

export function ToolInvocationStatusRow({
  icon,
  children,
  className,
  align = "center",
}: ToolInvocationStatusRowProps) {
  const alignmentClass = align === "start" ? "items-start" : "items-center";
  return (
    <div className={`flex ${alignmentClass} gap-1 ${className || ""}`}>
      <span className="inline-flex size-3 items-center justify-center shrink-0">
        {icon}
      </span>
      {children}
    </div>
  );
}
