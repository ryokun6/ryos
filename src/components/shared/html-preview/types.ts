// Component to render ryOS Code Previews
export interface HtmlPreviewProps {
  htmlContent: string;
  appletTitle?: string;
  appletIcon?: string;
  onInteractionChange?: (isInteracting: boolean) => void;
  isStreaming?: boolean;
  maxHeight?: number | string;
  minHeight?: number | string;
  minWidth?: number | string;
  initialFullScreen?: boolean;
  className?: string;
  playElevatorMusic?: (mode?: "past" | "future" | "now") => void;
  stopElevatorMusic?: () => void;
  playDingSound?: () => void;
  maximizeSound?: { play: () => void };
  minimizeSound?: { play: () => void };
  isInternetExplorer?: boolean;
  baseUrlForAiContent?: string;
  mode?: "past" | "future" | "now";
  /**
   * Informational author label. This alone never grants the AI capability.
   */
  appletCreatedBy?: string | null;
  /**
   * Explicit attestation that this HTML came from the server-side AI flow.
   */
  appletProvenance?: "server-generated";
  /**
   * Immutable VFS UUID or server share ID used for persistent applet storage.
   */
  appletStorageIdentity?: string | null;
  onIframeWindowChange?: (frameWindow: Window, active: boolean) => void;
}
