import type { AppId } from "@/config/appRegistry";
import { getTranslatedAppName } from "@/utils/i18n";

export function getAppName(appId: string): string {
  return getTranslatedAppName(appId as AppId);
}
