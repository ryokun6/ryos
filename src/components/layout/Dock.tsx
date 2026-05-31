import { useThemeFlags } from "@/hooks/useThemeFlags";
import { MacDock } from "./dock/MacDock";

export function Dock() {
  const { isMacOSTheme } = useThemeFlags();
  if (!isMacOSTheme) return null;
  return <MacDock />;
}
