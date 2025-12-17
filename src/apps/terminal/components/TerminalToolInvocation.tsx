import { Loader2, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ToolInvocationData } from "../types";
import { getTranslatedAppName, type AppId } from "@/utils/i18n";

// Helper to format tool names
function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

// Helper to get app name
function getAppName(id?: string): string {
  if (!id) return "app";
  return getTranslatedAppName(id as AppId);
}

interface TerminalToolInvocationProps {
  invocation: ToolInvocationData;
  fontSize?: number;
}

export function TerminalToolInvocation({
  invocation,
  fontSize,
}: TerminalToolInvocationProps) {
  const { t } = useTranslation();
  const { toolName, state, input, output } = invocation;

  // Skip aquarium tool - it's rendered separately
  if (toolName === "aquarium") return null;

  let displayCallMessage: string | null = null;
  let displayResultMessage: string | null = null;

  // Handle loading states (input-streaming or input-available, or any state that's not output-available/output-error)
  const isLoading = !state || state === "input-streaming" || state === "input-available";
  
  if (isLoading) {
    switch (toolName) {
      case "list": {
        const path = typeof input?.path === "string" ? input.path : "";
        if (path === "/Music") {
          displayCallMessage = t("apps.chats.toolCalls.loadingMusicLibrary");
        } else if (path === "/Applets Store") {
          displayCallMessage = t("apps.chats.toolCalls.listingSharedApplets");
        } else if (path === "/Applications") {
          displayCallMessage = t("apps.chats.toolCalls.listingApplications");
        } else {
          displayCallMessage = t("apps.chats.toolCalls.findingFiles");
        }
        break;
      }
      case "open": {
        const path = typeof input?.path === "string" ? input.path : "";
        if (path.startsWith("/Music/")) {
          displayCallMessage = t("apps.chats.toolCalls.playingSong");
        } else if (path.startsWith("/Applets Store/")) {
          displayCallMessage = t("apps.chats.toolCalls.openingAppletPreview");
        } else if (path.startsWith("/Applications/")) {
          displayCallMessage = t("apps.chats.toolCalls.launchingApp");
        } else {
          displayCallMessage = t("apps.chats.toolCalls.openingFile");
        }
        break;
      }
      case "read": {
        const path = typeof input?.path === "string" ? input.path : "";
        if (path.startsWith("/Applets Store/")) {
          displayCallMessage = t("apps.chats.toolCalls.fetchingApplet");
        } else {
          displayCallMessage = t("apps.chats.toolCalls.readingFile");
        }
        break;
      }
      case "write":
        displayCallMessage = t("apps.chats.toolCalls.writingContent");
        break;
      case "edit":
        displayCallMessage = t("apps.chats.toolCalls.editingFile");
        break;
      case "launchApp":
        displayCallMessage = t("apps.chats.toolCalls.launching", {
          appName: getAppName(input?.id as string),
        });
        break;
      case "closeApp":
        displayCallMessage = t("apps.chats.toolCalls.closing", {
          appName: getAppName(input?.id as string),
        });
        break;
      case "ipodControl": {
        const action = input?.action || "toggle";
        if (action === "next") {
          displayCallMessage = t("apps.chats.toolCalls.skippingToNext");
        } else if (action === "previous") {
          displayCallMessage = t("apps.chats.toolCalls.skippingToPrevious");
        } else if (action === "addAndPlay") {
          displayCallMessage = t("apps.chats.toolCalls.addingSong");
        } else if (action === "playKnown") {
          displayCallMessage = t("apps.chats.toolCalls.playingSong");
        } else {
          displayCallMessage = t("apps.chats.toolCalls.controllingPlayback");
        }
        break;
      }
      case "settings":
        displayCallMessage = t("apps.chats.toolCalls.changingSettings");
        break;
      case "generateHtml":
        displayCallMessage = t("apps.chats.toolCalls.generating");
        break;
      default:
        displayCallMessage = t("apps.chats.toolCalls.running", {
          toolName: formatToolName(toolName),
        });
    }
  }

  // Handle success states (output-available)
  if (state === "output-available") {
    if (toolName === "list") {
      if (typeof output === "string") {
        const songMatch = output.match(/Found (\d+) songs?/);
        const appletMatch = output.match(/Found (\d+) (?:shared )?applets?/i);
        const documentMatch = output.match(/Found (\d+) documents?/);
        const applicationMatch = output.match(/Found (\d+) applications?/);

        if (songMatch) {
          const count = parseInt(songMatch[1], 10);
          displayResultMessage =
            count === 1
              ? t("apps.chats.toolCalls.foundSongs", { count })
              : t("apps.chats.toolCalls.foundSongsPlural", { count });
        } else if (appletMatch) {
          const count = parseInt(appletMatch[1], 10);
          displayResultMessage =
            count === 1
              ? t("apps.chats.toolCalls.foundApplets", { count })
              : t("apps.chats.toolCalls.foundAppletsPlural", { count });
        } else if (documentMatch) {
          const count = parseInt(documentMatch[1], 10);
          displayResultMessage =
            count === 1
              ? t("apps.chats.toolCalls.foundDocuments", { count })
              : t("apps.chats.toolCalls.foundDocumentsPlural", { count });
        } else if (applicationMatch) {
          const count = parseInt(applicationMatch[1], 10);
          displayResultMessage =
            count === 1
              ? t("apps.chats.toolCalls.foundApplications", { count })
              : t("apps.chats.toolCalls.foundApplicationsPlural", { count });
        } else if (
          output.includes("empty") ||
          output.toLowerCase().includes("no ")
        ) {
          displayResultMessage = t("apps.chats.toolCalls.noItemsFound");
        } else {
          displayResultMessage = t("apps.chats.toolCalls.listedItems");
        }
      }
    } else if (toolName === "open") {
      if (typeof output === "string" && output.trim().length > 0) {
        displayResultMessage = output;
      } else {
        displayResultMessage = t("apps.chats.toolCalls.opened");
      }
    } else if (toolName === "read") {
      const path = typeof input?.path === "string" ? input.path : "";
      const fileName = path.split("/").filter(Boolean).pop() || "file";
      displayResultMessage = t("apps.chats.toolCalls.read", { fileName });
    } else if (toolName === "write") {
      displayResultMessage = t("apps.chats.toolCalls.contentWritten");
    } else if (toolName === "edit") {
      if (typeof output === "string") {
        if (output.includes("not found")) {
          displayResultMessage = t("apps.chats.toolCalls.textNotFound");
        } else if (output.includes("matches") && output.includes("locations")) {
          displayResultMessage = t("apps.chats.toolCalls.multipleMatchesFound");
        } else if (output.includes("Successfully") || output.includes("edited")) {
          const path = typeof input?.path === "string" ? input.path : "";
          const fileName = path.split("/").filter(Boolean).pop() || "file";
          displayResultMessage = t("apps.chats.toolCalls.edited", { fileName });
        } else if (output.includes("Created")) {
          displayResultMessage = t("apps.chats.toolCalls.fileCreated");
        } else {
          displayResultMessage = output;
        }
      } else {
        displayResultMessage = t("apps.chats.toolCalls.fileEdited");
      }
    } else if (toolName === "launchApp" && input?.id === "internet-explorer") {
      const urlPart = input.url ? String(input.url) : "";
      const yearPart = input.year && input.year !== "" ? String(input.year) : "";
      if (urlPart && yearPart) {
        displayResultMessage = t("apps.chats.toolCalls.launchedWithUrlAndYear", {
          url: urlPart,
          year: yearPart,
        });
      } else if (urlPart) {
        displayResultMessage = t("apps.chats.toolCalls.launchedWithUrl", {
          url: urlPart,
        });
      } else {
        displayResultMessage = t("apps.chats.toolCalls.launched", {
          appName: getAppName(input?.id as string),
        });
      }
    } else if (toolName === "launchApp") {
      displayResultMessage = t("apps.chats.toolCalls.launched", {
        appName: getAppName(input?.id as string),
      });
    } else if (toolName === "closeApp") {
      displayResultMessage = t("apps.chats.toolCalls.closed", {
        appName: getAppName(input?.id as string),
      });
    } else if (toolName === "ipodControl") {
      if (typeof output === "string" && output.trim().length > 0) {
        displayResultMessage = output;
      } else {
        const action = input?.action || "toggle";
        if (action === "addAndPlay") {
          displayResultMessage = t("apps.chats.toolCalls.addedAndStartedPlaying");
        } else if (action === "playKnown") {
          displayResultMessage = t("apps.chats.toolCalls.playingSongGeneric");
        } else if (action === "next") {
          displayResultMessage = t("apps.chats.toolCalls.skippedToNextTrack");
        } else if (action === "previous") {
          displayResultMessage = t("apps.chats.toolCalls.skippedToPreviousTrack");
        } else {
          displayResultMessage =
            action === "play"
              ? t("apps.chats.toolCalls.playingIpod")
              : action === "pause"
              ? t("apps.chats.toolCalls.pausedIpod")
              : t("apps.chats.toolCalls.toggledIpodPlayback");
        }
      }
    } else if (toolName === "settings") {
      if (typeof output === "string" && output.trim().length > 0) {
        displayResultMessage = output;
      } else {
        displayResultMessage = t("apps.chats.toolCalls.settingsUpdated");
      }
    } else if (typeof output === "string" && output.trim().length > 0) {
      // Don't show raw HTML in result message for generateHtml
      if (toolName !== "generateHtml") {
        displayResultMessage = output;
      }
    }
  }

  // Handle error states
  if (state === "output-error") {
    displayResultMessage = t("apps.chats.toolCalls.toolExecutionFailed");
  }

  // Fallback for loading states if no specific message was set
  if (isLoading && !displayCallMessage) {
    displayCallMessage = t("apps.chats.toolCalls.running", {
      toolName: formatToolName(toolName),
    });
  }

  // Don't render anything if there's nothing to display
  if (!displayCallMessage && !displayResultMessage) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-gray-400 py-0.5 select-text terminal-tool-invocation"
      style={fontSize ? { fontSize: `${fontSize}px` } : undefined}
    >
      {state === "output-available" && displayResultMessage ? (
        <>
          <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
          <span className="italic">{displayResultMessage}</span>
        </>
      ) : state === "output-error" ? (
        <>
          <span className="text-red-400">⚠️</span>
          <span className="italic text-red-400">{displayResultMessage}</span>
        </>
      ) : displayCallMessage ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-purple-400 flex-shrink-0" />
          <span className="italic shimmer">{displayCallMessage}</span>
        </>
      ) : null}
    </div>
  );
}



