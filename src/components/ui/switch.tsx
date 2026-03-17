import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { useSound, Sounds } from "@/hooks/useSound";
import { useThemeStore } from "@/stores/useThemeStore";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, onCheckedChange, ...props }, ref) => {
  const { play: playClick } = useSound(Sounds.BUTTON_CLICK, 0.3);
  const theme = useThemeStore((s) => s.current);
  const isMacOSX = theme === "macosx";
  const [isChecked, setIsChecked] = React.useState(
    props.checked || props.defaultChecked || false
  );

  const handleCheckedChange = (checked: boolean) => {
    playClick();
    setIsChecked(checked);
    onCheckedChange?.(checked);
  };

  // For legacy / non-mac themes we provide minimal inline fallback styles.
  // macOSX theme supplies its own gradients & metrics in themes.css.
  const switchStyle: React.CSSProperties | undefined = isMacOSX
    ? undefined
    : {
        backgroundColor: isChecked
          ? "var(--os-color-switch-track-checked)"
          : "var(--os-color-switch-track)",
        borderRadius: "9999px",
        border: "none",
        boxShadow: "none",
      };

  return (
    <SwitchPrimitives.Root
      className={cn(
        "peer os-switch inline-flex h-[16px] w-7 shrink-0 cursor-pointer items-center transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        // Provide consistent horizontal padding for non-mac themes so travel distance is identical
        !isMacOSX && "px-[2px]",
        className
      )}
      style={switchStyle}
      onCheckedChange={handleCheckedChange}
      {...props}
      ref={ref}
    >
      <SwitchPrimitives.Thumb
        className={cn(
          "os-switch-thumb pointer-events-none block h-[14px] w-[14px] rounded-full bg-white transition-transform will-change-transform",
          // macOSX needs a slight negative offset when unchecked to appear visually centered inside bordered track
          isMacOSX && "data-[state=unchecked]:translate-x-[-2px]",
          // Translate by fixed distance when checked (Tailwind requires static class name)
          "data-[state=checked]:translate-x-[10px]"
        )}
      />
    </SwitchPrimitives.Root>
  );
});
Switch.displayName = SwitchPrimitives.Root.displayName;

export { Switch };
