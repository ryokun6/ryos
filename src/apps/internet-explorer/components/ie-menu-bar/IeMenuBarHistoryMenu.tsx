import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import type { InternetExplorerMenuBarViewModel } from "./useInternetExplorerMenuBar";

export function IeMenuBarHistoryMenu({
  vm,
}: {
  vm: InternetExplorerMenuBarViewModel;
}) {
  const {
    t,
    onGoBack,
    onGoForward,
    canGoBack,
    canGoForward,
    history,
    onNavigateToHistory,
    onClearHistory,
  } = vm;

  return (
    <MenubarMenu>
      <MenubarTrigger className="px-2 py-1 text-md focus-visible:ring-0">
        {t("apps.internet-explorer.menu.history")}
      </MenubarTrigger>
      <MenubarContent
        align="start"
        sideOffset={1}
        className="px-0 max-h-[400px] overflow-y-auto max-w-xs"
      >
        <MenubarItem
          onClick={onGoBack}
          disabled={!canGoBack}
          className={
            !canGoBack
              ? "text-neutral-400 text-md h-6 px-3"
              : "text-md h-6 px-3"
          }
        >
          {t("apps.internet-explorer.menu.back")}
        </MenubarItem>
        <MenubarItem
          onClick={onGoForward}
          disabled={!canGoForward}
          className={
            !canGoForward
              ? "text-neutral-400 text-md h-6 px-3"
              : "text-md h-6 px-3"
          }
        >
          {t("apps.internet-explorer.menu.forward")}
        </MenubarItem>
        {history.length > 0 && (
          <>
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            {history.slice(0, 10).map((entry) => (
              <MenubarItem
                key={entry.url + entry.timestamp}
                onClick={() =>
                  onNavigateToHistory?.(entry.url, entry.year || "current")
                }
                className="text-md h-6 px-3 flex items-center gap-2"
              >
                {entry.favicon &&
                typeof navigator !== "undefined" &&
                "onLine" in navigator &&
                navigator.onLine ? (
                  <img
                    src={entry.favicon}
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
                <span className="truncate">
                  {entry.title}
                  {entry.year && entry.year !== "current" && (
                    <span className="text-xs text-neutral-500 ml-1">
                      ({entry.year})
                    </span>
                  )}
                </span>
              </MenubarItem>
            ))}
            <MenubarSeparator className="h-[2px] bg-black my-1" />
            <MenubarItem onClick={onClearHistory} className="text-md h-6 px-3">
              {t("apps.internet-explorer.menu.clearHistory")}
            </MenubarItem>
          </>
        )}
      </MenubarContent>
    </MenubarMenu>
  );
}
