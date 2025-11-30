import { Loader2, Check } from "lucide-react";
import HtmlPreview from "@/components/shared/HtmlPreview";

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
          displayCallMessage = "Loading music library…";
        } else if (path === "/Applets Store") {
          displayCallMessage = "Listing shared applets…";
        } else if (path === "/Applications") {
          displayCallMessage = "Listing applications…";
        } else {
          displayCallMessage = "Finding files…";
        }
        break;
      }
      case "open": {
        const path = typeof input?.path === "string" ? input.path : "";
        if (path.startsWith("/Music/")) {
          displayCallMessage = "Playing song…";
        } else if (path.startsWith("/Applets Store/")) {
          displayCallMessage = "Opening applet preview…";
        } else if (path.startsWith("/Applications/")) {
          displayCallMessage = "Launching app…";
        } else {
          displayCallMessage = "Opening file…";
        }
        break;
      }
      case "read": {
        const path = typeof input?.path === "string" ? input.path : "";
        if (path.startsWith("/Applets Store/")) {
          displayCallMessage = "Fetching applet…";
        } else {
          displayCallMessage = "Reading file…";
        }
        break;
      }
      case "write":
        displayCallMessage = "Writing content…";
        break;
      case "edit":
        displayCallMessage = "Editing file…";
        break;
      case "launchApp":
        displayCallMessage = `Launching ${getAppName(input?.id)}…`;
        break;
      case "closeApp":
        displayCallMessage = `Closing ${getAppName(input?.id)}…`;
        break;
      case "ipodControl": {
        const action = input?.action || "toggle";
        if (action === "next") {
          displayCallMessage = "Skipping to next…";
        } else if (action === "previous") {
          displayCallMessage = "Skipping to previous…";
        } else if (action === "addAndPlay") {
          displayCallMessage = "Adding song…";
        } else if (action === "playKnown") {
          displayCallMessage = "Playing song…";
        } else {
          displayCallMessage = "Controlling playback…";
        }
        break;
      }
      case "switchTheme":
        displayCallMessage = "Switching theme…";
        break;
      default:
        displayCallMessage = `Running ${formatToolName(toolName)}…`;
    }
  }

  // Handle success states
  if (state === "output-available") {
    // Unified VFS tools
    if (toolName === "list") {
      if (typeof output === "string") {
        const songMatch = output.match(/Found (\d+) songs?/);
        const appletMatch = output.match(/Found (\d+) (?:shared )?applets?/i);
        const documentMatch = output.match(/Found (\d+) documents?/);
        const applicationMatch = output.match(/Found (\d+) applications?/);

        if (songMatch) {
          const count = parseInt(songMatch[1], 10);
          displayResultMessage = `Found ${count} song${count === 1 ? "" : "s"}`;
        } else if (appletMatch) {
          const count = parseInt(appletMatch[1], 10);
          displayResultMessage = `Found ${count} applet${count === 1 ? "" : "s"}`;
        } else if (documentMatch) {
          const count = parseInt(documentMatch[1], 10);
          displayResultMessage = `Found ${count} document${count === 1 ? "" : "s"}`;
        } else if (applicationMatch) {
          const count = parseInt(applicationMatch[1], 10);
          displayResultMessage = `Found ${count} application${count === 1 ? "" : "s"}`;
        } else if (output.includes("empty") || output.includes("No ")) {
          displayResultMessage = "No items found";
        } else {
          displayResultMessage = "Listed items";
        }
      }
    } else if (toolName === "open") {
      if (typeof output === "string") {
        if (output.includes("Playing")) {
          displayResultMessage = output;
        } else if (output.includes("Opened") || output.includes("Launched")) {
          displayResultMessage = output;
        } else {
          displayResultMessage = "Opened";
        }
      }
    } else if (toolName === "read") {
      const path = typeof input?.path === "string" ? input.path : "";
      const fileName = path.split("/").filter(Boolean).pop() || "file";
      displayResultMessage = `Read ${fileName}`;
    } else if (toolName === "write") {
      if (typeof output === "string") {
        if (output.includes("Successfully")) {
          displayResultMessage = "Content written";
        } else {
          displayResultMessage = output;
        }
      } else {
        displayResultMessage = "Content written";
      }
    } else if (toolName === "edit") {
      if (typeof output === "string") {
        if (output.includes("not found")) {
          displayResultMessage = "Text not found";
        } else if (output.includes("matches") && output.includes("locations")) {
          displayResultMessage = "Multiple matches found";
        } else if (output.includes("Successfully") || output.includes("edited")) {
          displayResultMessage = "File edited";
        } else if (output.includes("Created")) {
          displayResultMessage = "File created";
        } else {
          displayResultMessage = output;
        }
      } else {
        displayResultMessage = "File edited";
      }
    } else if (toolName === "launchApp" && input?.id === "internet-explorer") {
      const urlPart = input.url ? ` ${input.url}` : "";
      const yearPart =
        input.year && input.year !== "" ? ` in ${input.year}` : "";
      displayResultMessage = `Launched${urlPart}${yearPart}`;
    } else if (toolName === "launchApp") {
      displayResultMessage = `Launched ${getAppName(input?.id)}`;
    } else if (toolName === "closeApp") {
      displayResultMessage = `Closed ${getAppName(input?.id)}`;
    } else if (toolName === "ipodControl") {
      // Use output directly if available (it contains detailed state information)
      if (typeof output === "string" && output.trim().length > 0) {
        displayResultMessage = output;
      } else {
        // Fallback to basic messages if output is not available
        const action = input?.action || "toggle";
        if (action === "addAndPlay") {
          displayResultMessage = "Added and started playing new song";
        } else if (action === "playKnown") {
          const title = input?.title ? String(input.title) : null;
          const artist = input?.artist ? String(input.artist) : null;

          if (title && artist) {
            displayResultMessage = `Playing ${title} by ${artist}`;
          } else if (title) {
            displayResultMessage = `Playing ${title}`;
          } else if (artist) {
            displayResultMessage = `Playing song by ${artist}`;
          } else if (input?.id) {
            displayResultMessage = `Playing song (${String(input.id)})`;
          } else {
            displayResultMessage = "Playing song";
          }
        } else if (action === "next") {
          displayResultMessage = "Skipped to next track";
        } else if (action === "previous") {
          displayResultMessage = "Skipped to previous track";
        } else {
          displayResultMessage =
            action === "play"
              ? "Playing iPod"
              : action === "pause"
                ? "Paused iPod"
                : "Toggled iPod playback";
        }
      }
    } else if (toolName === "switchTheme") {
      const theme = input?.theme || "theme";
      displayResultMessage = `Switched to ${theme}`;
    }
  }

  // Handle error states
  if (state === "output-error" && errorText) {
    displayResultMessage = `Error: ${errorText}`;
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
          <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
          <span className="shimmer">Generating...</span>
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
          Preparing HTML preview...
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
            <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
            {displayCallMessage ? (
              <span className="shimmer">{displayCallMessage}</span>
            ) : (
              <span>
                Calling <strong>{formatToolName(toolName)}</strong>…
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
            ⚠️ {errorText || "Tool execution failed"}
          </span>
        </div>
      )}
    </div>
  );
}
