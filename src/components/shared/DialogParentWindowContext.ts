import { createContext } from "react";

/**
 * Window instance id that "owns" dialogs rendered in the subtree. On the
 * macOS Aqua theme, dialogs use it to attach to the initiating window as a
 * Mac OS X style sheet sliding out from under its titlebar. Null outside app
 * windows (shell-level dialogs stay centered).
 */
export const DialogParentWindowContext = createContext<string | null>(null);
