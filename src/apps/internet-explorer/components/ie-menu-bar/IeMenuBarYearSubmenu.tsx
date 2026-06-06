import {
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import type { InternetExplorerMenuBarViewModel } from "./useInternetExplorerMenuBar";

export function IeMenuBarYearSubmenu({
  vm,
}: {
  vm: InternetExplorerMenuBarViewModel;
}) {
  const { t, futureYears, pastYears, year, onYearChange } = vm;

  return (
    <MenubarSub>
      <MenubarSubTrigger className="text-md h-6 px-3">
        {t("apps.internet-explorer.menu.year")}
      </MenubarSubTrigger>
      <MenubarSubContent className="min-w-[120px] max-h-[400px] overflow-y-auto">
        {futureYears.map((yearOption) => (
          <MenubarCheckboxItem
            key={yearOption}
            checked={year === yearOption}
            onCheckedChange={(checked) => {
              if (checked) onYearChange?.(yearOption);
            }}
            className="text-md h-6 px-3 text-os-link"
          >
            {yearOption}
          </MenubarCheckboxItem>
        ))}
        <MenubarCheckboxItem
          checked={year === "current"}
          onCheckedChange={(checked) => {
            if (checked) onYearChange?.("current");
          }}
          className="text-md h-6 px-3"
        >
          {t("apps.internet-explorer.menu.now")}
        </MenubarCheckboxItem>
        {pastYears.map((yearOption) => (
          <MenubarCheckboxItem
            key={yearOption}
            checked={year === yearOption}
            onCheckedChange={(checked) => {
              if (checked) onYearChange?.(yearOption);
            }}
            className={`text-md h-6 px-3 ${
              parseInt(yearOption) <= 1995 ? "text-os-link" : ""
            }`}
          >
            {yearOption}
          </MenubarCheckboxItem>
        ))}
      </MenubarSubContent>
    </MenubarSub>
  );
}
