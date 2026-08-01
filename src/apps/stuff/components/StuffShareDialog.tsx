import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { useAuth } from "@/hooks/useAuth";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import type { StuffItem, StuffTag } from "../types";
import { toSharedItem, generateStuffShareUrl } from "../utils/share";

interface StuffShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  items: StuffItem[];
  tags: StuffTag[];
  lastShareId: string | null;
  onShareCreated: (shareId: string) => void;
}

export function StuffShareDialog({
  isOpen,
  onClose,
  items,
  tags,
  lastShareId,
  onShareCreated,
}: StuffShareDialogProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [title, setTitle] = useState("My Stuff");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(items.map((item) => item.id))
  );
  const [isPublishing, setIsPublishing] = useState(false);
  const [shareId, setShareId] = useState<string | null>(lastShareId);
  const [showShareUrl, setShowShareUrl] = useState(false);

  const shareableItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const publish = async () => {
    if (!auth.isAuthenticated) {
      auth.promptLogin();
      return;
    }
    if (shareableItems.length === 0) {
      toast.error(
        t("apps.stuff.share.noneSelected", {
          defaultValue: "Select at least one item to share.",
        })
      );
      return;
    }

    setIsPublishing(true);
    try {
      const response = await abortableFetch(getApiUrl("/api/stuff/shares"), {
        method: "POST",
        timeout: 15000,
        throwOnHttpError: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || "My Stuff",
          shareId: lastShareId ?? undefined,
          items: shareableItems.map((item) => toSharedItem(item, tags)),
        }),
      });

      if (response.status === 401) {
        auth.promptLogin();
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to publish");
      }

      const data = (await response.json()) as { id: string };
      setShareId(data.id);
      onShareCreated(data.id);
      setShowShareUrl(true);
      toast.success(
        t("apps.stuff.share.published", { defaultValue: "Shelf published" })
      );
    } catch (err) {
      console.error(err);
      toast.error(
        t("apps.stuff.share.failed", {
          defaultValue: "Could not publish share.",
        })
      );
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <>
      <Dialog
        open={isOpen && !showShareUrl}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent className="max-w-md bg-os-window-bg">
          <DialogHeader>
            <DialogTitle>
              {t("apps.stuff.share.title", { defaultValue: "Share Stuff" })}
            </DialogTitle>
            <DialogDescription>
              {t("apps.stuff.share.description", {
                defaultValue:
                  "Publish selected items. Visitors must sign in to reserve or bid.",
              })}
            </DialogDescription>
          </DialogHeader>

          <label className="block text-xs font-medium opacity-70">
            {t("apps.stuff.share.shelfTitle", { defaultValue: "Share title" })}
            <Input
              className="mt-1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="max-h-56 space-y-1 overflow-y-auto rounded border border-black/10 p-2 dark:border-white/10">
            {items.length === 0 ? (
              <p className="text-sm opacity-60">
                {t("apps.stuff.share.empty", {
                  defaultValue: "No items to share.",
                })}
              </p>
            ) : (
              items.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="truncate">{item.title}</span>
                </label>
              ))
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("common.dialog.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              type="button"
              onClick={() => void publish()}
              disabled={isPublishing}
            >
              {isPublishing
                ? t("apps.stuff.share.publishing", {
                    defaultValue: "Publishing…",
                  })
                : t("apps.stuff.share.publish", { defaultValue: "Publish" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {shareId && (
        <ShareItemDialog
          isOpen={showShareUrl}
          onClose={() => {
            setShowShareUrl(false);
            onClose();
          }}
          itemType="Shelf"
          itemTypeKey="stuff"
          itemIdentifier={shareId}
          title={title}
          generateShareUrl={(id) => generateStuffShareUrl(id)}
        />
      )}

      <LoginDialog
        initialTab={
          auth.isVerifyDialogOpen ? "login" : auth.usernameDialogInitialTab
        }
        isOpen={auth.isUsernameDialogOpen || auth.isVerifyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            auth.setIsUsernameDialogOpen(false);
            auth.setVerifyDialogOpen(false);
          }
        }}
        usernameInput={auth.verifyUsernameInput}
        onUsernameInputChange={auth.setVerifyUsernameInput}
        passwordInput={auth.verifyPasswordInput}
        onPasswordInputChange={auth.setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await auth.handleVerifyTokenSubmit(auth.verifyPasswordInput, true);
        }}
        isLoginLoading={auth.isVerifyingToken}
        loginError={auth.verifyError}
        newUsername={auth.newUsername}
        onNewUsernameChange={auth.setNewUsername}
        newPassword={auth.newPassword}
        onNewPasswordChange={auth.setNewPassword}
        onSignUpSubmit={auth.submitUsernameDialog}
        isSignUpLoading={auth.isSettingUsername}
        signUpError={auth.usernameError}
      />
    </>
  );
}
