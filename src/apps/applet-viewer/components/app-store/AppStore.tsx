import { appletIconStyles } from "./constants";
import { useAppStore } from "./useAppStore";
import type { AppStoreProps } from "./types";
import { AppStoreDetailView } from "./AppStoreDetailView";
import { AppStoreFeedView } from "./AppStoreFeedView";
import { AppStoreListView } from "./AppStoreListView";

export function AppStore(props: AppStoreProps) {
  const vm = useAppStore(props);
  const { t, isLoading, applets, selectedApplet, showListView } = vm;

  if (isLoading) {
    return (
      <>
        <style>{appletIconStyles}</style>
        <div className="size-full flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-neutral-600 font-geneva-12 shimmer-gray">
              {t("apps.applet-viewer.dialogs.loading")}
            </p>
          </div>
        </div>
      </>
    );
  }

  if (applets.length === 0) {
    return (
      <>
        <style>{appletIconStyles}</style>
        <div className="size-full flex items-center justify-center">
          <div className="text-center px-6 font-geneva-12">
            <p className="text-[11px] text-neutral-600 font-geneva-12">
              {t("apps.applet-viewer.dialogs.noAppletsAvailable")}
            </p>
          </div>
        </div>
      </>
    );
  }

  if (selectedApplet) {
    return <AppStoreDetailView vm={vm} />;
  }

  return (
    <>
      <style>{appletIconStyles}</style>
      <div className="size-full flex flex-col">
        {!showListView ? <AppStoreFeedView vm={vm} /> : <AppStoreListView vm={vm} />}
      </div>
    </>
  );
}
