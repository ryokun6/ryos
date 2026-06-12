import { useState } from "react";
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
  const [menuValue, setMenuValue] = useState("");
  const isOpen = menuValue === MENU_VALUE;

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

  // Keep the indicator mounted while the menu is open so the menu does
  // not vanish mid-read when the last sync operation finishes.
  if (isXpTheme || (!isCloudSyncActive && !isOpen)) return null;

  const lastCheckedRelative = formatRelativeTime(
    lastCheckedAt,
    t,
    AUTO_SYNC_TIME_KEYS
  );

  return (
    <Menubar
      value={menuValue}
      onValueChange={setMenuValue}
      className="flex items-stretch self-stretch border-none bg-transparent p-0 space-x-0 rounded-none h-full"
    >
      <MenubarMenu value={MENU_VALUE}>
        <MenubarTrigger
          className="flex items-center justify-center px-2 border-none focus-visible:ring-0"
          title={syncLabel}
          aria-label={syncLabel}
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
                  <MenubarItem
                    className="text-md h-6 px-3 flex items-center gap-2"
                    onSelect={(event) => event.preventDefault()}
                  >
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
                  </MenubarItem>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {activeCategories.length === 0 && (
            <MenubarItem disabled className="text-md h-6 px-3 opacity-70">
              {lastCheckedRelative
                ? t("apps.control-panels.autoSync.lastChecked", {
                    date: lastCheckedRelative,
                  })
                : t("apps.control-panels.autoSync.waiting")}
            </MenubarItem>
          )}
          {lastError && (
            <MenubarItem
              disabled
              className="text-md min-h-6 px-3 text-red-600 break-words whitespace-normal"
            >
              {t("apps.control-panels.autoSync.error", { error: lastError })}
            </MenubarItem>
          )}
          <MenubarSeparator />
          <MenubarItem
            className="text-md h-6 px-3"
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
