import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { cn } from "@/lib/utils";
import { osToolbarSurfaceClassName } from "@/components/shared/osThemePrimitives";
import { Plus, DownloadSimple, SidebarSimple, IdentificationCard } from "@phosphor-icons/react";
import type { ContactsAppController } from "./useContactsAppController";

type ContactsToolbarProps = {
  c: ContactsAppController;
};

export function ContactsToolbar({ c }: ContactsToolbarProps) {
  const {
    t,
    isMacOSTheme,
    isWindowsTheme,
    isSystem7Theme,
    isMobileLayout,
    showGroupSidebar,
    setShowGroupSidebar,
    isCardOnlyView,
    setIsCardOnlyView,
    handleCreateContactAndEdit,
    handleImport,
    searchQuery,
    setSearchQuery,
  } = c;

  return (
    <div
      className={cn(
        "flex items-center justify-between py-1.5 gap-2",
        isMacOSTheme ? "px-1" : "px-2",
        osToolbarSurfaceClassName({
          isMacOSTheme,
          isSystem7Theme,
          isWindowsTheme,
        })
      )}
    >
      {isMacOSTheme ? (
        <>
          <div className="flex items-center gap-1.5">
            <div className="metal-inset-btn-group">
              {!isMobileLayout && (
                <button
                  type="button"
                  className="metal-inset-btn metal-inset-icon"
                  data-state={showGroupSidebar && !isCardOnlyView ? "on" : "off"}
                  onClick={() => setShowGroupSidebar((current) => !current)}
                  title={t("apps.contacts.views.toggleGroups", { defaultValue: "Toggle Groups" })}
                  aria-label={t("apps.contacts.views.toggleGroups", { defaultValue: "Toggle Groups" })}
                >
                  <SidebarSimple size={14} />
                </button>
              )}
              <button
                type="button"
                className="metal-inset-btn metal-inset-icon"
                data-state={isCardOnlyView ? "on" : "off"}
                onClick={() => setIsCardOnlyView((current) => !current)}
                title={t("apps.contacts.views.cardOnly", { defaultValue: "Card Only" })}
                aria-label={t("apps.contacts.views.cardOnly", { defaultValue: "Card Only" })}
              >
                <IdentificationCard size={14} />
              </button>
            </div>
            <div className="metal-inset-btn-group">
              <button
                type="button"
                className="metal-inset-btn metal-inset-icon"
                onClick={handleCreateContactAndEdit}
                title={t("apps.contacts.menu.newContact")}
              >
                <Plus size={12} weight="bold" />
              </button>
              <button
                type="button"
                className="metal-inset-btn metal-inset-icon"
                onClick={handleImport}
                title={t("apps.contacts.menu.importVCard")}
              >
                <DownloadSimple size={12} weight="bold" />
              </button>
            </div>
          </div>
          <div className="flex-1" />
          <div className={cn("flex items-center gap-2", isMobileLayout && "flex-1 min-w-0")}>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              ariaLabel={t("apps.contacts.searchPlaceholder")}
              title={t("apps.contacts.searchPlaceholder")}
              clearAriaLabel={t("spotlight.ariaLabels.clearSearch")}
              className={cn(isMobileLayout ? "flex-1 max-w-none" : "w-[150px]")}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-0">
            {!isMobileLayout && (
              <Button
                type="button"
                variant={isSystem7Theme ? "player" : "ghost"}
                onClick={() => setShowGroupSidebar((current) => !current)}
                data-state={showGroupSidebar && !isCardOnlyView ? "on" : "off"}
                className={cn("size-6 px-0", isWindowsTheme && "text-black")}
                title={t("apps.contacts.views.toggleGroups", { defaultValue: "Toggle Groups" })}
              >
                <SidebarSimple size={14} />
              </Button>
            )}
            <Button
              type="button"
              variant={isSystem7Theme ? "player" : "ghost"}
              onClick={() => setIsCardOnlyView((current) => !current)}
              data-state={isCardOnlyView ? "on" : "off"}
              className={cn("size-6 px-0", isWindowsTheme && "text-black")}
              title={t("apps.contacts.views.cardOnly", { defaultValue: "Card Only" })}
            >
              <IdentificationCard size={14} />
            </Button>
            <Button
              type="button"
              variant={isSystem7Theme ? "player" : "ghost"}
              onClick={handleCreateContactAndEdit}
              className={cn("size-6 px-0", isWindowsTheme && "text-black")}
              title={t("apps.contacts.menu.newContact")}
            >
              <Plus size={12} weight="bold" />
            </Button>
            <Button
              type="button"
              variant={isSystem7Theme ? "player" : "ghost"}
              onClick={handleImport}
              className={cn("size-6 px-0", isWindowsTheme && "text-black")}
              title={t("apps.contacts.menu.importVCard")}
            >
              <DownloadSimple size={12} weight="bold" />
            </Button>
          </div>
          <div className="flex-1" />
          <div className={cn("flex items-center gap-2 min-w-0", isMobileLayout && "flex-1")}>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              ariaLabel={t("apps.contacts.searchPlaceholder")}
              title={t("apps.contacts.searchPlaceholder")}
              clearAriaLabel={t("spotlight.ariaLabels.clearSearch")}
              className={cn(isMobileLayout ? "flex-1 max-w-none" : "w-[170px]")}
            />
          </div>
        </>
      )}
    </div>
  );
}
