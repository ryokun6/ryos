import { Check } from "@phosphor-icons/react";

interface AquaCheckboxProps {
  checked: boolean;
  color: string;
}

export function AquaCheckbox({ checked, color }: AquaCheckboxProps) {
  return (
    <div
      className="w-[14px] h-[14px] rounded-[3.5px] flex items-center justify-center shrink-0 relative overflow-hidden"
      style={checked ? {
        background: `linear-gradient(${color}, ${color}dd)`,
        boxShadow: `0 1px 2px rgba(0,0,0,0.3), 0 0.5px 0.5px rgba(0,0,0,0.2), inset 0 1px 2px rgba(0,0,0,0.2), inset 0 1.5px 2px 0.5px ${color}`,
        border: "none",
      } : {
        background: "linear-gradient(rgba(160,160,160,0.625), rgba(255,255,255,0.625))",
        boxShadow: "0 1px 2px rgba(0,0,0,0.2), 0 0.5px 0.5px rgba(0,0,0,0.15), inset 0 1px 1.5px rgba(0,0,0,0.3), inset 0 1.5px 2px 0.5px #bbb",
        border: "none",
      }}
    >
      {checked && (
        <Check size={10} weight="bold" className="relative z-[3]" style={{ color: "#fff", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.4))" }} />
      )}
      <div
        className="absolute left-[1px] right-[1px] top-[1px] rounded-t-[2.5px] pointer-events-none z-[2]"
        style={{
          height: "40%",
          background: "linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.2))",
          filter: "blur(0.3px)",
        }}
      />
      <div
        className="absolute left-[1px] right-[1px] bottom-[0px] rounded-b-[2.5px] pointer-events-none z-[1]"
        style={{
          height: "35%",
          background: "linear-gradient(transparent, rgba(255,255,255,0.4))",
          filter: "blur(0.5px)",
        }}
      />
    </div>
  );
}
