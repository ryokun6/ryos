import type { ReactNode } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";

type WindowFramePassthrough = Omit<
  React.ComponentProps<typeof WindowFrame>,
  "children" | "menuBar"
>;

interface AppWindowShellProps {
  isWindowOpen: boolean | undefined;
  isXpTheme: boolean;
  isForeground: boolean | undefined;
  menuBar: ReactNode;
  windowFrameProps: WindowFramePassthrough;
  children: ReactNode;
  /** Rendered before WindowFrame (e.g. macOS menubar outside the frame). */
  leading?: ReactNode;
  /** Rendered after WindowFrame (dialogs, portals). */
  trailing?: ReactNode;
}

/**
 * Standard ryOS app window layout: mac menubar outside frame when foreground,
 * XP menubar passed into WindowFrame.
 */
export function AppWindowShell({
  isWindowOpen,
  isXpTheme,
  isForeground,
  menuBar,
  windowFrameProps,
  children,
  leading,
  trailing,
}: AppWindowShellProps) {
  if (!isWindowOpen) return null;

  return (
    <>
      {leading}
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        {...windowFrameProps}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        {children}
      </WindowFrame>
      {trailing}
    </>
  );
}
