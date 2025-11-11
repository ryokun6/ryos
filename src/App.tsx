import { AppManager } from "./apps/base/AppManager";
import { appRegistry } from "./config/appRegistry";
import { useEffect, useState } from "react";
import { applyDisplayMode, type DisplayMode } from "./utils/displayMode";
import { Toaster } from "./components/ui/sonner";
import { useAppStoreShallow } from "@/stores/helpers";
import { BootScreen } from "./components/dialogs/BootScreen";
import { getNextBootMessage, clearNextBootMessage } from "./utils/bootMessage";
import { AnyApp } from "./apps/base/types";

// Convert registry to array
const apps: AnyApp[] = Object.values(appRegistry);

export function App() {
  console.log("[App] 组件开始渲染");
  
  let displayMode: DisplayMode = "color";
  let isFirstBoot = true;
  let setHasBooted: () => void = () => {};
  
  try {
    const storeState = useAppStoreShallow(
      (state) => ({
        displayMode: state.displayMode,
        isFirstBoot: state.isFirstBoot,
        setHasBooted: state.setHasBooted,
      })
    );
    displayMode = storeState.displayMode;
    isFirstBoot = storeState.isFirstBoot;
    setHasBooted = storeState.setHasBooted;
    console.log("[App] Store 状态获取成功", { displayMode, isFirstBoot });
  } catch (error) {
    console.error("[App] Store 状态获取失败:", error);
  }
  
  const [bootScreenMessage, setBootScreenMessage] = useState<string | null>(
    null
  );
  const [showBootScreen, setShowBootScreen] = useState(false);

  useEffect(() => {
    console.log("[App] useEffect: applyDisplayMode", displayMode);
    try {
      applyDisplayMode(displayMode);
    } catch (error) {
      console.error("[App] applyDisplayMode 失败:", error);
    }
  }, [displayMode]);

  useEffect(() => {
    console.log("[App] useEffect: 检查启动消息");
    try {
      // Only show boot screen for system operations (reset/restore/format/debug)
      const persistedMessage = getNextBootMessage();
      if (persistedMessage) {
        console.log("[App] 发现启动消息:", persistedMessage);
        setBootScreenMessage(persistedMessage);
        setShowBootScreen(true);
      }

      // Set first boot flag without showing boot screen
      if (isFirstBoot) {
        console.log("[App] 首次启动，设置 hasBooted");
        setHasBooted();
      }
    } catch (error) {
      console.error("[App] 启动检查失败:", error);
    }
  }, [isFirstBoot, setHasBooted]);

  if (showBootScreen) {
    console.log("[App] 显示启动屏幕");
    return (
      <BootScreen
        isOpen={true}
        onOpenChange={() => {}}
        title={bootScreenMessage || "System Restoring..."}
        onBootComplete={() => {
          clearNextBootMessage();
          setShowBootScreen(false);
        }}
      />
    );
  }

  console.log("[App] 渲染主应用界面");
  try {
    return (
      <>
        <AppManager apps={apps} />
        <Toaster
          position="bottom-left"
          offset={`calc(env(safe-area-inset-bottom, 0px) + 32px)`}
        />
      </>
    );
  } catch (error) {
    console.error("[App] 渲染失败:", error);
    return (
      <div style={{ color: "white", padding: "20px", fontFamily: "monospace" }}>
        <h1>应用渲染错误</h1>
        <p>{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }
}
