/**
 * GET /api/auth/email/status
 *
 * Return the authenticated user's recovery-email state for the account UI.
 * The address is masked so a hijacked session cannot read the full email.
 */

import { apiHandler } from "../../_utils/api-handler.js";
import { getStoredUserRecord } from "../../_utils/auth/_user-record.js";
import { isEmailConfigured } from "../../_utils/email.js";

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(1, local.length - 1))}${domain}`;
}

export default apiHandler(
  {
    methods: ["GET"],
    auth: "required",
    allowExpiredAuth: true,
  },
  async ({ res, redis, logger, startTime, user }) => {
    const username = user?.username || "";
    if (!username) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const record = await getStoredUserRecord(redis, username);
    const email = record?.email || null;

    logger.response(200, Date.now() - startTime);
    res.status(200).json({
      hasEmail: !!email,
      email: email ? maskEmail(email) : null,
      emailVerified: !!record?.emailVerified,
      emailConfigured: isEmailConfigured(),
    });
  }
);
