import type { ReactNode } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";

type WindowFramePassthrough = Omit<
  React.ComponentProps<typeof WindowFrame>,
  "children" | "menuBar"
>;

type AppWindowShellBaseProps = {
  isWindowOpen: boolean | undefined;
  isXpTheme: boolean;
  isForeground: boolean | undefined;
  menuBar: ReactNode;
  children: ReactNode;
  /** Rendered before WindowFrame (e.g. hidden file inputs). */
  leading?: ReactNode;
  /** Rendered after WindowFrame (dialogs, portals). */
  trailing?: ReactNode;
  /**
   * When true, still render children/trailing while the window is closed
   * (e.g. dashboard overlay exit animations and dialogs).
   */
  alwaysRenderWhenClosed?: boolean;
};

export type AppWindowShellProps = AppWindowShellBaseProps &
  (
    | {
        /** Apps without WindowFrame (Stickies, Dashboard, Winamp). */
        frameless: true;
        windowFrameProps?: never;
      }
    | {
        frameless?: false;
        windowFrameProps: WindowFramePassthrough;
      }
  );

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
  frameless = false,
  alwaysRenderWhenClosed = false,
}: AppWindowShellProps) {
  if (!isWindowOpen && !alwaysRenderWhenClosed) return null;

  const showMacMenuBar =
    !isXpTheme &&
    isForeground &&
    (alwaysRenderWhenClosed ? !!isWindowOpen : true);

  if (frameless) {
    return (
      <>
        {leading}
        {showMacMenuBar && menuBar}
        {children}
        {trailing}
      </>
    );
  }

  return (
    <>
      {leading}
      {showMacMenuBar && menuBar}
      <WindowFrame
        {...windowFrameProps!}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        {children}
      </WindowFrame>
      {trailing}
    </>
  );
}
