import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import {
  PAINT_MENU_FILTER_CATEGORIES,
  PAINT_MENU_FILTERS,
} from "./paintMenuFilters";
import {
  PAINT_FILTER_CATEGORY_KEY_MAP,
  PAINT_FILTER_KEY_MAP,
} from "./filterTranslationMaps";
import type { PaintMenuBarViewModel } from "./usePaintMenuBar";

export function PaintMenuBarFiltersMenu({ vm }: { vm: PaintMenuBarViewModel }) {
  const { t, onApplyFilter } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
        {t("apps.paint.menu.filters")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0">
        {Object.entries(PAINT_MENU_FILTER_CATEGORIES).map(
          ([category, filterNames]) => (
            <MenubarSub key={category}>
              <MenubarSubTrigger className="text-md h-6 px-3">
                {t(PAINT_FILTER_CATEGORY_KEY_MAP[category] || category)}
              </MenubarSubTrigger>
              <MenubarSubContent>
                {filterNames.map((name) => {
                  const filter = PAINT_MENU_FILTERS.find((f) => f.name === name);
                  if (!filter) return null;
                  return (
                    <MenubarItem
                      key={name}
                      onClick={() => onApplyFilter(filter)}
                      className="text-md h-6 px-3"
                    >
                      {t(PAINT_FILTER_KEY_MAP[name] || name)}
                    </MenubarItem>
                  );
                })}
              </MenubarSubContent>
            </MenubarSub>
          )
        )}
      </MenubarContent>
    </MenubarMenu>
  );
}
