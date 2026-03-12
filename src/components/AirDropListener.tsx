import { useEffect, useCallback, useRef } from "react";
import { useChatsStore } from "@/stores/useChatsStore";
import {
  useAirDropStore,
  type AirDropTransfer,
} from "@/stores/useAirDropStore";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const getImageMimeType = (fileName: string): string => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "bmp":
      return "image/bmp";
    default:
      return "image/png";
  }
};

const decodeBase64ToBlob = (base64: string, fileName: string): Blob => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: getImageMimeType(fileName) });
};

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
  const { saveFile } = useFileSystem("/", { skipLoad: true });
  const shownToasts = useRef(new Set<string>());

  useEffect(() => {
    if (isAuthenticated && username) {
      subscribeToChannel(username);
      return () => unsubscribeFromChannel();
    }
  }, [isAuthenticated, username, subscribeToChannel, unsubscribeFromChannel]);

  const saveReceivedFile = useCallback(
    async (fileName: string, content: string, fileType?: string) => {
      const filePath = `/Downloads/${fileName}`;
      const fileContent =
        fileType === "image" ? decodeBase64ToBlob(content, fileName) : content;

      await saveFile({
        path: filePath,
        name: fileName,
        content: fileContent,
        type: fileType === "html" ? "html" : undefined,
      });
    },
    [saveFile]
  );

  const handleAccept = useCallback(
    async (transfer: AirDropTransfer) => {
      const result = await respondToTransfer(transfer.transferId, true);
      if (result.success && result.content && result.fileName) {
        try {
          await saveReceivedFile(
            result.fileName,
            result.content,
            result.fileType
          );
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
