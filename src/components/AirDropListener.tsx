import { useEffect, useCallback, useRef } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import {
  useAirDropStore,
  type AirDropTransfer,
} from "@/stores/useAirDropStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { dbOperations } from "@/apps/finder/hooks/useFileSystem";
import { STORES } from "@/utils/indexedDB";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function AirDropListener() {
  const { t } = useTranslation();
  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const pendingTransfers = useAirDropStore((s) => s.pendingTransfers);
  const respondToTransfer = useAirDropStore((s) => s.respondToTransfer);
  const removeTransfer = useAirDropStore((s) => s.removeTransfer);
  const subscribeToChannel = useAirDropStore((s) => s.subscribeToChannel);
  const unsubscribeFromChannel = useAirDropStore(
    (s) => s.unsubscribeFromChannel
  );
  const addItem = useFilesStore((s) => s.addItem);
  const shownToasts = useRef(new Set<string>());

  useEffect(() => {
    if (isAuthenticated && username) {
      subscribeToChannel(username);
      return () => unsubscribeFromChannel();
    }
  }, [isAuthenticated, username, subscribeToChannel, unsubscribeFromChannel]);

  const saveReceivedFile = useCallback(
    async (fileName: string, content: string) => {
      const uuid = crypto.randomUUID();
      const filePath = `/Documents/${fileName}`;
      const now = Date.now();

      await dbOperations.put(STORES.DOCUMENTS, {
        name: uuid,
        content,
      });

      addItem({
        path: filePath,
        name: fileName,
        isDirectory: false,
        type: "text",
        uuid,
        createdAt: now,
        modifiedAt: now,
        size: new Blob([content]).size,
      });
    },
    [addItem]
  );

  const handleAccept = useCallback(
    async (transfer: AirDropTransfer) => {
      const result = await respondToTransfer(transfer.transferId, true);
      if (result.success && result.content && result.fileName) {
        try {
          await saveReceivedFile(result.fileName, result.content);
          toast.success(
            t("apps.finder.airdrop.fileReceived", {
              fileName: result.fileName,
              sender: result.sender,
            })
          );
        } catch {
          toast.error(t("apps.finder.airdrop.saveFailed"));
        }
      }
    },
    [respondToTransfer, saveReceivedFile, t]
  );

  const handleDecline = useCallback(
    async (transfer: AirDropTransfer) => {
      await respondToTransfer(transfer.transferId, false);
    },
    [respondToTransfer]
  );

  useEffect(() => {
    for (const transfer of pendingTransfers) {
      if (shownToasts.current.has(transfer.transferId)) continue;
      shownToasts.current.add(transfer.transferId);

      toast(
        t("apps.finder.airdrop.incomingFile", {
          sender: transfer.sender,
          fileName: transfer.fileName,
        }),
        {
          id: `airdrop-${transfer.transferId}`,
          duration: 30000,
          action: {
            label: t("apps.finder.airdrop.accept"),
            onClick: () => handleAccept(transfer),
          },
          cancel: {
            label: t("apps.finder.airdrop.decline"),
            onClick: () => handleDecline(transfer),
          },
          onDismiss: () => removeTransfer(transfer.transferId),
        }
      );
    }
  }, [pendingTransfers, handleAccept, handleDecline, removeTransfer, t]);

  return null;
}
