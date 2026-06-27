import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface EmojiDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onEmojiSelect: (emoji: string) => void;
}

const EMOJIS = [
  // Popular & Audio Related
  "🎵",
  "🎶",
  "🎤",
  "🎧",
  "🎼",
  "🔊",
  "🔉",
  "🔈",
  "🎙",
  "📢",
  "🎸",
  "🎹",
  "🎺",
  "🎷",
  "🥁",
  "🎚",
  "🎛",
  "🔔",
  "📣",
  "🔕",

  // Common Symbols & Actions
  "✅",
  "❌",
  "⭐",
  "💫",
  "✨",
  "🔥",
  "💥",
  "💢",
  "💡",
  "💭",
  "❤️",
  "💀",
  "☠️",
  "⚡",
  "💪",
  "👍",
  "👎",
  "👏",
  "🙌",
  "👋",
  "💩",
  "🎉",
  "🎊",
  "🌸",
  "🌺",
  "🌷",

  // Arrows & Movement
  "⬆️",
  "⬇️",
  "⬅️",
  "➡️",
  "↗️",
  "↘️",
  "↙️",
  "↖️",
  "↕️",
  "↔️",
  "🏃",
  "🏃‍♀️",
  "💃",
  "🕺",
  "🚶",
  "🚶‍♀️",

  // Common Faces
  "😀",
  "😄",
  "😅",
  "😂",
  "🤣",
  "😊",
  "😇",
  "🙂",
  "🙃",
  "😉",
  "😌",
  "😍",
  "🥰",
  "😘",
  "😎",
  "🤩",
  "🥳",
  "😏",
  "😮",
  "😱",
  "😭",
  "🥺",
  "😤",
  "😠",
  "😡",
  "🤬",
  "🤯",
  "🥴",
  "😴",
  "😵",

  // Animals
  "🐶",
  "🐱",
  "🐭",
  "🐹",
  "🐰",
  "🦊",
  "🐻",
  "🐼",
  "🐨",
  "🐯",

  // Objects & Tools
  "⚙️",
  "🔧",
  "🔨",
  "💻",
  "⌨️",
  "🖥️",
  "📱",
  "🔋",
  "🔌",
  "💾",
  "💿",
  "📀",
  "🎮",
  "🕹️",
  "🎲",
  "🎯",
  "🎨",
  "✂️",
  "📎",
  "📌",

  // Weather & Nature
  "☀️",
  "🌙",
  "⭐",
  "☁️",
  "🌈",
  "🌧️",
  "⛈️",
  "❄️",
  "🌪️",
  "🔥",

  // Additional Faces & Gestures
  "🤔",
  "🤨",
  "🧐",
  "🤓",
  "😤",
  "😫",
  "😩",
  "🥺",
  "😢",
  "😭",
  "✌️",
  "🤘",
  "🤙",
  "👆",
  "👇",
  "👈",
  "👉",
  "👊",
  "🤛",
  "🤜",

  // Misc Symbols
  "♠️",
  "♣️",
  "♥️",
  "♦️",
  "🔄",
  "⏩",
  "⏪",
  "⏫",
  "⏬",
  "🔼",
  "🔽",
  "⏯️",
  "⏹️",
  "⏺️",
  "⏏️",
  "🎦",
  "🔅",
  "🔆",
  "📶",
  "📳",
  "📴",
  "♾️",
  "♻️",
  "⚜️",
  "🔱",
  "📛",
  "🔰",
  "⭕",
  "✅",
  "☑️",
  "✔️",
  "❌",
  "❎",
  "〽️",
  "✳️",
  "✴️",
  "❇️",
  "©️",
  "®️",
  "™️",
];

export function EmojiDialog({
  isOpen,
  onOpenChange,
  onEmojiSelect,
}: EmojiDialogProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

  const dialogContent = (
    <div className={isWindowsTheme ? "p-2 px-4 pt-0" : "p-4 py-6"}>
      <p
        id="dialog-description"
        className={cn(
          "mb-2 text-neutral-500",
          isWindowsTheme
            ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
            : "font-geneva-12 text-[12px]"
        )}
        style={{
          fontFamily: isWindowsTheme
            ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
            : undefined,
          fontSize: isWindowsTheme ? "11px" : undefined,
        }}
      >
        {t("common.dialog.emoji.chooseEmoji")}
      </p>
      <div className="grid grid-cols-10 gap-1 max-h-[300px] overflow-y-auto">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            className="p-1 !text-2xl hover:scale-120 transition-all duration-200 rounded cursor-pointer font-['SerenityOS-Emoji']"
            onClick={() => {
              onEmojiSelect(emoji);
              onOpenChange(false);
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[500px]", isWindowsTheme && "p-0 overflow-hidden")}
        style={isWindowsTheme ? { fontSize: "11px" } : undefined}
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">
              {t("common.dialog.emoji.setEmoji")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("common.dialog.emoji.description")}
            </DialogDescription>
            <DialogHeader>{t("common.dialog.emoji.setEmoji")}</DialogHeader>
            <div className="window-body">{dialogContent}</div>
          </>
        ) : isMacOSTheme ? (
          <>
            <DialogTitle className="sr-only">
              {t("common.dialog.emoji.setEmoji")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("common.dialog.emoji.description")}
            </DialogDescription>
            <DialogHeader>{t("common.dialog.emoji.setEmoji")}</DialogHeader>
            {dialogContent}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {t("common.dialog.emoji.setEmoji")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("common.dialog.emoji.description")}
              </DialogDescription>
            </DialogHeader>
            {dialogContent}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
