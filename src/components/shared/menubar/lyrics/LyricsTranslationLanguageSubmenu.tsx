import {
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarSeparator,
  MenubarRadioGroup,
  MenubarRadioItem,
} from "@/components/ui/menubar";
import type { TranslatedLyricsLanguage } from "@/hooks/useTranslatedLyricsLanguages";
import { MENUBAR_SEPARATOR_CLASS } from "../menubarStyles";

export type LyricsTranslationLanguageSubmenuProps = {
  submenuLabel: string;
  translationLanguages: TranslatedLyricsLanguage[];
  lyricsTranslationLanguage: string | null;
  setLyricsTranslationLanguage: (code: string | null) => void;
};

export function LyricsTranslationLanguageSubmenu({
  submenuLabel,
  translationLanguages,
  lyricsTranslationLanguage,
  setLyricsTranslationLanguage,
}: LyricsTranslationLanguageSubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger className="text-md h-6 px-3">{submenuLabel}</MenubarSubTrigger>
      <MenubarSubContent className="px-0 max-h-[400px] overflow-y-auto">
        <MenubarRadioGroup
          value={lyricsTranslationLanguage || "off"}
          onValueChange={(value) => {
            setLyricsTranslationLanguage(value === "off" ? null : value);
          }}
        >
          {translationLanguages.map((lang, index) => {
            if (lang.separator) {
              const prevCode = translationLanguages[index - 1]?.code || "start";
              const nextCode = translationLanguages[index + 1]?.code || "end";
              return (
                <MenubarSeparator
                  key={`sep-${prevCode}-${nextCode}`}
                  className={MENUBAR_SEPARATOR_CLASS}
                />
              );
            }
            const value = lang.code || "off";
            return (
              <MenubarRadioItem key={value} value={value} className="text-md h-6 pr-3">
                {lang.label}
              </MenubarRadioItem>
            );
          })}
        </MenubarRadioGroup>
      </MenubarSubContent>
    </MenubarSub>
  );
}
