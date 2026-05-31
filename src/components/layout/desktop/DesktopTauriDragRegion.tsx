interface DesktopTauriDragRegionProps {
  isTauriApp: boolean;
  isXpTheme: boolean;
}

export function DesktopTauriDragRegion({
  isTauriApp,
  isXpTheme,
}: DesktopTauriDragRegionProps) {
  if (!isTauriApp || !isXpTheme) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100]"
      style={{
        height: 32,
        cursor: "default",
      }}
      onMouseDown={async (e) => {
        if (e.buttons !== 1) return;
        try {
          const { getCurrentWindow } = await import("@tauri-apps/api/window");
          if (e.detail === 2) {
            await getCurrentWindow().toggleMaximize();
          } else {
            await getCurrentWindow().startDragging();
          }
        } catch {
          // Ignore errors - Tauri window APIs may not be available in browser
        }
      }}
    />
  );
}
