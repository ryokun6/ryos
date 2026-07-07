/**
 * Shared types for the `getLocation` chat tool.
 *
 * The tool is client-executed (browser geolocation) and approval-gated: the
 * server marks it `needsApproval`, the chat UI renders an Allow / Don't Allow
 * prompt, and the handler only runs after the user approves.
 */

export interface GetLocationInput {
  /** Short reason shown to the user in the permission prompt. */
  reason?: string;
}

export interface GetLocationOutput {
  success: boolean;
  message: string;
  error?: string;
  latitude?: number;
  longitude?: number;
  /** Reported GPS accuracy radius in meters, when available. */
  accuracyMeters?: number;
  /** Reverse-geocoded locality name, when resolvable. */
  city?: string | null;
}
