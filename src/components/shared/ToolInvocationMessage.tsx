import { Check } from "lucide-react";
import HtmlPreview from "@/components/shared/HtmlPreview";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { useTranslation } from "react-i18next";

// AI SDK v5 tool invocation structure
export interface ToolInvocationPart {
  type: string; // e.g., "tool-launchApp", "tool-switchTheme", etc.
  toolCallId: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error";
  input?: {
    id?: string;
    url?: string;
    year?: string;
    html?: string;
    path?: string;
    [key: string]: unknown;
  };
  output?: unknown;
  errorText?: string;
}

// Extract tool name from type (e.g., "tool-launchApp" -> "launchApp")
function getToolName(part: ToolInvocationPart): string {
  if (part.type.startsWith("tool-")) {
    return part.type.slice(5);
  }
  return part.type;
}

interface ToolInvocationMessageProps {
  part: ToolInvocationPart;
  partKey: string;
  isLoading: boolean;
  getAppName: (id?: string) => string;
  formatToolName: (name: string) => string;
  setIsInteractingWithPreview: (val: boolean) => void;
  playElevatorMusic: () => void;
  stopElevatorMusic: () => void;
  playDingSound: () => void;
}

export function ToolInvocationMessage({
  part,
  partKey,
  getAppName,
  formatToolName,
  setIsInteractingWithPreview,
  playElevatorMusic,
  stopElevatorMusic,
  playDingSound,
}: ToolInvocationMessageProps) {
  const { t } = useTranslation();
  const toolName = getToolName(part);
  const { state, input, output, errorText } = part;

  // Friendly display strings
  let displayCallMessage: string | null = null;
  let displayResultMessage: string | null = null;

  // Handle loading states (input-streaming or input-available without output)
  if (state === "input-streaming" || (state === "input-available" && !output)) {
    switch (toolName) {
      // Unified VFS tools
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
        displayCallMessage = t("apps.chats.toolCalls.launching", { appName: getAppName(input?.id) });
        break;
      case "closeApp":
        displayCallMessage = t("apps.chats.toolCalls.closing", { appName: getAppName(input?.id) });
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
      case "searchSongs": {
        const query = typeof input?.query === "string" ? input.query : "";
        displayCallMessage = t("apps.chats.toolCalls.searchingSongs", { query });
        break;
      }
      default:
        displayCallMessage = t("apps.chats.toolCalls.running", { toolName: formatToolName(toolName) });
    }
  }

  // Handle success states
  if (state === "output-available") {
    // Unified VFS tools
    if (toolName === "list") {
      if (typeof output === "string") {
        // Try to parse JSON array from output to get accurate count
        let count: number | null = null;
        let itemType: "songs" | "applets" | "documents" | "applications" | "sharedApplets" | null = null;
        
        // Extract JSON part (after the colon and newline)
        const jsonMatch = output.match(/:\n(\[.*\])/s);
        if (jsonMatch) {
          try {
            const jsonData = JSON.parse(jsonMatch[1]);
            if (Array.isArray(jsonData)) {
              count = jsonData.length;
            }
          } catch {
            // JSON parsing failed, fall back to regex
          }
        }
        
        // If we couldn't parse JSON, try to extract number from the string
        if (count === null) {
          const numberMatch = output.match(/(\d+)/);
          if (numberMatch) {
            count = parseInt(numberMatch[1], 10);
          }
        }
        
        // Determine item type based on path or output content
        const path = typeof input?.path === "string" ? input.path : "";
        if (path === "/Music") {
          itemType = "songs";
        } else if (path === "/Applets Store") {
          itemType = "sharedApplets";
        } else if (path === "/Applications") {
          itemType = "applications";
        } else if (path === "/Applets") {
          itemType = "applets";
        } else if (path === "/Documents") {
          itemType = "documents";
        } else {
          // Fall back to checking output content for keywords (case-insensitive)
          const lowerOutput = output.toLowerCase();
          if (lowerOutput.includes("song") || lowerOutput.includes("morceau") || lowerOutput.includes("曲") || lowerOutput.includes("곡") || lowerOutput.includes("Lied")) {
            itemType = "songs";
          } else if (lowerOutput.includes("shared applet") || lowerOutput.includes("applet partagée") || lowerOutput.includes("共有アプレット") || lowerOutput.includes("공유 앱릿") || lowerOutput.includes("geteiltes applet")) {
            itemType = "sharedApplets";
          } else if (lowerOutput.includes("application") || lowerOutput.includes("アプリケーション") || lowerOutput.includes("응용 프로그램") || lowerOutput.includes("Anwendung")) {
            itemType = "applications";
          } else if (lowerOutput.includes("document") || lowerOutput.includes("ドキュメント") || lowerOutput.includes("문서") || lowerOutput.includes("Dokument")) {
            itemType = "documents";
          } else if (lowerOutput.includes("applet") || lowerOutput.includes("アプレット") || lowerOutput.includes("앱릿")) {
            itemType = "applets";
          }
        }
        
        // Display appropriate message based on type and count
        if (count !== null && count > 0) {
          if (itemType === "songs") {
            displayResultMessage = count === 1
              ? t("apps.chats.toolCalls.foundSongs", { count })
              : t("apps.chats.toolCalls.foundSongsPlural", { count });
          } else if (itemType === "sharedApplets") {
            displayResultMessage = count === 1
              ? t("apps.chats.toolCalls.foundSharedApplets", { count })
              : t("apps.chats.toolCalls.foundSharedAppletsPlural", { count });
          } else if (itemType === "applications") {
            displayResultMessage = count === 1
              ? t("apps.chats.toolCalls.foundApplications", { count })
              : t("apps.chats.toolCalls.foundApplicationsPlural", { count });
          } else if (itemType === "documents") {
            displayResultMessage = count === 1
              ? t("apps.chats.toolCalls.foundDocuments", { count })
              : t("apps.chats.toolCalls.foundDocumentsPlural", { count });
          } else if (itemType === "applets") {
            displayResultMessage = count === 1
              ? t("apps.chats.toolCalls.foundApplets", { count })
              : t("apps.chats.toolCalls.foundAppletsPlural", { count });
          } else {
            // Unknown type, use generic message
            displayResultMessage = t("apps.chats.toolCalls.listedItems");
          }
        } else if (output.includes("empty") || output.toLowerCase().includes("no ") || output.toLowerCase().includes("pas de") || output.toLowerCase().includes("없습니다") || output.toLowerCase().includes("ありません") || output.toLowerCase().includes("keine")) {
          displayResultMessage = t("apps.chats.toolCalls.noItemsFound");
        } else {
          displayResultMessage = t("apps.chats.toolCalls.listedItems");
        }
      }
    } else if (toolName === "open") {
      if (typeof output === "string" && output.trim().length > 0) {
        // Use the output directly - it's already a properly localized message
        // (e.g., "Playing X by Y" for music, "Opened X" for files, etc.)
        displayResultMessage = output;
      } else {
        displayResultMessage = t("apps.chats.toolCalls.opened");
      }
    } else if (toolName === "read") {
      const path = typeof input?.path === "string" ? input.path : "";
      let fileName = path.split("/").filter(Boolean).pop() || "file";
      
      // For Applets Store, try to extract title/name from output JSON
      if (path.startsWith("/Applets Store/") && typeof output === "string") {
        try {
          const parsed = JSON.parse(output);
          if (parsed.title || parsed.name) {
            fileName = parsed.title || parsed.name;
          }
        } catch {
          // Keep the ID as filename if parsing fails
        }
      }
      
      displayResultMessage = t("apps.chats.toolCalls.read", { fileName });
    } else if (toolName === "write") {
      if (typeof output === "string") {
        if (output.includes("Successfully")) {
          displayResultMessage = t("apps.chats.toolCalls.contentWritten");
        } else {
          displayResultMessage = output;
        }
      } else {
        displayResultMessage = t("apps.chats.toolCalls.contentWritten");
      }
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
        const path = typeof input?.path === "string" ? input.path : "";
        const fileName = path.split("/").filter(Boolean).pop() || "file";
        displayResultMessage = t("apps.chats.toolCalls.edited", { fileName });
      }
    } else if (toolName === "launchApp" && input?.id === "internet-explorer") {
      const urlPart = input.url ? String(input.url) : "";
      const yearPart = input.year && input.year !== "" ? String(input.year) : "";
      if (urlPart && yearPart) {
        displayResultMessage = t("apps.chats.toolCalls.launchedWithUrlAndYear", { url: urlPart, year: yearPart });
      } else if (urlPart) {
        displayResultMessage = t("apps.chats.toolCalls.launchedWithUrl", { url: urlPart });
      } else {
        displayResultMessage = t("apps.chats.toolCalls.launched", { appName: getAppName(input?.id) });
      }
    } else if (toolName === "launchApp") {
      displayResultMessage = t("apps.chats.toolCalls.launched", { appName: getAppName(input?.id) });
    } else if (toolName === "closeApp") {
      displayResultMessage = t("apps.chats.toolCalls.closed", { appName: getAppName(input?.id) });
    } else if (toolName === "ipodControl") {
      // Use output directly if available (it contains detailed state information)
      if (typeof output === "string" && output.trim().length > 0) {
        displayResultMessage = output;
      } else {
        // Fallback to basic messages if output is not available
        const action = input?.action || "toggle";
        if (action === "addAndPlay") {
          displayResultMessage = t("apps.chats.toolCalls.addedAndStartedPlaying");
        } else if (action === "playKnown") {
          const title = input?.title ? String(input.title) : null;
          const artist = input?.artist ? String(input.artist) : null;

          if (title && artist) {
            displayResultMessage = t("apps.chats.toolCalls.playingByArtist", { title, artist });
          } else if (title) {
            displayResultMessage = t("apps.chats.toolCalls.playing", { title });
          } else if (artist) {
            displayResultMessage = t("apps.chats.toolCalls.playingSongByArtist", { artist });
          } else if (input?.id) {
            displayResultMessage = t("apps.chats.toolCalls.playingSongWithId", { id: String(input.id) });
          } else {
            displayResultMessage = t("apps.chats.toolCalls.playingSongGeneric");
          }
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
      // Use the output directly as it contains the detailed changes
      if (typeof output === "string" && output.trim().length > 0) {
        displayResultMessage = output;
      } else {
        displayResultMessage = t("apps.chats.toolCalls.settingsUpdated");
      }
    } else if (toolName === "searchSongs") {
      // Try to get count from output
      let count = 0;
      if (typeof output === "object" && output !== null && "results" in output) {
        const results = (output as { results?: unknown[] }).results;
        if (Array.isArray(results)) {
          count = results.length;
        }
      }
      displayResultMessage = t("apps.chats.toolCalls.foundVideos", { count });
    }
  }

  // Handle error states
  if (state === "output-error" && errorText) {
    displayResultMessage = t("apps.chats.toolCalls.error", { errorText });
  }

  // Special handling for generateHtml
  if (state === "output-available" && toolName === "generateHtml") {
    // Handle both old format (string) and new format (object with html, title, and icon)
    let htmlContent = "";
    let appletTitle = "";
    let appletIcon = "";

    if (typeof output === "string" && output.trim().length > 0) {
      htmlContent = output;
    } else if (
      typeof output === "object" &&
      output !== null &&
      "html" in output
    ) {
      htmlContent = (output as { html: string; title?: string; icon?: string })
        .html;
      appletTitle =
        (output as { html: string; title?: string; icon?: string }).title || "";
      appletIcon =
        (output as { html: string; title?: string; icon?: string }).icon || "";
    }

    if (htmlContent.trim().length > 0) {
      return (
        <HtmlPreview
          key={partKey}
          htmlContent={htmlContent}
          appletTitle={appletTitle}
          appletIcon={appletIcon}
          onInteractionChange={setIsInteractingWithPreview}
          playElevatorMusic={playElevatorMusic}
          stopElevatorMusic={stopElevatorMusic}
          playDingSound={playDingSound}
          className="my-1"
        />
      );
    }
  }

  if (toolName === "generateHtml") {
    const htmlContent = typeof input?.html === "string" ? input.html : "";
    const appletTitle = typeof input?.title === "string" ? input.title : "";
    const appletIcon = typeof input?.icon === "string" ? input.icon : "";

    if (state === "input-streaming") {
      // Show HTML preview with streaming if HTML content is available
      if (htmlContent) {
        return (
          <HtmlPreview
            key={partKey}
            htmlContent={htmlContent}
            appletTitle={appletTitle}
            appletIcon={appletIcon}
            isStreaming={true}
            minWidth="320px"
            onInteractionChange={setIsInteractingWithPreview}
            playElevatorMusic={playElevatorMusic}
            stopElevatorMusic={stopElevatorMusic}
            playDingSound={playDingSound}
            className="my-1"
          />
        );
      }
      // Show loading state if HTML not yet available
      return (
        <div
          key={partKey}
          className="mb-0 px-1 py-0.5 text-xs italic text-gray-600 flex items-center gap-1"
        >
          <ActivityIndicator size="xs" className="text-gray-500" />
          <span className="shimmer">{t("apps.chats.toolCalls.generating")}</span>
        </div>
      );
    } else if (state === "input-available") {
      if (htmlContent) {
        return (
          <HtmlPreview
            key={partKey}
            htmlContent={htmlContent}
            appletTitle={appletTitle}
            appletIcon={appletIcon}
            isStreaming={false}
            onInteractionChange={setIsInteractingWithPreview}
            playElevatorMusic={playElevatorMusic}
            stopElevatorMusic={stopElevatorMusic}
            playDingSound={playDingSound}
            className="my-1"
          />
        );
      }
      return (
        <div
          key={partKey}
          className="mb-0 px-1 py-0.5 text-xs italic text-gray-500"
        >
          {t("apps.chats.toolCalls.preparingHtmlPreview")}
        </div>
      );
    }
  }

  // Default rendering for other tools
  return (
    <div key={partKey} className="mb-0 px-1 py-0.5 italic text-[12px]">
      {(state === "input-streaming" || state === "input-available") &&
        !output && (
          <div className="flex items-center gap-1 text-gray-700">
            <ActivityIndicator size="xs" className="text-gray-500" />
            {displayCallMessage ? (
              <span className="shimmer">{displayCallMessage}</span>
            ) : (
              <span>
                {t("apps.chats.toolCalls.calling", { toolName: formatToolName(toolName) })}
              </span>
            )}
          </div>
        )}
      {state === "output-available" && (
        <div className="flex items-center gap-1 text-gray-700">
          <Check className="h-3 w-3 text-blue-600" />
          {displayResultMessage ? (
            <span>{displayResultMessage}</span>
          ) : (
            <div className="flex flex-col">
              {typeof output === "string" && output.length > 0 ? (
                <span className="text-gray-500">{output}</span>
              ) : (
                <span>{formatToolName(toolName)}</span>
              )}
            </div>
          )}
        </div>
      )}
      {state === "output-error" && (
        <div className="flex items-center gap-1 text-red-600">
          <span className="text-xs">
            ⚠️ {errorText || t("apps.chats.toolCalls.toolExecutionFailed")}
          </span>
        </div>
      )}
    </div>
  );
}
