import { appletIconStyles } from "./constants";
import { useAppStoreFeedController } from "./useAppStoreFeedController";
import type { UseAppStoreFeedControllerArgs } from "./useAppStoreFeedController";
import { AppStoreFeedMotionStack } from "./AppStoreFeedMotionStack";

export function AppStoreFeed(props: UseAppStoreFeedControllerArgs) {
  const c = useAppStoreFeedController(props);

  if (c.isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-neutral-600 font-geneva-12 shimmer-gray">
            {c.t("apps.applet-viewer.dialogs.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (c.applets.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="text-center px-6 font-geneva-12">
          <p className="text-[11px] text-neutral-600 font-geneva-12">
            {c.t("apps.applet-viewer.dialogs.noAppletsAvailable")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{appletIconStyles}</style>
      <AppStoreFeedMotionStack
        feedRef={c.feedRef}
        visibleApplets={c.visibleApplets}
        startIndex={c.startIndex}
        currentIndex={c.currentIndex}
        applets={c.applets}
        navigationDirection={c.navigationDirection}
        scrollToIndex={c.scrollToIndex}
        appletContents={c.appletContents}
        loadingContents={c.loadingContents}
        cardProps={{
          isMacTheme: c.isMacTheme,
          isSystem7Theme: c.isSystem7Theme,
          isWindowsTheme: c.isWindowsTheme,
          actions: c.actions,
          t: c.t,
          scrollToIndex: c.scrollToIndex,
          onPreviewClick: c.handlePreviewClick,
          onInstall: c.handleInstall,
          onAppletClick: c.handleAppletClick,
        }}
      />
    </>
  );
}
