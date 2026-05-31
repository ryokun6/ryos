import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PanelHeader({
  title,
  trailing,
  useGeneva = false,
  bordered = false,
}: {
  title: string;
  trailing?: ReactNode;
  useGeneva?: boolean;
  bordered?: boolean;
}) {
  return (
    <div
      className={cn(
        bordered
          ? "relative text-[11px] font-regular text-center"
          : "relative text-[9px] font-bold uppercase tracking-wide opacity-50 px-2.5 pt-2 pb-1",
        useGeneva && "font-geneva-12"
      )}
      style={
        bordered
          ? {
              background: "linear-gradient(to bottom, #e6e5e5, #aeadad)",
              color: "#222",
              textShadow: "0 1px 0 #e1e1e1",
              borderTop: "1px solid rgba(255,255,255,0.5)",
              borderBottom: "1px solid #787878",
            }
          : {
              color: "rgba(0,0,0,0.5)",
            }
      }
    >
      <span>{title}</span>
      {trailing ? <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span> : null}
    </div>
  );
}
