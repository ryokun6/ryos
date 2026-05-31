import type { CSSProperties } from "react";

export interface CreateRoomDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (
    name: string,
    type: "public" | "private" | "irc",
    members: string[],
    ircOptions?: {
      ircServerId?: string;
      ircHost?: string;
      ircPort?: number;
      ircTls?: boolean;
      ircChannel?: string;
      ircServerLabel?: string;
    }
  ) => Promise<{ ok: boolean; error?: string }>;
  isAdmin: boolean;
  currentUsername: string | null;
  initialUsers?: string[];
}

export interface CreateRoomDialogTheme {
  isXpTheme: boolean;
  isMacOSTheme: boolean;
  themeFont: string;
  themeFontStyle: CSSProperties | undefined;
}
