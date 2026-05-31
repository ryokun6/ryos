import { Button } from "@/components/ui/button";
import { Trash, Star } from "@phosphor-icons/react";
import type { Applet } from "../../utils/appletActions";
import type { AppStoreViewModel } from "./useAppStore";
import { formatUpdateTime } from "./utils";

interface AppStoreAppletItemProps {
  applet: Applet;
  vm: AppStoreViewModel;
}

export function AppStoreAppletItem({ applet, vm }: AppStoreAppletItemProps) {
  const {
    t,
    focusWindow,
    isAdmin,
    isMacTheme,
    isSystem7Theme,
    isBulkUpdating,
    actions,
    handleAppletClick,
    handleInstall,
    handleDelete,
    handleToggleFeatured,
  } = vm;

  const displayName =
    applet.title || applet.name || t("apps.applet-viewer.dialogs.untitledApplet");
  const displayIcon = applet.icon || "📱";
  const installed = actions.isAppletInstalled(applet.id);
  const updateAvailable = actions.needsUpdate(applet);

  return (
    <div
      key={applet.id}
      className="group flex items-center gap-3 px-3 py-2 rounded transition-colors cursor-pointer hover:bg-neutral-100"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest('[role="button"]')) {
          return;
        }
        focusWindow?.();
        void handleAppletClick(applet);
      }}
    >
      <div
        className="!text-4xl flex-shrink-0 applet-icon flex items-center justify-center"
        style={{ fontSize: "2.25rem", width: "3rem" }}
      >
        {displayIcon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm font-geneva-12 truncate">{displayName}</span>
        </div>
        {updateAvailable && applet.createdAt ? (
          <div className="text-[10px] text-neutral-500 font-geneva-12 truncate">
            {formatUpdateTime(applet.createdAt, t)}
          </div>
        ) : applet.createdBy ? (
          <div className="text-[10px] text-neutral-500 font-geneva-12 truncate">
            {applet.createdBy}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {isAdmin && (
          <div className="flex items-center gap-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleToggleFeatured(applet.id, applet.featured || false);
              }}
              className="p-1 hover:bg-neutral-200 rounded transition-all inline-flex md:hidden md:group-hover:inline-flex"
              title={
                applet.featured
                  ? t("apps.applet-viewer.labels.removeFromFeatured")
                  : t("apps.applet-viewer.labels.addToFeatured")
              }
            >
              <Star
                className={`size-4 ${applet.featured ? "text-yellow-400" : "text-neutral-400"}`}
                weight={applet.featured ? "fill" : "bold"}
              />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(applet.id);
              }}
              className="p-1 hover:bg-neutral-200 rounded transition-all text-neutral-400 inline-flex md:hidden md:group-hover:inline-flex"
              title={t("apps.applet-viewer.labels.deleteApplet")}
            >
              <Trash className="size-4" weight="bold" />
            </button>
          </div>
        )}
        <Button
          size="sm"
          variant={
            updateAvailable
              ? "default"
              : isMacTheme
                ? "secondary"
                : isSystem7Theme
                  ? "retro"
                  : "default"
          }
          onClick={(e) => {
            e.stopPropagation();
            focusWindow?.();
            if (installed) {
              if (updateAvailable) {
                void handleInstall(applet);
              } else {
                void handleAppletClick(applet);
              }
            } else {
              void handleInstall(applet);
            }
          }}
          disabled={isBulkUpdating}
        >
          {installed
            ? updateAvailable
              ? t("apps.applet-viewer.status.update")
              : t("apps.applet-viewer.status.open")
            : t("apps.applet-viewer.status.get")}
        </Button>
      </div>
    </div>
  );
}
