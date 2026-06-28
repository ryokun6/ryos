import {
  MenubarItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import type { Favorite } from "@/stores/useInternetExplorerStore";

/** Recursive render for favorite items or submenus (folders). */
export function renderFavoriteItem(
  favorite: Favorite,
  onNavigate: (url: string, year?: string) => void,
  folderLabel: string
) {
  if (favorite.children && favorite.children.length > 0) {
    return (
      <MenubarSub key={favorite.title}>
        <MenubarSubTrigger className="text-md h-6 px-3 flex items-center gap-2">
          <ThemedIcon
            name="directory.png"
            alt={folderLabel}
            className="size-4 [image-rendering:pixelated]"
          />
          {favorite.title}
        </MenubarSubTrigger>
        <MenubarSubContent className="max-w-xs">
          {favorite.children.map((child) =>
            renderFavoriteItem(child, onNavigate, folderLabel)
          )}
        </MenubarSubContent>
      </MenubarSub>
    );
  } else if (favorite.url) {
    return (
      <MenubarItem
        key={favorite.url}
        onClick={() => onNavigate(favorite.url!, favorite.year)}
        className="text-md h-6 px-3 flex items-center gap-2"
      >
        {favorite.favicon &&
        typeof navigator !== "undefined" &&
        "onLine" in navigator &&
        navigator.onLine ? (
          <img
            src={favorite.favicon}
            alt=""
            className="size-4"
            onError={(e) => {
              e.currentTarget.src = "/icons/default/ie-site.png";
            }}
          />
        ) : (
          <ThemedIcon
            name="ie-site.png"
            alt=""
            className="size-4 [image-rendering:pixelated]"
          />
        )}
        {favorite.title}
        {favorite.year && favorite.year !== "current" && (
          <span className="text-xs text-neutral-500 ml-1">({favorite.year})</span>
        )}
      </MenubarItem>
    );
  } else {
    return null;
  }
}
