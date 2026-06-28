import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import type { InternetExplorerMenuBarViewModel } from "./useInternetExplorerMenuBar";
import { renderFavoriteItem } from "./renderFavoriteItem";

export function IeMenuBarFavoritesMenu({
  vm,
}: {
  vm: InternetExplorerMenuBarViewModel;
}) {
  const {
    t,
    onHome,
    onAddFavorite,
    favorites,
    onNavigateToFavorite,
    onClearFavorites,
    onResetFavorites,
  } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
        {t("apps.internet-explorer.menu.favorites")}
      </MenubarTrigger>
      <MenubarContent align="start" sideOffset={1} className="px-0 max-w-xs">
        <MenubarItem onClick={onHome} className="text-md h-6 px-3">
          {t("apps.internet-explorer.menu.goHome")}
        </MenubarItem>
        <MenubarSeparator className="h-[2px] bg-black my-1" />
        <MenubarItem onClick={onAddFavorite} className="text-md h-6 px-3">
          {t("apps.internet-explorer.menu.addToFavorites")}
        </MenubarItem>
        {favorites.length > 0 && (
          <>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            {favorites.map((favorite) =>
              renderFavoriteItem(
                favorite,
                (url, year) => onNavigateToFavorite?.(url, year),
                t("apps.internet-explorer.menu.folder")
              )
            )}
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem onClick={onClearFavorites} className="text-md h-6 px-3">
              {t("apps.internet-explorer.menu.clearFavorites")}
            </MenubarItem>
          </>
        )}
        <MenubarItem onClick={onResetFavorites} className="text-md h-6 px-3">
          {t("apps.internet-explorer.menu.resetFavorites")}
        </MenubarItem>
      </MenubarContent>
    </MenubarMenu>
  );
}
