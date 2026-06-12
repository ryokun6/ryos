import {
  formatRelativeTime,
  type RelativeTimeKeys,
  type TranslateFn,
} from "@/utils/formatRelativeTime";

const ADMIN_TIME_KEYS: RelativeTimeKeys = {
  justNow: "apps.admin.time.now",
  minutesAgo: "apps.admin.time.minutesAgo",
  hoursAgo: "apps.admin.time.hoursAgo",
  daysAgo: "apps.admin.time.daysAgo",
};

/** Relative-time formatter using the admin app's i18n namespace. */
export function formatAdminRelativeTime(
  timestamp: number,
  t: TranslateFn
): string {
  return formatRelativeTime(timestamp, t, ADMIN_TIME_KEYS);
}
