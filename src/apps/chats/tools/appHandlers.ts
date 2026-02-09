/**
 * App Launch/Close Tool Handlers
 */

import { useAppStore } from "@/stores/useAppStore";
import { appRegistry } from "@/config/appRegistry";
import { requestCloseWindow } from "@/utils/windowUtils";
import type { AppId } from "@/config/appIds";
import type { LaunchAppOptions } from "@/hooks/useLaunchApp";
import i18n from "@/lib/i18n";
import type { ToolContext } from "./types";

export interface LaunchAppInput {
  id: string;
  url?: string;
  year?: string;
}

export interface CloseAppInput {
  id: string;
}

type AppHandlersDependencies = {
  getAppNameById?: (appId: AppId) => string;
  getInstancesByAppId?: (appId: AppId) => Array<{ instanceId: string; isOpen: boolean }>;
  closeWindowByInstanceId?: (instanceId: string) => void;
};

const resolveRegisteredApp = (
  id: string,
  getAppNameById?: (appId: AppId) => string,
): { appId: AppId; appName: string } | null => {
  const appId = id as AppId;
  if (!appRegistry[appId]) {
    return null;
  }

  return {
    appId,
    appName: getAppNameById ? getAppNameById(appId) : appRegistry[appId].name,
  };
};

/**
 * Handle launchApp tool call
 */
export const handleLaunchApp = (
  input: LaunchAppInput,
  toolCallId: string,
  context: ToolContext,
  dependencies: AppHandlersDependencies = {},
): string => {
  const { id, url, year } = input;

  // Validate required parameter
  if (!id) {
    console.error("[ToolCall] launchApp: Missing required 'id' parameter");
    context.addToolResult({
      tool: "launchApp",
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.noAppIdProvided"),
    });
    return "";
  }

  const resolvedApp = resolveRegisteredApp(id, dependencies.getAppNameById);
  if (!resolvedApp) {
    context.addToolResult({
      tool: "launchApp",
      toolCallId,
      state: "output-error",
      errorText: `Application not found: ${id}`,
    });
    return "";
  }

  const { appId, appName } = resolvedApp;
  console.log("[ToolCall] launchApp:", { id, url, year });

  const launchOptions: LaunchAppOptions = {};
  if (id === "internet-explorer" && (url || year)) {
    launchOptions.initialData = { url, year: year || "current" };
  }

  context.launchApp(appId, launchOptions);

  let result = `Launched ${appName}`;
  if (appId === "internet-explorer") {
    const urlPart = url ? ` to ${url}` : "";
    const yearPart = year && year !== "current" ? ` in ${year}` : "";
    result += `${urlPart}${yearPart}`;
  }
  console.log(`[ToolCall] ${result}`);
  return result;
};

/**
 * Handle closeApp tool call
 */
export const handleCloseApp = (
  input: CloseAppInput,
  toolCallId: string,
  context: ToolContext,
  dependencies: AppHandlersDependencies = {},
): string => {
  const { id } = input;

  // Validate required parameter
  if (!id) {
    console.error("[ToolCall] closeApp: Missing required 'id' parameter");
    context.addToolResult({
      tool: "closeApp",
      toolCallId,
      state: "output-error",
      errorText: i18n.t("apps.chats.toolCalls.noAppIdProvided"),
    });
    return "";
  }

  const resolvedApp = resolveRegisteredApp(id, dependencies.getAppNameById);
  if (!resolvedApp) {
    context.addToolResult({
      tool: "closeApp",
      toolCallId,
      state: "output-error",
      errorText: `Application not found: ${id}`,
    });
    return "";
  }

  const { appId, appName } = resolvedApp;
  console.log("[ToolCall] closeApp:", id);

  // Close all instances of the specified app
  const getInstancesByAppId =
    dependencies.getInstancesByAppId ??
    ((targetAppId: AppId) => useAppStore.getState().getInstancesByAppId(targetAppId));
  const closeWindowByInstanceId =
    dependencies.closeWindowByInstanceId ?? requestCloseWindow;

  const appInstances = getInstancesByAppId(appId);
  const openInstances = appInstances.filter((inst) => inst.isOpen);

  if (openInstances.length === 0) {
    console.log(`[ToolCall] ${appName} is not currently running.`);
    return `${appName} is not running`;
  }

  // Close all open instances of this app (with animation and sound)
  openInstances.forEach((instance) => {
    closeWindowByInstanceId(instance.instanceId);
  });

  console.log(
    `[ToolCall] Closed ${appName} (${openInstances.length} window${
      openInstances.length === 1 ? "" : "s"
    }).`
  );

  return `Closed ${appName}`;
};
