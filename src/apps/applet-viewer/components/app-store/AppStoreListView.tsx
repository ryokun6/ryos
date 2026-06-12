import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { Sparkle } from "@phosphor-icons/react";
import type { AppStoreViewModel } from "./useAppStore";
import { AppStoreAppletItem } from "./AppStoreAppletItem";

interface AppStoreListViewProps {
  vm: AppStoreViewModel;
}

export function AppStoreListView({ vm }: AppStoreListViewProps) {
  const {
    t,
    searchQuery,
    setSearchQuery,
    setShowListView,
    isXpTheme,
    isMacChrome,
    isSystem7Chrome,
    filteredApplets,
    updatesAvailable,
    featuredApplets,
    allApplets,
    installedApplets,
  } = vm;

  return (
    <>
      <div
        className={`px-3 py-2 flex items-center gap-1 ${
          isXpTheme
            ? "border-b border-[#919b9c]"
            : isMacChrome
              ? ""
              : isSystem7Chrome
                ? "bg-neutral-100 border-b border-black"
                : "bg-neutral-100 border-b border-neutral-200"
        }`}
        style={{
          background: isXpTheme ? "transparent" : undefined,
          backgroundImage: isMacChrome ? "var(--os-pinstripe-window)" : undefined,
          borderBottom: isMacChrome
            ? `var(--os-metrics-titlebar-border-width, 1px) solid var(--os-color-titlebar-border-inactive, rgba(0, 0, 0, 0.2))`
            : undefined,
        }}
      >
        <SearchInput
          placeholder={t("apps.applet-viewer.labels.searchApplets")}
          value={searchQuery}
          onChange={setSearchQuery}
          className="flex-1"
          inputClassName={
            isXpTheme
              ? "!text-[11px]"
              : isMacChrome
                ? "!text-[12px] h-[26px] py-[2px]"
                : "!text-[16px]"
          }
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowListView(false)}
          className="flex items-center gap-1 px-1"
        >
          <Sparkle className="size-4" weight="fill" />
          <span className="text-xs font-geneva-12">{t("apps.applet-viewer.labels.discover")}</span>
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="space-y-1">
          {filteredApplets.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px] text-neutral-600 font-geneva-12">
                {t("apps.applet-viewer.dialogs.noAppletsFound", { query: searchQuery })}
              </p>
            </div>
          ) : (
            <>
              {updatesAvailable.length > 0 && (
                <>
                  <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                    <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                      {t("apps.applet-viewer.sections.updatesAvailable")}
                    </h3>
                  </div>
                  {updatesAvailable.map((applet) => (
                    <AppStoreAppletItem key={applet.id} applet={applet} vm={vm} />
                  ))}
                </>
              )}
              {featuredApplets.length > 0 && (
                <>
                  <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                    <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                      {t("apps.applet-viewer.sections.featured")}
                    </h3>
                  </div>
                  {featuredApplets.map((applet) => (
                    <AppStoreAppletItem key={applet.id} applet={applet} vm={vm} />
                  ))}
                </>
              )}
              {allApplets.length > 0 && (
                <>
                  <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                    <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                      {t("apps.applet-viewer.sections.newApplets")}
                    </h3>
                  </div>
                  {allApplets.map((applet) => (
                    <AppStoreAppletItem key={applet.id} applet={applet} vm={vm} />
                  ))}
                </>
              )}
              {installedApplets.length > 0 && (
                <>
                  <div className="mt-2 px-4 pt-2 pb-1 w-full flex items-center">
                    <h3 className="!text-[11px] uppercase tracking-wide text-black/50 font-geneva-12">
                      {t("apps.applet-viewer.sections.installed")}
                    </h3>
                  </div>
                  {installedApplets.map((applet) => (
                    <AppStoreAppletItem key={applet.id} applet={applet} vm={vm} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
