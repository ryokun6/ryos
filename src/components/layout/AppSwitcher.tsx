import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { appRegistry, getAppIconPath } from "@/config/appRegistry";
import type { AppId } from "@/config/appRegistry";
import { ThemedIcon } from "@/components/shared/ThemedIcon";

export interface SwitcherApp {
  appId: AppId;
  instanceId: string;
}

interface AppSwitcherProps {
  isVisible: boolean;
  apps: SwitcherApp[];
  selectedIndex: number;
}

export function AppSwitcher({ isVisible, apps, selectedIndex }: AppSwitcherProps) {
  return createPortal(
    <AnimatePresence>
      {isVisible && apps.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className="fixed inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 99999 }}
        >
          <div className="relative">
            <div
              className="flex items-center gap-1 p-3 rounded-[22px] bg-black/70 border border-white/15 shadow-2xl"
            >
              {apps.map(({ appId }, index) => {
                const iconSrc = getAppIconPath(appId);
                const isSelected = index === selectedIndex;
                const isEmojiIcon =
                  iconSrc &&
                  !iconSrc.startsWith("/") &&
                  !iconSrc.startsWith("http") &&
                  iconSrc.length <= 10;
                return (
                  <div
                    key={appId}
                    className={`rounded-[14px] p-1.5 ${
                      isSelected
                        ? "bg-white/20 ring-[3px] ring-white/60"
                        : ""
                    }`}
                  >
                    {isEmojiIcon ? (
                      <span className="flex h-16 w-16 items-center justify-center text-5xl leading-none">
                        {iconSrc}
                      </span>
                    ) : (
                      <ThemedIcon
                        name={iconSrc}
                        alt={appRegistry[appId]?.name ?? appId}
                        className="w-16 h-16 object-contain"
                        draggable={false}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-center mt-2">
              <span
                className="text-white text-xs font-bold px-3 py-1 rounded-full truncate max-w-[140px] bg-black/70 border border-white/15"
              >
                {appRegistry[apps[selectedIndex]?.appId]?.name ?? ""}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
