/**
 * Minimal transactional-email sender used for account recovery.
 *
 * Uses the Resend REST API (https://resend.com) via `fetch` so no SDK
 * dependency is required. Email is an OPTIONAL channel: when `RESEND_API_KEY`
 * or `RECOVERY_EMAIL_FROM` is not configured the helper no-ops and reports it
 * was not sent, so the recovery flow gracefully falls back to Telegram.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function getRecoveryEmailFrom(): string | null {
  const from = process.env.RECOVERY_EMAIL_FROM?.trim();
  return from && from.length > 0 ? from : null;
}

/**
 * Whether outbound recovery email is fully configured (API key + from address).
 */
export function isEmailConfigured(): boolean {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  return !!apiKey && apiKey.length > 0 && !!getRecoveryEmailFrom();
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fetchImpl?: typeof fetch;
}

export interface SendEmailResult {
  sent: boolean;
  /** Why the email was not sent (when `sent` is false). */
  reason?: "not_configured" | "error";
  error?: string;
}

/**
 * Send a transactional email. Returns `{ sent: false, reason: "not_configured" }`
 * when no provider is configured (never throws for that case). Provider errors
 * are caught and surfaced via `{ sent: false, reason: "error" }`.
 */
export async function sendEmail({
  to,
  subject,
  text,
  html,
  fetchImpl = fetch,
}: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = getRecoveryEmailFrom();
  if (!apiKey || !from) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
      }),
    });

    if (response.ok) {
      return { sent: true };
    }

    const body = await response.text().catch(() => "");
    return {
      sent: false,
      reason: "error",
      error: `Resend responded ${response.status}${body ? `: ${body}` : ""}`,
    };
  } catch (error) {
    return {
      sent: false,
      reason: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
