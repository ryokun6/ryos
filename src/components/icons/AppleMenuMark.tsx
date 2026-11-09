import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { useReplaceAppleLogos } from "@/hooks/useReplaceAppleLogos";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";

interface AppleMenuMarkProps {
  className?: string;
}

/**
 * Apple menu trigger mark. With `replaceAppleLogos` on, Aqua gets Colo's gel
 * orb and System 7 a flat black circle — sized like the original menubar Apple.
 */
export function AppleMenuMark({ className }: AppleMenuMarkProps) {
  const replaceAppleLogos = useReplaceAppleLogos();
  const { isMacOSTheme, isSystem7Theme } = useThemeFlags();

  if (replaceAppleLogos && isMacOSTheme) {
    return (
      <ThemedIcon
        name="apple-orb.png"
        alt="Apple Menu"
        className={cn("pointer-events-none", className)}
        style={{ width: 30, height: 30 }}
      />
    );
  }

  if (replaceAppleLogos && isSystem7Theme) {
    return (
      <ThemedIcon
        name="apple-orb.png"
        alt="Apple Menu"
        className={cn("pointer-events-none", className)}
        // Optical match for the classic  glyph in the System 7 menubar.
        style={{ width: 16, height: 16 }}
      />
    );
  }

  if (isMacOSTheme) {
    // The 30px image overflows the menubar row, so it must not take
    // taps outside the trigger (e.g. in the iOS shell's top band).
    return (
      <ThemedIcon
        name="apple.png"
        alt="Apple Menu"
        className={cn("pointer-events-none", className)}
        style={{ width: 30, height: 30 }}
      />
    );
  }

  return <span className={className}>{"\uf8ff"}</span>;
}
