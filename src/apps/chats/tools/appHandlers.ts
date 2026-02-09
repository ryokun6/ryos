/**
 * App Launch/Close Tool Handlers
 */

import { appIds, appNames } from "@/config/appRegistryData";
import type { AppId } from "@/config/appIds";
import type { LaunchAppOptions } from "@/hooks/useLaunchApp";
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
  translate?: (key: string, params?: Record<string, unknown>) => string;
};

const translateError = ({
  dependencies,
  key,
  fallback,
  params,
}: {
  dependencies: AppHandlersDependencies;
  key: string;
  fallback: string;
  params?: Record<string, unknown>;
}): string => {
  const translated = dependencies.translate?.(key, params);
  return typeof translated === "string" && translated.trim().length > 0
    ? translated
    : fallback;
};

const resolveRegisteredApp = (
  id: string,
  getAppNameById?: (appId: AppId) => string,
): { appId: AppId; appName: string } | null => {
  const appId = id as AppId;
  if (!appIds.includes(appId)) {
    return null;
  }

  return {
    appId,
    appName: getAppNameById ? getAppNameById(appId) : appNames[appId],
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
      errorText: translateError({
        dependencies,
        key: "apps.chats.toolCalls.noAppIdProvided",
        fallback: "No app ID provided",
      }),
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
      errorText: translateError({
        dependencies,
        key: "apps.chats.toolCalls.noAppIdProvided",
        fallback: "No app ID provided",
      }),
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

  if (!dependencies.getInstancesByAppId || !dependencies.closeWindowByInstanceId) {
    context.addToolResult({
      tool: "closeApp",
      toolCallId,
      state: "output-error",
      errorText: "Close app dependencies unavailable",
    });
    return "";
  }

  // Close all instances of the specified app
  const appInstances = dependencies.getInstancesByAppId(appId);
  const openInstances = appInstances.filter((inst) => inst.isOpen);

  if (openInstances.length === 0) {
    console.log(`[ToolCall] ${appName} is not currently running.`);
    return `${appName} is not running`;
  }

  // Close all open instances of this app (with animation and sound)
  openInstances.forEach((instance) => {
    dependencies.closeWindowByInstanceId?.(instance.instanceId);
  });

  console.log(
    `[ToolCall] Closed ${appName} (${openInstances.length} window${
      openInstances.length === 1 ? "" : "s"
    }).`
  );

  return `Closed ${appName}`;
};
