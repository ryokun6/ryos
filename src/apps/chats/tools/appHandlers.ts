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
  if (!validateAppId(id, "launchApp", toolCallId, context)) {
    return "";
  }

  const appName = appRegistry[id as AppId]?.name || id;
  console.log("[ToolCall] launchApp:", { id, url, year });

  const launchOptions: LaunchAppOptions = {};
  if (id === "internet-explorer" && (url || year)) {
    launchOptions.initialData = { url, year: year || "current" };
  }

  context.launchApp(id as AppId, launchOptions);

  let result = `Launched ${appName}`;
  if (id === "internet-explorer") {
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
  context: ToolContext
): string => {
  const { id } = input;

  // Validate required parameter
  if (!validateAppId(id, "closeApp", toolCallId, context)) {
    return "";
  }

  const appName = appRegistry[id as AppId]?.name || id;
  console.log("[ToolCall] closeApp:", id);

  // Close all instances of the specified app
  const appStore = useAppStore.getState();
  const appInstances = appStore.getInstancesByAppId(id as AppId);
  const openInstances = appInstances.filter((inst) => inst.isOpen);

  if (openInstances.length === 0) {
    console.log(`[ToolCall] ${appName} is not currently running.`);
    return `${appName} is not running`;
  }

  // Close all open instances of this app (with animation and sound)
  openInstances.forEach((instance) => {
    requestCloseWindow(instance.instanceId);
  });

  console.log(
    `[ToolCall] Closed ${appName} (${openInstances.length} window${
      openInstances.length === 1 ? "" : "s"
    }).`
  );

  return `Closed ${appName}`;
};

type AppToolName = "launchApp" | "closeApp";

function validateAppId(
  id: string | undefined,
  tool: AppToolName,
  toolCallId: string,
  context: ToolContext
): id is string {
  if (id) {
    return true;
  }

  console.error(`[ToolCall] ${tool}: Missing required 'id' parameter`);
  context.addToolResult({
    tool,
    toolCallId,
    state: "output-error",
    errorText: i18n.t("apps.chats.toolCalls.noAppIdProvided"),
  });
  return false;
}
