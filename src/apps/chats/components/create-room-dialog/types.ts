import type { CSSProperties } from "react";
import type { CreateRoomIrcOptions } from "@/shared/contracts/chat";

export interface CreateRoomDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    name: string,
    type: "public" | "private" | "irc",
    members: string[],
    ircOptions?: CreateRoomIrcOptions
  ) => Promise<{ ok: boolean; error?: string }>;
  isAdmin: boolean;
  currentUsername: string | null;
  initialUsers?: string[];
}

export interface CreateRoomDialogTheme {
  isWindowsTheme: boolean;
  isMacOSTheme: boolean;
  themeFont: string;
  themeFontStyle: CSSProperties | undefined;
}
