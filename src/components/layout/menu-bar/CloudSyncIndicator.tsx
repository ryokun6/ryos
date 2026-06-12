import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useShallow } from "zustand/react/shallow";
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
} from "@/components/ui/menubar";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { getAppIconPath } from "@/config/appRegistry";
import type { AppId } from "@/config/appRegistryData";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useSound, Sounds } from "@/hooks/useSound";
import { useCloudSyncStore } from "@/stores/useCloudSyncStore";
import {
  getCloudSyncCategory,
  type CloudSyncCategory,
  type CloudSyncDomain,
} from "@/utils/cloudSyncShared";
import {
  formatRelativeTime,
  type RelativeTimeKeys,
} from "@/utils/formatRelativeTime";

const AUTO_SYNC_TIME_KEYS: RelativeTimeKeys = {
  justNow: "apps.control-panels.autoSync.justNow",
  minutesAgo: "apps.control-panels.autoSync.minutesAgo",
  hoursAgo: "apps.control-panels.autoSync.hoursAgo",
  daysAgo: "apps.control-panels.autoSync.daysAgo",
};

const SYNC_CATEGORY_META: Record<
  CloudSyncCategory,
  { labelKey: string; appId: AppId }
> = {
  files: { labelKey: "apps.control-panels.autoSync.files", appId: "finder" },
  settings: {
    labelKey: "apps.control-panels.autoSync.settings",
    appId: "control-panels",
  },
  calendar: {
    labelKey: "apps.control-panels.autoSync.calendar",
    appId: "calendar",
  },
  contacts: {
    labelKey: "apps.control-panels.autoSync.contacts",
    appId: "contacts",
  },
  maps: { labelKey: "apps.control-panels.autoSync.maps", appId: "maps" },
  songs: { labelKey: "apps.control-panels.autoSync.songs", appId: "ipod" },
  videos: { labelKey: "apps.control-panels.autoSync.videos", appId: "videos" },
  tv: { labelKey: "apps.control-panels.autoSync.tvChannels", appId: "tv" },
  stickies: {
    labelKey: "apps.control-panels.autoSync.stickies",
    appId: "stickies",
  },
};

const SYNC_CATEGORY_ORDER: CloudSyncCategory[] = [
  "files",
  "settings",
  "calendar",
  "contacts",
  "maps",
  "songs",
  "videos",
  "tv",
  "stickies",
];

const HOVER_CLOSE_DELAY_MS = 200;

const MENU_VALUE = "cloud-sync";

interface SyncCategoryActivity {
  category: CloudSyncCategory;
  isUploading: boolean;
  isDownloading: boolean;
}

export function CloudSyncIndicator() {
  const { t } = useTranslation();
  const {
    isWindowsTheme: isXpTheme,
    isMacOSTheme,
    isSystem7Theme,
  } = useThemeFlags();
  const launchApp = useLaunchApp();
  const { play: playMenuOpen } = useSound(Sounds.MENU_OPEN);
  const { play: playMenuClose } = useSound(Sounds.MENU_CLOSE);
  const [menuValue, setMenuValue] = useState("");
  const isOpen = menuValue === MENU_VALUE;
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isCheckingRemote, lastCheckedAt, lastError, domainStatus } =
    useCloudSyncStore(
      useShallow((state) => ({
        isCheckingRemote: state.isCheckingRemote,
        lastCheckedAt: state.lastCheckedAt,
        lastError: state.lastError,
        domainStatus: state.domainStatus,
      }))
    );

  const activeCategories: SyncCategoryActivity[] = SYNC_CATEGORY_ORDER.map(
    (category) => {
      let isUploading = false;
      let isDownloading = false;
      for (const [domain, status] of Object.entries(domainStatus)) {
        if (getCloudSyncCategory(domain as CloudSyncDomain) !== category) {
          continue;
        }
        isUploading = isUploading || status.isUploading;
        isDownloading = isDownloading || status.isDownloading;
      }
      return { category, isUploading, isDownloading };
    }
  ).filter((entry) => entry.isUploading || entry.isDownloading);

  const isCloudSyncActive = isCheckingRemote || activeCategories.length > 0;

  const syncLabel = t("apps.control-panels.autoSync.title");

  const cancelScheduledClose = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => cancelScheduledClose, [cancelScheduledClose]);

  const openMenu = useCallback(() => {
    cancelScheduledClose();
    setMenuValue((wasValue) => {
      if (wasValue !== MENU_VALUE) playMenuOpen();
      return MENU_VALUE;
    });
  }, [cancelScheduledClose, playMenuOpen]);

  const scheduleClose = useCallback(() => {
    cancelScheduledClose();
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      setMenuValue((wasValue) => {
        if (wasValue === MENU_VALUE) playMenuClose();
        return "";
      });
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelScheduledClose, playMenuClose]);

  const handlePointerEnter = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      openMenu();
    },
    [openMenu]
  );

  const handlePointerLeave = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      scheduleClose();
    },
    [scheduleClose]
  );

  // Keep the indicator mounted while the menu is open so the menu does
  // not vanish mid-read when the last sync operation finishes.
  if (isXpTheme || (!isCloudSyncActive && !isOpen)) return null;

  const lastCheckedRelative = formatRelativeTime(
    lastCheckedAt,
    t,
    AUTO_SYNC_TIME_KEYS
  );

  const itemRowClass = "flex items-center gap-2 px-2 py-1 text-sm";
  const itemRowStyle: React.CSSProperties = {
    fontFamily: isMacOSTheme ? "var(--os-font-ui)" : undefined,
    fontSize: isMacOSTheme ? "var(--os-menu-item-font-size)" : undefined,
    ...(isMacOSTheme && {
      padding: "4px 16px",
      WebkitFontSmoothing: "antialiased" as const,
      textShadow: "0 2px 3px rgba(0, 0, 0, 0.25)",
    }),
  };

  return (
    <Menubar
      value={menuValue}
      onValueChange={(value) => {
        cancelScheduledClose();
        setMenuValue(value);
      }}
      className="flex items-center border-none bg-transparent p-0 space-x-0 rounded-none h-full"
    >
      <MenubarMenu value={MENU_VALUE}>
        <MenubarTrigger
          className="flex items-center justify-center px-1 border-none focus-visible:ring-0"
          style={{ marginRight: "2px" }}
          title={syncLabel}
          aria-label={syncLabel}
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          <motion.span
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="flex items-center justify-center"
          >
            <ArrowsClockwise
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${isCloudSyncActive ? "animate-spin" : ""}`}
              weight="bold"
              style={{
                opacity: isSystem7Theme ? 1 : 0.82,
                textShadow: isMacOSTheme
                  ? "0 2px 3px rgba(0, 0, 0, 0.25)"
                  : undefined,
              }}
            />
          </motion.span>
        </MenubarTrigger>
        <MenubarContent
          align="end"
          sideOffset={1}
          className="min-w-[200px]"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={cancelScheduledClose}
          onPointerLeave={handlePointerLeave}
        >
          <AnimatePresence initial={false}>
            {activeCategories.map(({ category, isUploading }) => {
              const meta = SYNC_CATEGORY_META[category];
              return (
                <motion.div
                  key={category}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className={itemRowClass} style={itemRowStyle}>
                    <ThemedIcon
                      name={getAppIconPath(meta.appId)}
                      alt=""
                      className="size-4 shrink-0 object-contain"
                    />
                    <span>{t(meta.labelKey)}</span>
                    <span className="ml-auto pl-3 text-xs opacity-60">
                      {isUploading
                        ? t("apps.control-panels.autoSync.uploading")
                        : t("apps.control-panels.autoSync.fetching")}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {activeCategories.length === 0 && (
            <div className={itemRowClass} style={itemRowStyle}>
              <span className="opacity-70">
                {lastCheckedRelative
                  ? t("apps.control-panels.autoSync.lastChecked", {
                      date: lastCheckedRelative,
                    })
                  : t("apps.control-panels.autoSync.waiting")}
              </span>
            </div>
          )}
          {lastError && (
            <div className={itemRowClass} style={itemRowStyle}>
              <span className="text-red-600 break-words">
                {t("apps.control-panels.autoSync.error", { error: lastError })}
              </span>
            </div>
          )}
          <MenubarSeparator />
          <MenubarItem
            onSelect={() => {
              setMenuValue("");
              launchApp("control-panels", {
                initialData: { defaultTab: "sync" },
              });
            }}
          >
            {t("apps.control-panels.autoSync.openSettings")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
