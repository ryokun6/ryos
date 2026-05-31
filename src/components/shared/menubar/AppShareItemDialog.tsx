import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import type { AppId } from "@/config/appRegistry";

interface AppShareItemDialogProps {
  appId: AppId;
  appName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function AppShareItemDialog({
  appId,
  appName,
  isOpen,
  onClose,
}: AppShareItemDialogProps) {
  return (
    <ShareItemDialog
      isOpen={isOpen}
      onClose={onClose}
      itemType="App"
      itemIdentifier={appId}
      title={appName}
      generateShareUrl={generateAppShareUrl}
    />
  );
}
