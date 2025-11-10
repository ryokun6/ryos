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
  if (
    state === "input-streaming" ||
    (state === "input-available" && !output)
  ) {
    switch (toolName) {
      case "searchSharedApplets":
      case "listSharedApplets":
        displayCallMessage = "Searching shared applets…";
        break;
      case "textEditSearchReplace":
        displayCallMessage = "Replacing text…";
        break;
      case "textEditInsertText":
        displayCallMessage = "Inserting text…";
        break;
      case "launchApp":
        displayCallMessage = `Launching ${getAppName(input?.id)}…`;
        break;
      case "closeApp":
        displayCallMessage = `Closing ${getAppName(input?.id)}…`;
        break;
      case "textEditNewFile":
        displayCallMessage = "Creating new document…";
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
      case "listFiles":
        displayCallMessage = "Finding files…";
        break;
      case "listIpodLibrary":
        displayCallMessage = "Loading iPod library…";
        break;
      case "openFile":
        displayCallMessage = "Opening file…";
        break;
      case "readFile":
        displayCallMessage = "Reading file…";
        break;
      case "openSharedApplet":
        displayCallMessage = "Opening applet preview…";
        break;
      default:
        displayCallMessage = `Running ${formatToolName(toolName)}…`;
    }
  }

  // Handle success states
  if (state === "output-available") {
    if (toolName === "launchApp" && input?.id === "internet-explorer") {
      const urlPart = input.url ? ` ${input.url}` : "";
      const yearPart =
        input.year && input.year !== "" ? ` in ${input.year}` : "";
      displayResultMessage = `Launched${urlPart}${yearPart}`;
    } else if (toolName === "launchApp") {
      displayResultMessage = `Launched ${getAppName(input?.id)}`;
    } else if (toolName === "closeApp") {
      displayResultMessage = `Closed ${getAppName(input?.id)}`;
    } else if (toolName === "ipodControl") {
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
    } else if (toolName === "switchTheme") {
      const theme = input?.theme || "theme";
      displayResultMessage = `Switched to ${theme}`;
    } else if (toolName === "textEditSearchReplace") {
      displayResultMessage = `Replaced text`;
    } else if (toolName === "textEditInsertText") {
      displayResultMessage = `Inserted text`;
    } else if (toolName === "textEditNewFile") {
      const title = input?.title || "new document";
      displayResultMessage = `Created "${title}"`;
    } else if (toolName === "listFiles") {
      // Parse the output to extract file count and type
      if (typeof output === "string") {
        const appletMatch = output.match(/Found (\d+) applets?/);
        const documentMatch = output.match(/Found (\d+) documents?/);
        const applicationMatch = output.match(/Found (\d+) applications?/);

        if (appletMatch) {
          const count = parseInt(appletMatch[1], 10);
          displayResultMessage = `Found ${count} applet${
            count === 1 ? "" : "s"
          }`;
        } else if (documentMatch) {
          const count = parseInt(documentMatch[1], 10);
          displayResultMessage = `Found ${count} document${
            count === 1 ? "" : "s"
          }`;
        } else if (applicationMatch) {
          const count = parseInt(applicationMatch[1], 10);
          displayResultMessage = `Found ${count} application${
            count === 1 ? "" : "s"
          }`;
        } else if (output.includes("No applets found")) {
          displayResultMessage = "No applets found";
        } else if (output.includes("No documents found")) {
          displayResultMessage = "No documents found";
        } else if (output.includes("No applications found")) {
          displayResultMessage = "No applications found";
        } else {
          displayResultMessage = "Listed files";
        }
      }
    } else if (
      toolName === "searchSharedApplets" ||
      toolName === "listSharedApplets"
    ) {
      if (typeof output === "string") {
        if (output.includes("No shared applets matched")) {
          displayResultMessage = "No shared applets matched";
        } else if (output.includes("No shared applets available")) {
          displayResultMessage = "No shared applets available";
        } else {
          const headerMatch = output.match(
            /Shared applets(?: matching "[^"]+")? \((\d+)/,
          );
          if (headerMatch) {
            const count = parseInt(headerMatch[1], 10);
            displayResultMessage = `Found ${count} shared applet${
              count === 1 ? "" : "s"
            }`;
          } else {
            displayResultMessage = "Listed shared applets";
          }
        }
      }
    } else if (toolName === "listIpodLibrary") {
      // Parse the output to extract song count
      if (typeof output === "string") {
        const match = output.match(/Found (\d+) songs?/);
        if (match) {
          const count = parseInt(match[1], 10);
          displayResultMessage = `Found ${count} song${
            count === 1 ? "" : "s"
          }`;
        } else if (output.includes("iPod library is empty")) {
          displayResultMessage = "iPod library is empty";
        } else {
          displayResultMessage = "Listed iPod library";
        }
      }
    } else if (toolName === "openFile") {
      // Extract file name from output message
      if (typeof output === "string") {
        const appletMatch = output.match(/Successfully opened applet: (.+)/);
        const documentMatch = output.match(/Successfully opened document: (.+)/);
        const applicationMatch = output.match(
          /Successfully launched application: (.+)/,
        );

        if (appletMatch) {
          displayResultMessage = `Opened ${appletMatch[1]}`;
        } else if (documentMatch) {
          displayResultMessage = `Opened ${documentMatch[1]}`;
        } else if (applicationMatch) {
          displayResultMessage = `Launched ${applicationMatch[1]}`;
        } else {
          displayResultMessage = "Opened file";
        }
      }
    } else if (toolName === "openSharedApplet") {
      displayResultMessage = typeof output === "string" ? output : "Opened applet preview";
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

  if (toolName === "readFile") {
    if (state === "output-available") {
      const filePath =
        typeof input?.path === "string" ? (input.path as string) : null;
      const fileName = filePath
        ? filePath.split("/").filter(Boolean).pop()
        : "file";

      displayResultMessage = `Read ${fileName}`;
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
