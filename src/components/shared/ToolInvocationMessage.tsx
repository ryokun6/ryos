import { Loader2, Check } from "lucide-react";
import HtmlPreview from "@/components/shared/HtmlPreview";
import { useIpodStore } from "@/stores/useIpodStore";

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
  const { tracks, currentIndex } = useIpodStore();

  // Friendly display strings
  let displayCallMessage: string | null = null;
  let displayResultMessage: string | null = null;

  // Handle loading states (input-streaming or input-available without output)
  if (state === "input-streaming" || (state === "input-available" && !output)) {
    switch (toolName) {
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
      case "ipodPlayPause":
        displayCallMessage = "Controlling playback…";
        break;
      case "ipodPlaySong":
        displayCallMessage = `Playing song…`;
        break;
      case "ipodAddAndPlaySong":
        displayCallMessage = "Adding song…";
        break;
      case "ipodNextTrack":
        displayCallMessage = "Skipping to next…";
        break;
      case "ipodPreviousTrack":
        displayCallMessage = "Skipping to previous…";
        break;
      case "switchTheme":
        displayCallMessage = "Switching theme…";
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
    } else if (toolName === "ipodPlayPause") {
      const action = input?.action || "toggled";
      displayResultMessage = `${
        action === "toggle"
          ? "Toggled"
          : action === "play"
          ? "Playing"
          : "Paused"
      } iPod`;
    } else if (toolName === "ipodPlaySong") {
      // Show any available parameter in priority order: artist, title
      const artist = input?.artist;
      const title = input?.title;
      
      if (artist) {
        displayResultMessage = `Playing ${artist}`;
      } else if (title) {
        displayResultMessage = `Playing "${title}"`;
      } else {
        displayResultMessage = `Playing song`;
      }
    } else if (toolName === "ipodAddAndPlaySong") {
      // Show the current track information if available
      const currentTrack = tracks[currentIndex];
      if (currentTrack) {
        // Show any available parameter in priority order: artist, album, title
        if (currentTrack.artist) {
          displayResultMessage = `Added and playing ${currentTrack.artist}`;
        } else if (currentTrack.album) {
          displayResultMessage = `Added and playing ${currentTrack.album}`;
        } else if (currentTrack.title) {
          displayResultMessage = `Added and playing "${currentTrack.title}"`;
        } else {
          displayResultMessage = `Added and playing new song`;
        }
      } else {
        displayResultMessage = `Added and playing new song`;
      }
    } else if (toolName === "ipodNextTrack") {
      displayResultMessage = `Skipped to next track`;
    } else if (toolName === "ipodPreviousTrack") {
      displayResultMessage = `Skipped to previous track`;
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
    }
  }

  // Handle error states
  if (state === "output-error" && errorText) {
    displayResultMessage = `Error: ${errorText}`;
  }

  // Special handling for generateHtml
  if (
    state === "output-available" &&
    toolName === "generateHtml" &&
    typeof output === "string" &&
    output.trim().length > 0
  ) {
    return (
      <HtmlPreview
        key={partKey}
        htmlContent={output}
        onInteractionChange={setIsInteractingWithPreview}
        playElevatorMusic={playElevatorMusic}
        stopElevatorMusic={stopElevatorMusic}
        playDingSound={playDingSound}
        className="my-1"
      />
    );
  }

  if (toolName === "generateHtml") {
    if (state === "input-streaming") {
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
      const htmlContent = typeof input?.html === "string" ? input.html : "";
      if (htmlContent) {
        return (
          <HtmlPreview
            key={partKey}
            htmlContent={htmlContent}
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
