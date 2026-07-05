/**
 * App Launch/Close Tool Handlers
 */

import { useAppStore } from "@/stores/useAppStore";
import { appRegistry } from "@/config/appRegistry";
import { requestCloseWindow } from "@/utils/windowUtils";
import type { AppId } from "@/config/appIds";
import type { LaunchAppOptions } from "@/hooks/useLaunchApp";
import i18n from "@/lib/i18n";
import { getTranslatedAppName } from "@/utils/i18n";
import type { ToolContext } from "./types";
import { chatToolsLog as log } from "../logging";

export interface LaunchAppInput {
  id: string;
  url?: string;
  year?: string;
}

export interface CloseAppInput {
  id: string;
}

/**
 * Handle launchApp tool call
 */
export const handleLaunchApp = (
  input: LaunchAppInput,
  toolCallId: string,
  context: ToolContext
): string => {
  const { id, url, year } = input;

  // Validate required parameter
  if (!id) {
    console.error("[ToolCall] launchApp: Missing required 'id' parameter");
    context.addToolOutput({
      tool: "launchApp",
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.noAppIdProvided"),
    });
    return "";
  }

  const appName = appRegistry[id as AppId]
    ? getTranslatedAppName(id as AppId)
    : id;
  log.debug("launchApp", { id, hasUrl: Boolean(url), year });

  const launchOptions: LaunchAppOptions = {};
  if (id === "internet-explorer" && (url || year)) {
    launchOptions.initialData = { url, year: year || "current" };
  }

  context.launchApp(id as AppId, launchOptions);

  let result = i18n.t("apps.chats.toolCalls.launchedApp", { appName });
  if (id === "internet-explorer" && url) {
    result =
      year && year !== "current"
        ? i18n.t("apps.chats.toolCalls.launchedWithUrlAndYear", { url, year })
        : i18n.t("apps.chats.toolCalls.launchedWithUrl", { url });
  }
  log.debug("launchApp result", { appId: id });
  return result;
};

/**
 * Handle closeApp tool call
 */
export const handleCloseApp = (
  input: CloseAppInput,
  toolCallId: string,
  context: ToolContext
): string => {
  const { id } = input;

  // Validate required parameter
  if (!id) {
    console.error("[ToolCall] closeApp: Missing required 'id' parameter");
    context.addToolOutput({
      tool: "closeApp",
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.noAppIdProvided"),
    });
    return "";
  }

  const appName = appRegistry[id as AppId]
    ? getTranslatedAppName(id as AppId)
    : id;
  log.debug("closeApp", { id });

  // Close all instances of the specified app
  const appStore = useAppStore.getState();
  const appInstances = appStore.getInstancesByAppId(id as AppId);
  const openInstances = appInstances.filter((inst) => inst.isOpen);

  if (openInstances.length === 0) {
    log.debug("closeApp target not running", { id });
    return i18n.t("apps.chats.toolCalls.appNotRunning", { appName });
  }

  // Close all open instances of this app (with animation and sound)
  openInstances.forEach((instance) => {
    requestCloseWindow(instance.instanceId);
  });

  log.debug("Closed app windows", { id, windowCount: openInstances.length });

  return i18n.t("apps.chats.toolCalls.closed", { appName });
};
