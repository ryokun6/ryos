import { Editor } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AudioInputButton } from "@/components/ui/audio-input-button";
import { PlaybackBars } from "@/components/ui/playback-bars";
import { CaretDown, SpeakerHigh, TextB as BoldIcon, TextItalic as ItalicIcon, TextUnderline as UnderlineIcon, TextAlignLeft as AlignLeft, TextAlignCenter as AlignCenter, TextAlignRight as AlignRight, List as ListIcon, ListNumbers as ListOrdered } from "@phosphor-icons/react";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { useSound, Sounds } from "@/hooks/useSound";
import { useTranslation } from "react-i18next";

interface EditorToolbarProps {
  editor: Editor | null;
  currentTheme: string;
  speechEnabled: boolean;
  isTranscribing: boolean;
  isTtsLoading: boolean;
  isSpeaking: boolean;
  onTranscriptionComplete: (text: string) => void;
  onTranscriptionStart: () => void;
  onSpeak: () => void;
}

export function EditorToolbar({
  editor,
  currentTheme,
  speechEnabled,
  isTranscribing,
  isTtsLoading,
  isSpeaking,
  onTranscriptionComplete,
  onTranscriptionStart,
  onSpeak,
}: EditorToolbarProps) {
  const { t } = useTranslation();
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isLegacyToolbarTheme = isXpTheme || currentTheme === "system7";
  const isMacOSTheme = currentTheme === "macosx";

  const getCurrentHeading = () => {
    if (editor?.isActive("heading", { level: 1 })) return "h1";
    if (editor?.isActive("heading", { level: 2 })) return "h2";
    if (editor?.isActive("heading", { level: 3 })) return "h3";
    return "text";
  };

  const handleHeadingChange = (value: string) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (value === "text") {
      chain.setParagraph().run();
      return;
    }
    const level = value === "h1" ? 1 : value === "h2" ? 2 : 3;
    if (!editor.isActive("heading", { level })) {
      chain.toggleHeading({ level }).run();
    }
  };

  if (isLegacyToolbarTheme) {
    return (
      <div className="flex bg-[#c0c0c0] border-b border-black w-full flex-shrink-0">
        <div className="flex px-1 py-1 gap-x-1">
          {/* Text style group */}
          <div className="flex">
            <button
              onClick={() => {
                playButtonClick();
                editor?.chain().focus().toggleBold().run();
              }}
              className="w-[26px] h-[22px] flex items-center justify-center"
            >
              <img
                src={`/icons/default/text-editor/bold-${
                  editor?.isActive("bold") ? "depressed" : "off"
                }.png`}
                alt={t("apps.textedit.bold")}
                className="w-[26px] h-[22px]"
              />
            </button>
            <button
              onClick={() => {
                playButtonClick();
                editor?.chain().focus().toggleItalic().run();
              }}
              className="w-[26px] h-[22px] flex items-center justify-center"
            >
              <img
                src={`/icons/default/text-editor/italic-${
                  editor?.isActive("italic") ? "depressed" : "off"
                }.png`}
                alt={t("apps.textedit.italic")}
                className="w-[26px] h-[22px]"
              />
            </button>
            <button
              onClick={() => {
                playButtonClick();
                editor?.chain().focus().toggleUnderline().run();
              }}
              className="w-[26px] h-[22px] flex items-center justify-center"
            >
              <img
                src={`/icons/default/text-editor/underline-${
                  editor?.isActive("underline") ? "depressed" : "off"
                }.png`}
                alt={t("apps.textedit.underline")}
                className="w-[26px] h-[22px]"
              />
            </button>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

          {/* Heading selector */}
          <div className="flex">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-[80px] h-[22px] flex items-center justify-between px-2 bg-white border border-[#808080] text-sm">
                  {getCurrentHeading() === "h1"
                    ? "H1"
                    : getCurrentHeading() === "h2"
                    ? "H2"
                    : getCurrentHeading() === "h3"
                    ? "H3"
                    : t("apps.textedit.text")}
                  <CaretDown className="ml-1 h-3 w-3" weight="bold" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[80px]">
                <DropdownMenuItem
                  onClick={() => handleHeadingChange("text")}
                  className="text-sm h-6 px-2"
                >
                  {t("apps.textedit.text")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleHeadingChange("h1")}
                  className="text-sm h-6 px-2"
                >
                  H1
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleHeadingChange("h2")}
                  className="text-sm h-6 px-2"
                >
                  H2
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleHeadingChange("h3")}
                  className="text-sm h-6 px-2"
                >
                  H3
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

          {/* Alignment group */}
          <div className="flex">
            <button
              onClick={() => {
                playButtonClick();
                editor?.chain().focus().setTextAlign("left").run();
              }}
              className="w-[26px] h-[22px] flex items-center justify-center"
            >
              <img
                src={`/icons/default/text-editor/align-left-${
                  editor?.isActive({ textAlign: "left" })
                    ? "depressed"
                    : "off"
                }.png`}
                alt={t("apps.textedit.alignLeft")}
                className="w-[26px] h-[22px]"
              />
            </button>
            <button
              onClick={() => {
                playButtonClick();
                editor?.chain().focus().setTextAlign("center").run();
              }}
              className="w-[26px] h-[22px] flex items-center justify-center"
            >
              <img
                src={`/icons/default/text-editor/align-center-${
                  editor?.isActive({ textAlign: "center" })
                    ? "depressed"
                    : "off"
                }.png`}
                alt={t("apps.textedit.alignCenter")}
                className="w-[26px] h-[22px]"
              />
            </button>
            <button
              onClick={() => {
                playButtonClick();
                editor?.chain().focus().setTextAlign("right").run();
              }}
              className="w-[26px] h-[22px] flex items-center justify-center"
            >
              <img
                src={`/icons/default/text-editor/align-right-${
                  editor?.isActive({ textAlign: "right" })
                    ? "depressed"
                    : "off"
                }.png`}
                alt={t("apps.textedit.alignRight")}
                className="w-[26px] h-[22px]"
              />
            </button>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

          {/* List group */}
          <div className="flex">
            <button
              onClick={() => {
                playButtonClick();
                editor?.chain().focus().toggleBulletList().run();
              }}
              className="w-[26px] h-[22px] flex items-center justify-center"
            >
              <img
                src={`/icons/default/text-editor/unordered-list-${
                  editor?.isActive("bulletList") ? "depressed" : "off"
                }.png`}
                alt={t("apps.textedit.bulletList")}
                className="w-[26px] h-[22px]"
              />
            </button>
            <button
              onClick={() => {
                playButtonClick();
                editor?.chain().focus().toggleOrderedList().run();
              }}
              className="w-[26px] h-[22px] flex items-center justify-center"
            >
              <img
                src={`/icons/default/text-editor/ordered-list-${
                  editor?.isActive("orderedList") ? "depressed" : "off"
                }.png`}
                alt={t("apps.textedit.numberedList")}
                className="w-[26px] h-[22px]"
              />
            </button>
          </div>

          {/* Divider */}
          <div className="w-[1px] h-[22px] bg-[#808080] shadow-[1px_0_0_#ffffff]" />

          {/* Voice transcription & speech */}
          <div className="flex">
            <AudioInputButton
              onTranscriptionComplete={onTranscriptionComplete}
              onTranscriptionStart={onTranscriptionStart}
              isLoading={isTranscribing}
              className="w-[26px] h-[22px] flex items-center justify-center"
              silenceThreshold={10000}
            />
            {speechEnabled && (
              <button
                onClick={() => {
                  playButtonClick();
                  onSpeak();
                }}
                className="w-[26px] h-[22px] flex items-center justify-center"
                aria-label={isSpeaking ? t("apps.textedit.stopSpeech") : t("apps.textedit.speak")}
              >
                {isTtsLoading ? (
                  <ActivityIndicator size="sm" />
                ) : isSpeaking ? (
                  <PlaybackBars color="black" />
                ) : (
                  <SpeakerHigh className="h-4 w-4" weight="bold" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1 p-1 ${
        isXpTheme
          ? "border-b border-[#919b9c]"
          : isMacOSTheme
          ? "bg-transparent"
          : currentTheme === "system7"
          ? "bg-gray-100 border-b border-black"
          : "bg-gray-100 border-b border-gray-300"
      }`}
      style={{
        borderBottom:
          isMacOSTheme
            ? "var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))"
            : undefined,
      }}
    >
      {/* Text style group */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          aria-label={t("apps.textedit.bold")}
        >
          <BoldIcon
            className={`h-4 w-4 ${
              editor?.isActive("bold")
                ? "text-black"
                : "text-neutral-500"
            }`}
            weight="bold"
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          aria-label={t("apps.textedit.italic")}
        >
          <ItalicIcon
            className={`h-4 w-4 ${
              editor?.isActive("italic")
                ? "text-black"
                : "text-neutral-500"
            }`}
            weight="bold"
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            editor?.chain().focus().toggleUnderline().run()
          }
          aria-label={t("apps.textedit.underline")}
        >
          <UnderlineIcon
            className={`h-4 w-4 ${
              editor?.isActive("underline")
                ? "text-black"
                : "text-neutral-500"
            }`}
            weight="bold"
          />
        </Button>
      </div>

      {/* Heading selector */}
      <div className="flex items-center mx-1">
        {isMacOSTheme ? (
          <Select
            value={getCurrentHeading()}
            onValueChange={handleHeadingChange}
          >
            <SelectTrigger className="h-7 px-2 !min-w-[92px] !text-[12px]">
              <SelectValue placeholder={t("apps.textedit.text")} />
            </SelectTrigger>
            <SelectContent align="start" className="px-0">
              <SelectItem value="text">{t("apps.textedit.text")}</SelectItem>
              <SelectItem value="h1">{t("apps.textedit.heading1")}</SelectItem>
              <SelectItem value="h2">{t("apps.textedit.heading2")}</SelectItem>
              <SelectItem value="h3">{t("apps.textedit.heading3")}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="h-7 px-2 min-w-[120px] justify-between"
              >
                {getCurrentHeading() === "h1"
                  ? "H1"
                  : getCurrentHeading() === "h2"
                  ? "H2"
                  : getCurrentHeading() === "h3"
                  ? "H3"
                  : t("apps.textedit.text")}
                <CaretDown className="ml-1 h-3 w-3" weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[120px]">
              <DropdownMenuItem onClick={() => handleHeadingChange("text")}>
                {t("apps.textedit.text")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleHeadingChange("h1")}>
                {t("apps.textedit.heading1")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleHeadingChange("h2")}>
                {t("apps.textedit.heading2")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleHeadingChange("h3")}>
                {t("apps.textedit.heading3")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Alignment group */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            editor?.chain().focus().setTextAlign("left").run()
          }
          aria-label={t("apps.textedit.alignLeft")}
        >
          <AlignLeft
            className={`h-4 w-4 ${
              editor?.isActive({ textAlign: "left" })
                ? "text-black"
                : "text-neutral-500"
            }`}
            weight="bold"
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            editor?.chain().focus().setTextAlign("center").run()
          }
          aria-label={t("apps.textedit.alignCenter")}
        >
          <AlignCenter
            className={`h-4 w-4 ${
              editor?.isActive({ textAlign: "center" })
                ? "text-black"
                : "text-neutral-500"
            }`}
            weight="bold"
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            editor?.chain().focus().setTextAlign("right").run()
          }
          aria-label={t("apps.textedit.alignRight")}
        >
          <AlignRight
            className={`h-4 w-4 ${
              editor?.isActive({ textAlign: "right" })
                ? "text-black"
                : "text-neutral-500"
            }`}
            weight="bold"
          />
        </Button>
      </div>

      {/* Lists */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            editor?.chain().focus().toggleBulletList().run()
          }
          aria-label={t("apps.textedit.bulletList")}
        >
          <ListIcon
            className={`h-4 w-4 ${
              editor?.isActive("bulletList")
                ? "text-black"
                : "text-neutral-500"
            }`}
            weight="bold"
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            editor?.chain().focus().toggleOrderedList().run()
          }
          aria-label={t("apps.textedit.numberedList")}
        >
          <ListOrdered
            className={`h-4 w-4 ${
              editor?.isActive("orderedList")
                ? "text-black"
                : "text-neutral-500"
            }`}
            weight="bold"
          />
        </Button>
      </div>

      {/* Voice transcription & speech */}
      <div className="flex items-center gap-1">
        <AudioInputButton
          onTranscriptionComplete={onTranscriptionComplete}
          onTranscriptionStart={onTranscriptionStart}
          isLoading={isTranscribing}
          className="h-7 w-7 inline-flex items-center justify-center text-neutral-500 hover:text-black"
          silenceThreshold={10000}
        />
        {speechEnabled && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onSpeak}
            aria-label={isSpeaking ? t("apps.textedit.stopSpeech") : t("apps.textedit.speak")}
          >
            {isTtsLoading ? (
              <ActivityIndicator size="sm" color="black" />
            ) : isSpeaking ? (
              <PlaybackBars color="black" />
            ) : (
              <SpeakerHigh className="h-4 w-4 text-neutral-500" weight="bold" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}