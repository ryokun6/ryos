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
import type { SyncCategory as CloudSyncCategory } from "@/shared/sync2/namespaces";
import {
  formatRelativeTime,
  type RelativeTimeKeys,
} from "@/utils/formatRelativeTime";
import { formatUploadingStatus } from "@/apps/control-panels/components/control-panels-app/syncUtils";

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
  books: { labelKey: "apps.control-panels.autoSync.books", appId: "books" },
};

const SYNC_CATEGORY_ORDER: CloudSyncCategory[] = [
  "files",
  "settings",
  "calendar",
  "contacts",
  "books",
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
  uploadProgress: number | null;
}

export function CloudSyncIndicator() {
  const { t } = useTranslation();
  const {
    isWindowsTheme,
    isMacOSTheme,
    isSystem7Theme,
  } = useThemeFlags();
  const launchApp = useLaunchApp();
  const [menuValue, setMenuValue] = useState("");
  const isOpen = menuValue === MENU_VALUE;

  const { isCheckingRemote, lastCheckedAt, lastError, categoryStatus } =
    useCloudSyncStore(
      useShallow((state) => ({
        isCheckingRemote: state.isCheckingRemote,
        lastCheckedAt: state.lastCheckedAt,
        lastError: state.lastError,
        categoryStatus: state.categoryStatus,
      }))
    );

  const activeCategories: SyncCategoryActivity[] = SYNC_CATEGORY_ORDER.map(
    (category) => ({
      category,
      isUploading: categoryStatus[category].isUploading,
      isDownloading: categoryStatus[category].isDownloading,
      uploadProgress: categoryStatus[category].uploadProgress,
    })
  ).filter((entry) => entry.isUploading || entry.isDownloading);

  const isCloudSyncActive = isCheckingRemote || activeCategories.length > 0;
  const activeUploadProgress = activeCategories
    .map((entry) => entry.uploadProgress)
    .filter((progress): progress is number => typeof progress === "number");
  const triggerUploadProgress =
    activeUploadProgress.length > 0
      ? Math.round(
          activeUploadProgress.reduce((sum, progress) => sum + progress, 0) /
            activeUploadProgress.length
        )
      : null;

  const syncLabel = t("apps.control-panels.autoSync.title");

  // Keep the indicator mounted while the menu is open so the menu does
  // not vanish mid-read when the last sync operation finishes.
  if (isWindowsTheme || (!isCloudSyncActive && !isOpen)) return null;

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
            className="flex items-center justify-center gap-1"
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
            {triggerUploadProgress !== null && (
              <span className="min-w-[2.1em] text-[10px] leading-none tabular-nums opacity-80">
                {triggerUploadProgress}%
              </span>
            )}
          </motion.span>
        </MenubarTrigger>
        <MenubarContent
          align="end"
          sideOffset={1}
          className="min-w-[200px]"
        >
          <AnimatePresence initial={false}>
            {activeCategories.map(({ category, isUploading, uploadProgress }) => {
              const meta = SYNC_CATEGORY_META[category];
              const progress =
                typeof uploadProgress === "number"
                  ? Math.round(Math.max(0, Math.min(100, uploadProgress)))
                  : null;
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
                    className="text-md min-h-7 px-3 flex items-center gap-2"
                    onSelect={(event) => event.preventDefault()}
                  >
                    <ThemedIcon
                      name={getAppIconPath(meta.appId)}
                      alt=""
                      className="size-4 shrink-0 object-contain"
                    />
                    <span className="min-w-0 flex-1">
                      <span>{t(meta.labelKey)}</span>
                      {isUploading && progress !== null && (
                        <span
                          className="mt-1 block h-1 overflow-hidden rounded-full bg-black/15 os-dark:bg-white/20"
                          aria-hidden="true"
                        >
                          <span
                            className="block h-full rounded-full bg-current opacity-70"
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                      )}
                    </span>
                    <span className="ml-auto pl-3 text-xs tabular-nums opacity-60">
                      {isUploading
                        ? formatUploadingStatus(uploadProgress, t)
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
