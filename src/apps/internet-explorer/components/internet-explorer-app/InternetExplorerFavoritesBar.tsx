import type { RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import type { Favorite } from "@/stores/useInternetExplorerStore";

export interface InternetExplorerFavoritesBarProps {
  favorites: Favorite[];
  hasMoreToScroll: boolean;
  favoritesContainerRef: RefObject<HTMLDivElement | null>;
  isOffline: boolean;
  normalizeUrlForHistory: (url: string) => string;
  handleNavigateWithHistory: (navUrl: string, navYear?: string) => void;
}

export function InternetExplorerFavoritesBar({
  favorites,
  hasMoreToScroll,
  favoritesContainerRef,
  isOffline,
  normalizeUrlForHistory,
  handleNavigateWithHistory,
}: InternetExplorerFavoritesBarProps) {
  return (
    <div className="relative flex items-center">
      <div
        ref={favoritesContainerRef}
        className="overflow-x-auto scrollbar-none relative flex-1"
      >
        <div className="flex items-center min-w-full w-max">
          {(() => {
            const favoriteKeyCounts = new Map<string, number>();
            return favorites.map((favorite) => {
              const baseKey = favorite.url
                ? `fav-${favorite.url}-${favorite.year || "current"}`
                : `dir-${favorite.title}-${favorite.children?.length ?? 0}`;
              const count = (favoriteKeyCounts.get(baseKey) ?? 0) + 1;
              favoriteKeyCounts.set(baseKey, count);
              const favoriteKey = `${baseKey}-${count}`;
              if (favorite.children && favorite.children.length > 0) {
                return (
                  <DropdownMenu key={favoriteKey}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ie-favorites-bar-button whitespace-nowrap hover:bg-neutral-200 font-geneva-12 text-[10px] gap-1 px-1 mr-1 w-content min-w-[60px] max-w-[120px] flex-shrink-0"
                      >
                        <ThemedIcon
                          name="directory.png"
                          alt="Folder"
                          className="size-4 mr-1 [image-rendering:pixelated]"
                        />
                        <span className="truncate">{favorite.title}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      sideOffset={4}
                      className="px-0 max-w-xs"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      {favorite.children.map((child) => (
                        <DropdownMenuItem
                          key={child.url}
                          onClick={() =>
                            handleNavigateWithHistory(
                              normalizeUrlForHistory(child.url!),
                              child.year
                            )
                          }
                          className="text-md h-6 px-3 active:bg-neutral-900 active:text-white flex items-center gap-2"
                        >
                          {child.favicon && !isOffline ? (
                            <img
                              src={child.favicon}
                              alt=""
                              className="size-4"
                              onError={(e) => {
                                e.currentTarget.src =
                                  "/icons/default/ie-site.png";
                              }}
                            />
                          ) : (
                            <ThemedIcon
                              name="ie-site.png"
                              alt=""
                              className="size-4 [image-rendering:pixelated]"
                            />
                          )}
                          {child.title}
                          {child.year && child.year !== "current" && (
                            <span className="text-xs text-neutral-500 ml-1">
                              ({child.year})
                            </span>
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              }
              if (favorite.url) {
                return (
                  <Button
                    key={favoriteKey}
                    variant="ghost"
                    size="sm"
                    className="ie-favorites-bar-button whitespace-nowrap hover:bg-neutral-200 font-geneva-12 text-[10px] gap-1 px-1 mr-1 w-content min-w-[60px] max-w-[120px] flex-shrink-0"
                    onClick={(e) => {
                      const normalizedFavUrl = normalizeUrlForHistory(
                        favorite.url!
                      );
                      handleNavigateWithHistory(
                        normalizedFavUrl,
                        favorite.year
                      );
                      e.currentTarget.scrollIntoView({
                        behavior: "smooth",
                        block: "nearest",
                        inline: "nearest",
                      });
                    }}
                  >
                    {favorite.favicon && !isOffline ? (
                      <img
                        src={favorite.favicon}
                        alt="Site"
                        className="size-4 mr-1"
                        onError={(e) => {
                          e.currentTarget.src = "/icons/default/ie-site.png";
                        }}
                      />
                    ) : (
                      <ThemedIcon
                        name="ie-site.png"
                        alt="Site"
                        className="size-4 mr-1 [image-rendering:pixelated]"
                      />
                    )}
                    <span className="truncate">{favorite.title}</span>
                  </Button>
                );
              }
              return null;
            });
          })()}
        </div>
      </div>
      {favorites.length > 0 && hasMoreToScroll && (
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-neutral-100 to-transparent pointer-events-none" />
      )}
    </div>
  );
}
