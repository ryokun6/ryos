export type {
  DocumentContent,
  FileSystemItem,
  VfsDisplayFileItem,
} from "./types";

export {
  arePathArraysEqual,
  DEFAULT_FILE_PATHS,
  getFileTypeFromExtension,
  getParentPath,
  joinPath,
  normalizePath,
} from "./paths";

export type {
  OpenWithAliasApp,
  OpenWithAppletViewer,
  OpenWithInternetExplorer,
  OpenWithIpod,
  OpenWithLaunchApp,
  OpenWithNavigate,
  OpenWithPaint,
  OpenWithTarget,
  OpenWithTextEdit,
  OpenWithVideos,
  ResolveOpenWithInput,
} from "./open-with";

export { resolveOpenWithTarget } from "./open-with";
