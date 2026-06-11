import { memo } from "react";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { MacDock } from "./dock/MacDock";

export const Dock = memo(function Dock() {
  const { isMacOSTheme } = useThemeFlags();
  if (!isMacOSTheme) return null;
  return <MacDock />;
});
