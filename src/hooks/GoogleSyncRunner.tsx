import { GoogleSyncPromptDialog } from "@/components/dialogs/GoogleSyncPromptDialog";
import { useAutoGoogleSync } from "./useAutoGoogleSync";

export function GoogleSyncRunner() {
  useAutoGoogleSync();
  return <GoogleSyncPromptDialog />;
}
