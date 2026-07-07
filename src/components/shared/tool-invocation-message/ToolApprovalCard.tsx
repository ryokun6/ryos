import { useState } from "react";
import { Check, MapPin } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { respondToToolApproval } from "@/apps/chats/tools/toolApprovals";
import { aiChatLog as log } from "@/apps/chats/logging";
import { toolInlineCardShellClassName } from "@/components/shared/toolInlineCardShell";
import { cn } from "@/lib/utils";
import { ToolInvocationStatusRow } from "./ToolInvocationStatusRow";
import type { ToolInvocationPart } from "./types";

/**
 * Full lifecycle renderer for approval-gated client tools (currently
 * `getPreciseLocation`): the in-chat Allow / Don't Allow permission card, the
 * running / shared / declined status rows, and error states.
 *
 * Rendered from `tryRenderToolInvocationSpecialContent`, so it appears in
 * both the Chats app and the desktop assistant bubble (compact mode).
 */

interface LocationToolOutput {
  success?: boolean;
  city?: string | null;
  message?: string;
}

export interface ToolApprovalCardProps {
  toolName: string;
  part: Pick<
    ToolInvocationPart,
    "state" | "toolCallId" | "input" | "output" | "approval"
  >;
  partKey: string;
  /** Compact hosts (the assistant bubble) tighten card padding. */
  compact?: boolean;
  /** Extra classes merged onto the card shell (compact-host overrides). */
  className?: string;
}

export function ToolApprovalCard({
  toolName,
  part,
  partKey,
  compact = false,
  className,
}: ToolApprovalCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isSystem7Theme, isWindowsTheme, isWin98 } =
    useThemeFlags();
  const [responding, setResponding] = useState(false);
  // A card is stale when its tool call is no longer pending in the active
  // chat (e.g. the user typed a new message instead of answering). The
  // server resolves those as implicitly declined, so render the same here.
  const [stale, setStale] = useState(false);

  const { state, toolCallId, input, output, approval } = part;

  const statusRow = (
    icon: React.ReactNode,
    text: string,
    options?: { muted?: boolean; shimmer?: boolean }
  ) => (
    <div key={partKey} className="mb-0 italic text-[12px] leading-snug">
      <ToolInvocationStatusRow
        icon={icon}
        className={
          options?.muted
            ? "text-neutral-500 dark:text-neutral-400"
            : "text-neutral-700 dark:text-neutral-200"
        }
      >
        <span className={options?.shimmer ? "shimmer" : undefined}>{text}</span>
      </ToolInvocationStatusRow>
    </div>
  );

  const spinnerIcon = (
    <ActivityIndicator
      size="xs"
      className="text-neutral-500 dark:text-neutral-400"
    />
  );
  const checkIcon = (
    <Check
      className="size-3"
      style={{
        color: "var(--os-accent-color, var(--os-color-selection-bg))",
      }}
      weight="bold"
    />
  );
  const mutedCheckIcon = (
    <Check
      className="size-3 shrink-0 text-neutral-400 dark:text-neutral-500"
      weight="bold"
      aria-hidden
    />
  );

  // --- Waiting for the model to finish emitting the call ------------------
  if (state === "input-streaming" || state === "input-available") {
    return statusRow(
      spinnerIcon,
      t("apps.chats.toolCalls.location.requesting", {
        defaultValue: "Requesting location…",
      }),
      { shimmer: true }
    );
  }

  // --- Permission card -----------------------------------------------------
  if (state === "approval-requested" && approval?.id && !stale) {
    const approvalId = approval.id;
    const reason =
      typeof input?.reason === "string" && input.reason.trim().length > 0
        ? input.reason.trim()
        : null;

    const respond = (approved: boolean) => {
      if (responding) return;
      setResponding(true);
      void respondToToolApproval({
        toolName,
        toolCallId,
        approvalId,
        input,
        approved,
      })
        .then((handled) => {
          if (!handled) {
            log.warn("Approval card is stale; rendering as declined", {
              toolName,
              toolCallId,
              approvalId,
            });
            setStale(true);
          }
        })
        .finally(() => setResponding(false));
    };

    return (
      <div
        key={partKey}
        className={cn(
          "not-italic",
          toolInlineCardShellClassName({
            isMacOSTheme,
            isSystem7Theme,
            isWindowsTheme,
            isWin98,
          }),
          className
        )}
      >
        <div
          className={cn(
            "flex items-start gap-2.5",
            compact ? "px-2.5 pt-2" : "px-3 pt-2.5"
          )}
        >
          <div
            className="aqua-icon-badge flex size-9 shrink-0 items-center justify-center text-white"
            style={{
              backgroundImage:
                "linear-gradient(180deg, #55b1f7 0%, #1f7ce8 100%)",
            }}
            aria-hidden="true"
          >
            <MapPin size={20} weight="fill" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold leading-tight text-os-text-primary">
              {t("apps.chats.toolCalls.location.permissionTitle", {
                defaultValue: "Use your precise location?",
              })}
            </div>
            <div className="mt-0.5 text-[11px] leading-snug text-os-text-secondary">
              {reason
                ? t("apps.chats.toolCalls.location.permissionReason", {
                    defaultValue: "Ryo wants your precise location {{reason}}.",
                    reason,
                  })
                : t("apps.chats.toolCalls.location.permissionBody", {
                    defaultValue:
                      "Ryo wants to use your precise location to answer this request.",
                  })}
            </div>
          </div>
        </div>
        <div
          className={cn(
            "flex justify-end gap-2",
            compact ? "px-2.5 py-2" : "px-3 py-2.5"
          )}
        >
          <Button
            variant="secondary"
            size="sm"
            disabled={responding}
            onClick={() => respond(false)}
          >
            {t("apps.chats.toolCalls.location.dontAllow", {
              defaultValue: "Don’t Allow",
            })}
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={responding}
            onClick={() => respond(true)}
          >
            {t("apps.chats.toolCalls.location.allow", {
              defaultValue: "Allow",
            })}
          </Button>
        </div>
      </div>
    );
  }

  // --- Approved: client handler is resolving the position ------------------
  if (state === "approval-responded" && approval?.approved === true) {
    return statusRow(
      spinnerIcon,
      t("apps.chats.toolCalls.location.gettingLocation", {
        defaultValue: "Getting your location…",
      }),
      { shimmer: true }
    );
  }

  // --- Declined (locally responded, server-confirmed, or stale) ------------
  if (
    state === "output-denied" ||
    (state === "approval-requested" && stale) ||
    (state === "approval-responded" && approval?.approved === false)
  ) {
    return statusRow(
      mutedCheckIcon,
      t("apps.chats.toolCalls.location.denied", {
        defaultValue: "Location request declined",
      }),
      { muted: true }
    );
  }

  // --- Location shared ------------------------------------------------------
  if (state === "output-available") {
    const out = (output ?? {}) as LocationToolOutput;
    const city = typeof out.city === "string" ? out.city : null;
    return statusRow(
      checkIcon,
      city
        ? t("apps.chats.toolCalls.location.shared", {
            defaultValue: "Shared location: {{city}}",
            city,
          })
        : t("apps.chats.toolCalls.location.sharedNoCity", {
            defaultValue: "Shared your location",
          })
    );
  }

  // --- Geolocation failed ----------------------------------------------------
  return statusRow(
    mutedCheckIcon,
    t("apps.chats.toolCalls.location.failed", {
      defaultValue: "Couldn’t get your location",
    }),
    { muted: true }
  );
}
