import { useAutoCloudSync } from "./useAutoCloudSync";

/** Mounted from `DeferredAutoCloudSync` after idle; keeps `useAutoCloudSync` out of the main chunk. */
export function AutoCloudSyncRunner() {
  useAutoCloudSync();
  return null;
}
