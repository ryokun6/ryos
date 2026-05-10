/**
 * Applet iframe sandbox helpers.
 *
 * Applets are arbitrary user-supplied HTML rendered in an iframe via
 * `srcdoc`. By default we run them in a strict sandbox (no
 * `allow-same-origin`) so that hostile applet JS cannot:
 *   - read the parent's localStorage/IndexedDB,
 *   - call `/api/*` endpoints with the visiting user's `ryos_auth`
 *     cookie, or
 *   - touch the parent DOM.
 *
 * Applets created by the admin user (`ryo`) are treated as trusted —
 * they get the same-origin powers and the auth bridge so that
 * first-party experiences (e.g. ones that hit `/api/applet-ai`) keep
 * working.
 *
 * The trust decision is intentionally based on the applet's stored
 * `createdBy` field (which is set server-side from the authenticated
 * username when the applet is first published via `POST
 * /api/share-applet`). Locally-created applets that have never been
 * shared also carry their creator in the file metadata.
 */

const TRUSTED_APPLET_AUTHORS = new Set(["ryo"]);

/** Sandbox attribute used for trusted (ryo-authored) applets. */
export const TRUSTED_APPLET_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation";

/**
 * Sandbox attribute used for untrusted (community-authored) applets.
 *
 * Notably omits `allow-same-origin`, which gives the iframe an opaque
 * origin: cookies are not sent on `/api/*` requests, and the parent
 * page is unreadable.
 */
export const UNTRUSTED_APPLET_SANDBOX =
  "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-pointer-lock allow-downloads allow-storage-access-by-user-activation";

export function isTrustedAppletAuthor(
  createdBy: string | null | undefined
): boolean {
  if (!createdBy) return false;
  return TRUSTED_APPLET_AUTHORS.has(createdBy.toLowerCase());
}

export function getAppletSandboxAttribute(
  createdBy: string | null | undefined
): string {
  return isTrustedAppletAuthor(createdBy)
    ? TRUSTED_APPLET_SANDBOX
    : UNTRUSTED_APPLET_SANDBOX;
}
