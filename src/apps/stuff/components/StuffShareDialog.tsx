import { useEffect, useMemo, useRef, useState } from "react";
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
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
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
  const { isWindowsTheme, isMacOSTheme: isMacTheme } = useThemeFlags();
  const [title, setTitle] = useState("My Stuff");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(items.map((item) => item.id))
  );
  const [isPublishing, setIsPublishing] = useState(false);
  const [shareId, setShareId] = useState<string | null>(lastShareId);
  const [showShareUrl, setShowShareUrl] = useState(false);

  const wasOpenRef = useRef(false);

  // On open: select all current items. While open: prune removed ids and select new ones.
  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }

    if (!wasOpenRef.current) {
      wasOpenRef.current = true;
      setSelectedIds(new Set(items.map((item) => item.id)));
      setShareId(lastShareId);
      return;
    }

    setSelectedIds((prev) => {
      const currentIds = new Set(items.map((item) => item.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id);
      }
      for (const id of currentIds) {
        if (!prev.has(id)) next.add(id);
      }
      return next;
    });
  }, [isOpen, items, lastShareId]);

  const dialogTitle = t("apps.stuff.share.title", {
    defaultValue: "Share Stuff",
  });
  const dialogDescription = t("apps.stuff.share.description", {
    defaultValue:
      "Publish selected items. Visitors must sign in to reserve or bid.",
  });

  const bodyTextClass = cn(
    isWindowsTheme
      ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
      : "font-geneva-12 text-[12px]"
  );

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
        t("apps.stuff.share.published", { defaultValue: "Shelf Published" })
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

  const dialogContent = (
    <div className={isWindowsTheme ? "p-2 px-4" : "p-4 px-6"}>
      <p
        className={cn("mb-3 text-neutral-500", bodyTextClass)}
        id="stuff-share-dialog-description"
      >
        {dialogDescription}
      </p>

      <label className={cn("mb-3 block", bodyTextClass)}>
        <span className="mb-1 block font-medium text-neutral-700">
          {t("apps.stuff.share.shelfTitle", { defaultValue: "Share Title" })}
        </span>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn("shadow-none", bodyTextClass)}
          disabled={isPublishing}
        />
      </label>

      <div
        className={cn(
          "max-h-56 space-y-1 overflow-y-auto rounded border border-black/20 bg-white p-2",
          bodyTextClass
        )}
      >
        {items.length === 0 ? (
          <p className="text-neutral-500">
            {t("apps.stuff.share.empty", {
              defaultValue: "No items to share.",
            })}
          </p>
        ) : (
          items.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-black/5"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggle(item.id)}
                disabled={isPublishing}
              />
              <span className="min-w-0 truncate">{item.title}</span>
            </label>
          ))
        )}
      </div>

      <DialogFooter className="mt-4 gap-1.5 sm:justify-end">
        <Button
          type="button"
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={onClose}
          disabled={isPublishing}
          className={cn("w-full sm:w-auto", !isMacTheme && "h-7", bodyTextClass)}
        >
          {t("common.dialog.cancel", { defaultValue: "Cancel" })}
        </Button>
        <Button
          type="button"
          variant={isMacTheme ? "default" : "retro"}
          onClick={() => void publish()}
          disabled={isPublishing}
          className={cn("w-full sm:w-auto", !isMacTheme && "h-7", bodyTextClass)}
        >
          {isPublishing
            ? t("apps.stuff.share.publishing", {
                defaultValue: "Publishing…",
              })
            : t("apps.stuff.share.publish", { defaultValue: "Publish" })}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <>
      <Dialog
        open={isOpen && !showShareUrl}
        onOpenChange={(open) => !open && onClose()}
      >
        <DialogContent
          className={cn("max-w-[500px]", isWindowsTheme && "p-0 overflow-hidden")}
          style={isWindowsTheme ? { fontSize: "11px" } : undefined}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {isWindowsTheme ? (
            <>
              <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
              <DialogDescription className="sr-only">
                {dialogDescription}
              </DialogDescription>
              <DialogHeader>{dialogTitle}</DialogHeader>
              <div className="window-body">{dialogContent}</div>
            </>
          ) : isMacTheme ? (
            <>
              <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
              <DialogDescription className="sr-only">
                {dialogDescription}
              </DialogDescription>
              <DialogHeader>{dialogTitle}</DialogHeader>
              {dialogContent}
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-normal text-[16px]">
                  {dialogTitle}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {dialogDescription}
                </DialogDescription>
              </DialogHeader>
              {dialogContent}
            </>
          )}
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
