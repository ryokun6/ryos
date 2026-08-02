import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { useAuth } from "@/hooks/useAuth";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { colorFromString, formatMoney } from "../utils/colors";
import { useStuffCoverIsCutout } from "../hooks/useStuffCoverIsCutout";
import {
  stuffItemCoverSrc,
  type StuffBid,
  type StuffReservation,
  type StuffShare,
  type StuffSharedItem,
} from "../types";

function SharedItemCover({ item }: { item: StuffSharedItem }) {
  const colors = colorFromString(item.id + item.title);
  const coverSrc = stuffItemCoverSrc(item);
  const cacheKey =
    item.imageDataUrl?.trim() || item.imageUrl?.trim() || coverSrc;
  const isCutout = useStuffCoverIsCutout(coverSrc, {
    coverPresentation: item.coverPresentation,
    cacheKey,
  });

  if (coverSrc && isCutout) {
    return (
      <div className="flex h-36 items-end justify-center bg-transparent p-2">
        <img
          src={coverSrc}
          alt=""
          className="max-h-full max-w-full origin-bottom scale-110 object-contain object-bottom"
          style={{
            filter:
              "drop-shadow(0 6px 10px rgba(0,0,0,0.3)) drop-shadow(0 2px 3px rgba(0,0,0,0.18))",
          }}
          draggable={false}
        />
      </div>
    );
  }

  return (
    <div
      className="flex h-36 items-end p-2"
      style={
        coverSrc
          ? {
              backgroundImage: `url(${coverSrc})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : { backgroundColor: colors.bg, color: colors.fg }
      }
    >
      {!coverSrc && (
        <span className="font-apple-garamond text-sm leading-tight">
          {item.title}
        </span>
      )}
    </div>
  );
}

interface StuffSharedViewProps {
  shareId: string;
  onBack: () => void;
}

export function StuffSharedView({ shareId, onBack }: StuffSharedViewProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const [share, setShare] = useState<StuffShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<StuffSharedItem | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await abortableFetch(
        getApiUrl(`/api/stuff/shares?id=${encodeURIComponent(shareId)}`),
        {
          method: "GET",
          timeout: 12000,
          throwOnHttpError: false,
        }
      );
      if (!response.ok) {
        throw new Error("not_found");
      }
      const data = (await response.json()) as StuffShare;
      setShare(data);
    } catch {
      setError(
        t("apps.stuff.shared.notFound", {
          defaultValue: "This shared shelf could not be found.",
        })
      );
      setShare(null);
    } finally {
      setLoading(false);
    }
  }, [shareId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const ensureAuth = () => {
    if (!auth.isAuthenticated) {
      auth.promptLogin();
      return false;
    }
    return true;
  };

  const reserve = async (item: StuffSharedItem) => {
    if (!ensureAuth()) return;
    setBusy(true);
    try {
      const response = await abortableFetch(
        getApiUrl(`/api/stuff/shares/${encodeURIComponent(shareId)}/reserve`),
        {
          method: "POST",
          timeout: 12000,
          throwOnHttpError: false,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: item.id }),
        }
      );
      if (response.status === 401) {
        auth.promptLogin();
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "reserve_failed");
      }
      toast.success(
        t("apps.stuff.shared.reserved", { defaultValue: "Item Reserved" })
      );
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("apps.stuff.shared.reserveFailed", {
              defaultValue: "Could not reserve item.",
            })
      );
    } finally {
      setBusy(false);
    }
  };

  const placeBid = async (item: StuffSharedItem) => {
    if (!ensureAuth()) return;
    const amount = Number(bidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(
        t("apps.stuff.shared.invalidBid", {
          defaultValue: "Enter a valid offer amount.",
        })
      );
      return;
    }
    setBusy(true);
    try {
      const response = await abortableFetch(
        getApiUrl(`/api/stuff/shares/${encodeURIComponent(shareId)}/bid`),
        {
          method: "POST",
          timeout: 12000,
          throwOnHttpError: false,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId: item.id,
            amount,
            currency: item.prices.currency || "USD",
          }),
        }
      );
      if (response.status === 401) {
        auth.promptLogin();
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "bid_failed");
      }
      toast.success(
        t("apps.stuff.shared.bidPlaced", { defaultValue: "Offer Placed" })
      );
      setBidAmount("");
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("apps.stuff.shared.bidFailed", {
              defaultValue: "Could not place offer.",
            })
      );
    } finally {
      setBusy(false);
    }
  };

  const highestBid = (itemId: string): StuffBid | null => {
    if (!share) return null;
    return (
      share.bids
        .filter((bid) => bid.itemId === itemId)
        .sort((a, b) => b.amount - a.amount)[0] ?? null
    );
  };

  const activeReservation = (itemId: string): StuffReservation | null => {
    if (!share) return null;
    return (
      share.reservations.find(
        (r) => r.itemId === itemId && r.status === "active"
      ) ?? null
    );
  };

  return (
    <div className="flex h-full flex-col bg-os-window-bg">
      <div className="flex items-center gap-3 border-b border-black/10 px-3 py-2 dark:border-white/10">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          {t("apps.stuff.shared.back", { defaultValue: "Back" })}
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-apple-garamond text-xl">
            {share?.title ??
              t("apps.stuff.shared.loadingTitle", {
                defaultValue: "Shared Stuff",
              })}
          </h2>
          {share && (
            <p className="truncate text-xs opacity-60">
              {t("apps.stuff.shared.by", {
                defaultValue: "Shared by {{username}}",
                username: share.ownerUsername,
              })}
            </p>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && (
          <p className="text-sm opacity-60">
            {t("apps.stuff.shared.loading", { defaultValue: "Loading…" })}
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {share && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
            {share.items.map((item) => {
              const bid = highestBid(item.id);
              const reservation = activeReservation(item.id);
              const price = formatMoney(
                item.prices.discounted ?? item.prices.original,
                item.prices.currency
              );
              return (
                <button
                  key={item.id}
                  type="button"
                  className="rounded-md border border-black/10 text-left shadow-sm dark:border-white/10"
                  onClick={() => setSelectedItem(item)}
                >
                  <SharedItemCover item={item} />
                  <div className="space-y-1 p-2">
                    <div className="truncate text-sm font-medium">{item.title}</div>
                    {price && <div className="text-xs opacity-70">{price}</div>}
                    {bid && (
                      <div className="text-[11px] opacity-70">
                        {t("apps.stuff.shared.topOffer", {
                          defaultValue: "Top Offer {{amount}}",
                          amount: formatMoney(bid.amount, bid.currency),
                        })}
                      </div>
                    )}
                    {reservation && (
                      <div className="text-[11px] text-amber-700 dark:text-amber-400">
                        {t("apps.stuff.shared.reservedBy", {
                          defaultValue: "Reserved By {{username}}",
                          username: reservation.username,
                        })}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedItem && (
        <div className="border-t border-black/10 bg-black/5 p-3 dark:border-white/10 dark:bg-black/20">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <h3 className="font-apple-garamond text-lg">{selectedItem.title}</h3>
              {selectedItem.brand && (
                <p className="text-xs opacity-60">{selectedItem.brand}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedItem(null)}
            >
              {t("common.dialog.close", { defaultValue: "Close" })}
            </Button>
          </div>
          {selectedItem.notes && (
            <p className="mb-2 text-sm opacity-80">{selectedItem.notes}</p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || Boolean(activeReservation(selectedItem.id))}
              onClick={() => void reserve(selectedItem)}
            >
              {t("apps.stuff.shared.reserve", { defaultValue: "Reserve" })}
            </Button>
            <Input
              className="h-8 w-28"
              type="number"
              step="0.01"
              min="0"
              placeholder={t("apps.stuff.shared.yourOffer", {
                defaultValue: "Your Offer",
              })}
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void placeBid(selectedItem)}
            >
              {t("apps.stuff.shared.bid", { defaultValue: "Place Offer" })}
            </Button>
            {!auth.isAuthenticated && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => auth.promptLogin()}
              >
                {t("apps.stuff.shared.signIn", {
                  defaultValue: "Sign In to Bid",
                })}
              </Button>
            )}
          </div>
        </div>
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
    </div>
  );
}
