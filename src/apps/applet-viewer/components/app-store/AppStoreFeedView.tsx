import { Button } from "@/components/ui/button";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { AppStoreFeed } from "../AppStoreFeed";
import type { AppStoreViewModel } from "./useAppStore";

interface AppStoreFeedViewProps {
  vm: AppStoreViewModel;
}

export function AppStoreFeedView({ vm }: AppStoreFeedViewProps) {
  const { t, theme, focusWindow, feedRef, isMacTheme, setShowListView, setSelectedApplet } =
    vm;

  return (
    <div className="flex-1 overflow-hidden relative">
      <AppStoreFeed
        ref={feedRef}
        theme={theme}
        focusWindow={focusWindow}
        onAppletSelect={(applet) => {
          focusWindow?.();
          setSelectedApplet(applet);
        }}
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        <Button
          variant={isMacTheme ? "aqua" : "default"}
          size="sm"
          onClick={() => feedRef.current?.goToPrevious()}
          className={`size-7 p-0 flex items-center justify-center ${
            isMacTheme ? "rounded-full" : "rounded-none"
          }`}
          style={{ height: "28px", width: "28px" }}
        >
          <CaretLeft className="size-4" weight="bold" />
        </Button>
        <Button
          variant={isMacTheme ? "aqua" : "default"}
          size="sm"
          onClick={() => setShowListView(true)}
          style={{ height: "28px" }}
        >
          <span className="text-sm font-medium font-geneva-12">
            {t("apps.applet-viewer.labels.showAll")}
          </span>
        </Button>
        <Button
          variant={isMacTheme ? "aqua" : "default"}
          size="sm"
          onClick={() => feedRef.current?.goToNext()}
          className={`size-7 p-0 flex items-center justify-center ${
            isMacTheme ? "rounded-full" : "rounded-none"
          }`}
          style={{ height: "28px", width: "28px" }}
        >
          <CaretRight className="size-4" weight="bold" />
        </Button>
      </div>
    </div>
  );
}
