import { Check, Code, FloppyDisk, Warning } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileSystem } from "@/apps/finder/hooks/useFileSystem";
import { useAppStore } from "@/stores/useAppStore";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
import { toolInlineCardShellClassName } from "@/components/shared/toolInlineCardShell";
import { osSubtleIconButtonClassName } from "@/components/shared/osThemePrimitives";

/**
 * Result payload of the `runJs` server tool. Mirrors `RunJsOutput` from
 * `api/chat/tools/types.ts` (re-declared so the chat UI doesn't import
 * server-only code).
 */
export interface JsRunCardData {
  success: boolean;
  logs: string;
  result?: string;
  error?: string;
  durationMs: number;
  truncated: boolean;
}

export interface JsRunCardProps {
  /** The script source from the tool call input (hidden until revealed). */
  code: string;
  run: JsRunCardData;
  /** Extra classes merged onto the card shell (e.g. compact-host overrides). */
  className?: string;
}

function formatJsRunDuration(durationMs: number): string {
  return durationMs < 1000
    ? `${durationMs}ms`
    : `${(durationMs / 1000).toFixed(1)}s`;
}

function makeScriptFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `script-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.js`;
}

/**
 * Inline chat card rendered when the assistant calls `runJs`. Shows the
 * script output (console logs + completion value) up front; the code itself
 * stays collapsed behind a "show code" toggle and can be saved to
 * /Documents as a .js file on demand.
 */
export function JsRunCard({ code, run, className }: JsRunCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isWindowsTheme, isSystem7Theme, isWin98 } =
    useThemeFlags();
  const { saveFile } = useFileSystem("/Documents", { skipLoad: true });
  const [codeVisible, setCodeVisible] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (savedPath) return;
    const fileName = makeScriptFileName();
    const path = `/Documents/${fileName}`;
    await saveFile({
      name: fileName,
      path,
      content: code,
      type: "text",
      icon: "📜",
    });
    setSavedPath(path);
    // Open the saved script so the user sees where it went (same behavior
    // as the AI `write` tool).
    useAppStore
      .getState()
      .launchApp("textedit", { path, content: code }, fileName, true);
  }, [code, saveFile, savedPath]);

  const hasLogs = run.logs.trim().length > 0;
  const hasResult =
    typeof run.result === "string" && run.result.trim().length > 0;
  const hasError = typeof run.error === "string" && run.error.length > 0;

  return (
    <div
      className={cn(
        toolInlineCardShellClassName({
          isMacOSTheme,
          isSystem7Theme,
          isWindowsTheme,
          isWin98,
        }),
        "overflow-hidden",
        className
      )}
    >
      {/* Header: status + duration, code/save actions. flex-wrap + the
          status label's minimum basis push the buttons onto a second row in
          narrow chat bubbles instead of crushing the status text. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-1.5 gap-y-1 px-2.5 py-1.5 text-[11px]",
          "border-b border-black/10 os-mac-aqua-dark:border-[color:var(--os-color-separator)]"
        )}
      >
        {run.success ? (
          <Check
            className="size-3 shrink-0"
            style={{
              color: "var(--os-accent-color, var(--os-color-selection-bg))",
            }}
            weight="bold"
            aria-hidden
          />
        ) : (
          <Warning
            className="size-3 shrink-0 text-red-600 dark:text-red-400"
            weight="bold"
            aria-hidden
          />
        )}
        <span className="min-w-24 flex-1 truncate text-os-text-secondary">
          {run.success
            ? t("apps.chats.toolCalls.runJs.ran", {
                defaultValue: "Script ran in {{duration}}",
                duration: formatJsRunDuration(run.durationMs),
              })
            : t("apps.chats.toolCalls.runJs.failed", {
                defaultValue: "Script failed",
              })}
          {run.truncated
            ? ` ${t("apps.chats.toolCalls.runJs.truncated", {
                defaultValue: "(output truncated)",
              })}`
            : ""}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setCodeVisible((visible) => !visible)}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded",
              "focus:outline-none focus-visible:ring-1",
              osSubtleIconButtonClassName(),
              codeVisible && "bg-black/10 os-mac-aqua-dark:bg-white/15"
            )}
            aria-pressed={codeVisible}
            aria-label={
              codeVisible
                ? t("apps.chats.toolCalls.runJs.hideCode", {
                    defaultValue: "Hide Code",
                  })
                : t("apps.chats.toolCalls.runJs.showCode", {
                    defaultValue: "Show Code",
                  })
            }
            title={
              codeVisible
                ? t("apps.chats.toolCalls.runJs.hideCode", {
                    defaultValue: "Hide Code",
                  })
                : t("apps.chats.toolCalls.runJs.showCode", {
                    defaultValue: "Show Code",
                  })
            }
          >
            <Code size={13} weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={savedPath !== null}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded",
              "focus:outline-none focus-visible:ring-1",
              osSubtleIconButtonClassName(),
              savedPath !== null && "opacity-60"
            )}
            aria-label={
              savedPath !== null
                ? t("apps.chats.toolCalls.runJs.saved", {
                    defaultValue: "Saved",
                  })
                : t("apps.chats.toolCalls.runJs.save", { defaultValue: "Save" })
            }
            title={
              savedPath !== null
                ? t("apps.chats.toolCalls.runJs.saved", {
                    defaultValue: "Saved",
                  })
                : t("apps.chats.toolCalls.runJs.save", { defaultValue: "Save" })
            }
          >
            {savedPath !== null ? (
              <Check size={13} weight="bold" aria-hidden />
            ) : (
              <FloppyDisk size={13} weight="bold" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {/* Collapsible source */}
      {codeVisible && (
        <pre
          className={cn(
            "max-h-48 overflow-auto px-2.5 py-2 font-os-mono text-[11px] leading-snug",
            "whitespace-pre-wrap break-words",
            "border-b border-black/10 os-mac-aqua-dark:border-[color:var(--os-color-separator)]",
            "bg-black/[0.04] os-mac-aqua-dark:bg-white/[0.06]",
            "text-os-text-primary"
          )}
        >
          {code}
        </pre>
      )}

      {/* Output: logs, completion value, error */}
      <pre
        className={cn(
          "max-h-48 overflow-auto px-2.5 py-2 font-os-mono text-[11px] leading-snug",
          "whitespace-pre-wrap break-words"
        )}
      >
        {hasLogs && <span className="text-os-text-primary">{run.logs}</span>}
        {hasLogs && (hasResult || hasError) && "\n"}
        {hasResult && (
          <span className="text-os-text-secondary">{`→ ${run.result}`}</span>
        )}
        {hasError && (
          <span className="text-red-600 dark:text-red-400">{run.error}</span>
        )}
        {!hasLogs && !hasResult && !hasError && (
          <span className="italic text-os-text-secondary">
            {t("apps.chats.toolCalls.runJs.noOutput", {
              defaultValue: "(no output)",
            })}
          </span>
        )}
      </pre>
    </div>
  );
}
