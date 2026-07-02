import { getSnapshot as getOfflineSnapshot } from "@/hooks/useOffline";

const CHUNK_LOAD_ERROR_PATTERN =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|unable to preload css|networkerror when attempting to fetch resource/i;

type RecoverableChunkLoadErrorOptions = {
  error: unknown;
  offline?: boolean;
};

export function isRecoverableChunkLoadError({
  error,
  offline = getOfflineSnapshot(),
}: RecoverableChunkLoadErrorOptions): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (CHUNK_LOAD_ERROR_PATTERN.test(message)) {
    return true;
  }

  return offline && /^load failed$/i.test(message.trim());
}
