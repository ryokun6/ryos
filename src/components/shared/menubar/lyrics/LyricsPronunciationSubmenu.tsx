import {
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarSeparator,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import type { RomanizationSettings } from "@/types/lyrics";
import { MENUBAR_SEPARATOR_CLASS } from "../menubarStyles";

export type LyricsPronunciationSubmenuProps = {
  submenuLabel: string;
  pronunciationLabel: string;
  pronunciationOnlyLabel: string;
  japaneseFuriganaLabel: string;
  japaneseRomajiLabel: string;
  koreanRomanizationLabel: string;
  chinesePinyinLabel: string;
  chineseSoramimiLabel: string;
  soramimiLabel: string;
  romanization: RomanizationSettings | undefined;
  setRomanization: (patch: Partial<RomanizationSettings>) => void;
};

export function LyricsPronunciationSubmenu({
  submenuLabel,
  pronunciationLabel,
  pronunciationOnlyLabel,
  japaneseFuriganaLabel,
  japaneseRomajiLabel,
  koreanRomanizationLabel,
  chinesePinyinLabel,
  chineseSoramimiLabel,
  soramimiLabel,
  romanization,
  setRomanization,
}: LyricsPronunciationSubmenuProps) {
  return (
    <MenubarSub>
      <MenubarSubTrigger className="text-md h-6 px-3">{submenuLabel}</MenubarSubTrigger>
      <MenubarSubContent className="px-0">
        <MenubarCheckboxItem
          checked={romanization?.enabled ?? true}
          onCheckedChange={(checked) => setRomanization({ enabled: checked })}
          className="text-md h-6 px-3 truncate"
        >
          {pronunciationLabel}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={romanization?.pronunciationOnly ?? false}
          onCheckedChange={(checked) =>
            setRomanization({ pronunciationOnly: checked })
          }
          disabled={!romanization?.enabled}
          className="text-md h-6 px-3"
        >
          {pronunciationOnlyLabel}
        </MenubarCheckboxItem>
        <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
        <MenubarCheckboxItem
          checked={romanization?.japaneseFurigana ?? true}
          onCheckedChange={(checked) =>
            setRomanization({ japaneseFurigana: checked })
          }
          disabled={!romanization?.enabled || romanization?.japaneseRomaji}
          className="text-md h-6 px-3"
        >
          {japaneseFuriganaLabel}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={romanization?.japaneseRomaji ?? false}
          onCheckedChange={(checked) =>
            setRomanization({
              japaneseRomaji: checked,
              japaneseFurigana: checked || (romanization?.japaneseFurigana ?? true),
            })
          }
          disabled={!romanization?.enabled}
          className="text-md h-6 px-3"
        >
          {japaneseRomajiLabel}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={romanization?.korean ?? true}
          onCheckedChange={(checked) => setRomanization({ korean: checked })}
          disabled={!romanization?.enabled}
          className="text-md h-6 px-3"
        >
          {koreanRomanizationLabel}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={romanization?.chinese ?? false}
          onCheckedChange={(checked) => setRomanization({ chinese: checked })}
          disabled={!romanization?.enabled}
          className="text-md h-6 px-3"
        >
          {chinesePinyinLabel}
        </MenubarCheckboxItem>
        <MenubarSeparator className={MENUBAR_SEPARATOR_CLASS} />
        <MenubarCheckboxItem
          checked={
            romanization?.soramimi && romanization?.soramamiTargetLanguage === "zh-TW"
          }
          onCheckedChange={(checked) =>
            setRomanization({
              soramimi: checked,
              soramamiTargetLanguage: "zh-TW",
            })
          }
          disabled={!romanization?.enabled}
          className="text-md h-6 px-3"
        >
          {chineseSoramimiLabel}
        </MenubarCheckboxItem>
        <MenubarCheckboxItem
          checked={
            romanization?.soramimi && romanization?.soramamiTargetLanguage === "en"
          }
          onCheckedChange={(checked) =>
            setRomanization({
              soramimi: checked,
              soramamiTargetLanguage: "en",
            })
          }
          disabled={!romanization?.enabled}
          className="text-md h-6 px-3"
        >
          {soramimiLabel}
        </MenubarCheckboxItem>
      </MenubarSubContent>
    </MenubarSub>
  );
}
