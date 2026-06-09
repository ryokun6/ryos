import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, DownloadSimple, MagnifyingGlass, XCircle, SidebarSimple, IdentificationCard } from "@phosphor-icons/react";
import type { ContactsAppController } from "./useContactsAppController";

type ContactsToolbarProps = {
  c: ContactsAppController;
};

export function ContactsToolbar({ c }: ContactsToolbarProps) {
  const {
    t,
    isMacOsxTheme,
    isXpTheme,
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
        isMacOsxTheme ? "px-1" : "px-2"
      )}
      style={{
        background: isXpTheme ? "#ECE9D8" : isMacOsxTheme ? "transparent" : "#e0e0e0",
      }}
    >
      {isMacOsxTheme ? (
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
            <div className={cn("relative", isMobileLayout ? "flex-1 min-w-0 max-w-none" : "w-[150px]")}>
              <MagnifyingGlass
                size={13}
                weight="bold"
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-black/45 os-search-icon"
              />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label={t("apps.contacts.searchPlaceholder")}
                title={t("apps.contacts.searchPlaceholder")}
                data-os-search-input="true"
                className="w-full rounded-full border border-black/40 bg-white pl-7 pr-7 py-[3px] text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3),inset_0_0_1px_rgba(0,0,0,0.15),0_1px_0_rgba(255,255,255,0.45)] outline-none font-geneva-12"
              />
              {searchQuery && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center text-black/40 hover:text-black/60"
                  aria-label={t("spotlight.ariaLabels.clearSearch")}
                  title={t("spotlight.ariaLabels.clearSearch")}
                >
                  <XCircle size={14} weight="fill" />
                </button>
              )}
            </div>
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
                className={cn("size-6 px-0", isXpTheme && "text-black")}
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
              className={cn("size-6 px-0", isXpTheme && "text-black")}
              title={t("apps.contacts.views.cardOnly", { defaultValue: "Card Only" })}
            >
              <IdentificationCard size={14} />
            </Button>
            <Button
              type="button"
              variant={isSystem7Theme ? "player" : "ghost"}
              onClick={handleCreateContactAndEdit}
              className={cn("size-6 px-0", isXpTheme && "text-black")}
              title={t("apps.contacts.menu.newContact")}
            >
              <Plus size={12} weight="bold" />
            </Button>
            <Button
              type="button"
              variant={isSystem7Theme ? "player" : "ghost"}
              onClick={handleImport}
              className={cn("size-6 px-0", isXpTheme && "text-black")}
              title={t("apps.contacts.menu.importVCard")}
            >
              <DownloadSimple size={12} weight="bold" />
            </Button>
          </div>
          <div className="flex-1" />
          <div className={cn("flex items-center gap-2 min-w-0", isMobileLayout && "flex-1")}>
            <div className={cn("relative min-w-0", isMobileLayout ? "flex-1 max-w-none" : "w-[170px]")}>
              <MagnifyingGlass
                size={13}
                weight="bold"
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-black/35 os-search-icon"
              />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                aria-label={t("apps.contacts.searchPlaceholder")}
                title={t("apps.contacts.searchPlaceholder")}
                data-os-search-input="true"
                className="w-full rounded-full border border-black/20 bg-white pl-7 pr-7 py-1 text-[11px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.12)] outline-none min-w-0"
              />
              {searchQuery && (
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center text-black/35 hover:text-black/55"
                  aria-label={t("spotlight.ariaLabels.clearSearch")}
                  title={t("spotlight.ariaLabels.clearSearch")}
                >
                  <XCircle size={14} weight="fill" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
