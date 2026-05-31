import { useThemeFlags } from "@/hooks/useThemeFlags";
import type { CreateRoomDialogTheme } from "./types";

export function useCreateRoomDialogTheme(): CreateRoomDialogTheme {
  const { isWindowsTheme: isXpTheme, isMacOSTheme } = useThemeFlags();

  const themeFont = isXpTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";

  const themeFontStyle: React.CSSProperties | undefined = isXpTheme
    ? {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      }
    : undefined;

  return { isXpTheme, isMacOSTheme, themeFont, themeFontStyle };
}
