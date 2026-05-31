import {
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import type { LanguageOption } from "@/stores/useInternetExplorerStore";
import type { InternetExplorerMenuBarViewModel } from "./useInternetExplorerMenuBar";

const LANGUAGE_OPTIONS: LanguageOption[] = [
  "auto",
  "english",
  "chinese",
  "japanese",
  "korean",
  "french",
  "spanish",
  "portuguese",
  "german",
  "welsh",
  "latin",
  "sanskrit",
  "alien",
  "ai_language",
  "digital_being",
];

const LANGUAGE_LABEL_KEYS: Record<LanguageOption, string> = {
  auto: "apps.internet-explorer.menu.auto",
  english: "apps.internet-explorer.menu.english",
  chinese: "apps.internet-explorer.menu.chinese",
  japanese: "apps.internet-explorer.menu.japanese",
  korean: "apps.internet-explorer.menu.korean",
  french: "apps.internet-explorer.menu.french",
  spanish: "apps.internet-explorer.menu.spanish",
  portuguese: "apps.internet-explorer.menu.portuguese",
  german: "apps.internet-explorer.menu.german",
  welsh: "apps.internet-explorer.menu.welsh",
  latin: "apps.internet-explorer.menu.latin",
  sanskrit: "apps.internet-explorer.menu.sanskrit",
  alien: "apps.internet-explorer.menu.alien",
  ai_language: "apps.internet-explorer.menu.aiLanguage",
  digital_being: "apps.internet-explorer.menu.digitalBeing",
};

export function IeMenuBarLanguageSubmenu({
  vm,
}: {
  vm: InternetExplorerMenuBarViewModel;
}) {
  const { t, language, onLanguageChange } = vm;

  const modernLanguages = LANGUAGE_OPTIONS.slice(0, 10);
  const ancientLanguages = LANGUAGE_OPTIONS.slice(10, 12);
  const futuristicLanguages = LANGUAGE_OPTIONS.slice(12);

  return (
    <MenubarSub>
      <MenubarSubTrigger className="text-md h-6 px-3">
        {t("apps.internet-explorer.menu.language")}
      </MenubarSubTrigger>
      <MenubarSubContent className="min-w-[160px]">
        {modernLanguages.map((option) => (
          <MenubarCheckboxItem
            key={option}
            checked={language === option}
            onCheckedChange={(checked) => {
              if (checked) onLanguageChange?.(option);
            }}
            className="text-md h-6 px-3"
          >
            {t(LANGUAGE_LABEL_KEYS[option])}
          </MenubarCheckboxItem>
        ))}
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        {ancientLanguages.map((option) => (
          <MenubarCheckboxItem
            key={option}
            checked={language === option}
            onCheckedChange={(checked) => {
              if (checked) onLanguageChange?.(option);
            }}
            className="text-md h-6 px-3"
          >
            {t(LANGUAGE_LABEL_KEYS[option])}
          </MenubarCheckboxItem>
        ))}
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        {futuristicLanguages.map((option) => (
          <MenubarCheckboxItem
            key={option}
            checked={language === option}
            onCheckedChange={(checked) => {
              if (checked) onLanguageChange?.(option);
            }}
            className="text-md h-6 px-3"
          >
            {t(LANGUAGE_LABEL_KEYS[option])}
          </MenubarCheckboxItem>
        ))}
      </MenubarSubContent>
    </MenubarSub>
  );
}
