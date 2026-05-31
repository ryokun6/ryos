import {
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
  MenubarCheckboxItem,
} from "@/components/ui/menubar";
import type { LocationOption } from "@/stores/useInternetExplorerStore";
import type { InternetExplorerMenuBarViewModel } from "./useInternetExplorerMenuBar";

const LOCATION_OPTIONS: LocationOption[] = [
  "auto",
  "united_states",
  "china",
  "japan",
  "korea",
  "canada",
  "uk",
  "france",
  "germany",
  "spain",
  "portugal",
  "india",
  "brazil",
  "australia",
  "russia",
];

const LOCATION_LABEL_KEYS: Record<LocationOption, string> = {
  auto: "apps.internet-explorer.menu.auto",
  united_states: "apps.internet-explorer.menu.unitedStates",
  china: "apps.internet-explorer.menu.china",
  japan: "apps.internet-explorer.menu.japan",
  korea: "apps.internet-explorer.menu.korea",
  canada: "apps.internet-explorer.menu.canada",
  uk: "apps.internet-explorer.menu.unitedKingdom",
  france: "apps.internet-explorer.menu.france",
  germany: "apps.internet-explorer.menu.germany",
  spain: "apps.internet-explorer.menu.spain",
  portugal: "apps.internet-explorer.menu.portugal",
  india: "apps.internet-explorer.menu.india",
  brazil: "apps.internet-explorer.menu.brazil",
  australia: "apps.internet-explorer.menu.australia",
  russia: "apps.internet-explorer.menu.russia",
};

export function IeMenuBarLocationSubmenu({
  vm,
}: {
  vm: InternetExplorerMenuBarViewModel;
}) {
  const { t, location, onLocationChange } = vm;

  return (
    <MenubarSub>
      <MenubarSubTrigger className="text-md h-6 px-3">
        {t("apps.internet-explorer.menu.location")}
      </MenubarSubTrigger>
      <MenubarSubContent className="min-w-[160px]">
        {LOCATION_OPTIONS.map((option) => (
          <MenubarCheckboxItem
            key={option}
            checked={location === option}
            onCheckedChange={(checked) => {
              if (checked) onLocationChange?.(option);
            }}
            className="text-md h-6 px-3"
          >
            {t(LOCATION_LABEL_KEYS[option])}
          </MenubarCheckboxItem>
        ))}
      </MenubarSubContent>
    </MenubarSub>
  );
}
