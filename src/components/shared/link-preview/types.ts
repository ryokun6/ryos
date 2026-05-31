export interface LinkMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

export interface LinkPreviewProps {
  url: string;
  className?: string;
}

export type LinkPreviewState = {
  metadata: LinkMetadata | null;
  loading: boolean;
  error: string | null;
  isFullWidthThumbnail: boolean;
};

export type LinkPreviewAction =
  | { type: "resetForUrl"; isFullWidthThumbnail: boolean }
  | { type: "fetchStart" }
  | { type: "fetchSuccess"; metadata: LinkMetadata }
  | { type: "fetchFailure"; error: string; metadata: LinkMetadata }
  | { type: "setFullWidthThumbnail"; enabled: boolean };
